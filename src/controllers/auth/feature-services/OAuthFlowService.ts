import { OAuth2Client } from "google-auth-library";
import { db } from "../../../database/connection";
import { UserModel, IUser } from "../../../models/UserModel";
import { GoogleConnectionModel, IGoogleConnection } from "../../../models/GoogleConnectionModel";
import { OrganizationUserModel } from "../../../models/OrganizationUserModel";
import { QueryContext } from "../../../models/BaseModel";

/**
 * Google user profile from OAuth response
 */
export interface GoogleUserProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
  verified_email?: boolean;
}

/**
 * Required OAuth scopes for GBP API
 */
const REQUIRED_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/business.manage",
] as const;

/**
 * Result of the complete OAuth flow
 */
export interface OAuthFlowResult {
  user: IUser;
  googleAccount: IGoogleConnection;
}

/**
 * Exchanges an authorization code for OAuth tokens.
 *
 * @param oauth2Client The configured OAuth2 client
 * @param code Authorization code from Google OAuth callback
 * @returns Token credentials from Google
 */
export async function exchangeCodeForTokens(
  oauth2Client: OAuth2Client,
  code: string,
): Promise<any> {
  console.log("[AUTH] Exchanging authorization code for tokens");
  const { tokens } = await oauth2Client.getToken(code);

  // Set credentials on client BEFORE using it
  oauth2Client.setCredentials(tokens);

  if (!tokens.refresh_token) {
    console.warn(
      "[AUTH] No refresh token received - user may have already authorized",
    );
  }

  console.log("[AUTH] OAuth tokens received:", {
    hasAccessToken: !!tokens.access_token,
    hasRefreshToken: !!tokens.refresh_token,
    expiryDate: tokens.expiry_date,
    scopes: tokens.scope,
    accessTokenPreview: tokens.access_token
      ? `${tokens.access_token.substring(0, 10)}...${tokens.access_token.substring(
          tokens.access_token.length - 10,
        )}`
      : "NONE",
    accessTokenLength: tokens.access_token?.length || 0,
  });

  if (!tokens.access_token) {
    throw new Error("No access token received from Google OAuth");
  }

  return tokens;
}

/**
 * Fetches the user profile from Google using the access token.
 *
 * @param accessToken Valid Google OAuth access token
 * @returns Google user profile data
 */
export async function fetchGoogleUserProfile(
  accessToken: string,
): Promise<GoogleUserProfile> {
  console.log("[AUTH] Fetching user profile from Google");
  console.log("[AUTH] Using access token:", {
    preview: `${accessToken.substring(0, 10)}...${accessToken.substring(
      accessToken.length - 10,
    )}`,
    length: accessToken.length,
    authHeader: `Bearer ${accessToken.substring(0, 20)}...`,
  });

  const userInfoResponse = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!userInfoResponse.ok) {
    const errorText = await userInfoResponse.text();
    throw new Error(
      `Failed to fetch user profile: ${userInfoResponse.status} ${userInfoResponse.statusText}. ${errorText}`,
    );
  }

  const profile = await userInfoResponse.json();

  if (!profile.id || !profile.email) {
    throw new Error("Invalid user profile received from Google");
  }

  const googleProfile: GoogleUserProfile = {
    id: profile.id,
    email: profile.email,
    name: profile.name || profile.email.split("@")[0],
    picture: profile.picture || undefined,
    verified_email: profile.verified_email || undefined,
  };

  console.log("[AUTH] Google profile fetched:", {
    id: googleProfile.id,
    email: googleProfile.email,
    name: googleProfile.name,
    verified: googleProfile.verified_email,
  });

  return googleProfile;
}

/**
 * Builds the account data object for Google account creation/update.
 */
function buildAccountData(
  userId: number,
  googleProfile: GoogleUserProfile,
  tokens: any,
): Partial<IGoogleConnection> {
  return {
    user_id: userId,
    google_user_id: googleProfile.id,
    email: googleProfile.email.toLowerCase(),
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    token_type: tokens.token_type || "Bearer",
    expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    scopes: tokens.scope || REQUIRED_SCOPES.join(","),
  };
}

/**
 * Ensures the user has an organization relationship with admin role for OAuth users.
 * Used within a transaction context.
 *
 * @param userId User's internal ID
 * @param organizationId Organization ID to link
 * @param trx Optional transaction context
 */
async function ensureOrganizationLink(
  userId: number,
  organizationId: number,
  trx?: QueryContext,
): Promise<void> {
  const orgUser = await OrganizationUserModel.findByUserAndOrg(
    userId,
    organizationId,
    trx,
  );

  if (!orgUser) {
    await OrganizationUserModel.create(
      {
        user_id: userId,
        organization_id: organizationId,
        role: "admin",
      },
      trx,
    );
    console.log(
      `[AUTH] Created admin role for user ${userId} in organization`,
    );
  }
}

/**
 * Completes the OAuth flow using a database transaction.
 * Creates or updates the user and Google account atomically.
 *
 * @param tokens OAuth tokens from Google
 * @param googleProfile Fetched Google user profile
 * @returns User and Google account created/updated within the transaction
 */
export async function completeOAuthFlow(
  tokens: any,
  googleProfile: GoogleUserProfile,
): Promise<OAuthFlowResult> {
  console.log("[AUTH] Starting database transaction");

  const result = await db.transaction(async (trx) => {
    // Find or create user within transaction
    const user = await UserModel.findOrCreate(
      googleProfile.email,
      googleProfile.name,
      trx,
    );

    if (user.created_at && (user.created_at as any) === user.updated_at) {
      // Newly created -- logged by UserModel
    }
    console.log(`[AUTH] User resolved: ${googleProfile.email} (ID: ${user.id})`);

    // Build account data
    const accountData = buildAccountData(user.id, googleProfile, tokens);

    // Find or upsert Google account within transaction
    const existingAccount = await GoogleConnectionModel.findByGoogleUserId(
      googleProfile.id,
      user.id,
      trx,
    );

    let googleAccount: IGoogleConnection;
    if (existingAccount) {
      await GoogleConnectionModel.updateById(existingAccount.id, accountData, trx);
      googleAccount = { ...existingAccount, ...accountData } as IGoogleConnection;
      console.log(`[AUTH] Updated Google account for user ${user.id}`);
    } else {
      googleAccount = await GoogleConnectionModel.create(accountData, trx);
      console.log(`[AUTH] Created new Google account for user ${user.id}`);
    }

    // Ensure organization link if applicable
    if (googleAccount.organization_id) {
      await ensureOrganizationLink(user.id, googleAccount.organization_id, trx);
    }

    return { user, googleAccount };
  });

  console.log("[AUTH] Database transaction completed successfully");
  return result;
}

/**
 * Fallback non-transactional save when the transaction fails.
 * Preserves the same create/update logic but without atomicity guarantees.
 *
 * @param tokens OAuth tokens from Google
 * @param googleProfile Fetched Google user profile
 * @returns User and Google account
 */
export async function handleFallbackAuth(
  tokens: any,
  googleProfile: GoogleUserProfile,
): Promise<OAuthFlowResult> {
  console.log("[AUTH] Attempting fallback non-transactional save...");

  // Find or create user without transaction
  const user = await UserModel.findOrCreate(
    googleProfile.email,
    googleProfile.name,
  );

  // Build account data
  const accountData = buildAccountData(user.id, googleProfile, tokens);

  // Find or upsert Google account without transaction
  const existingAccount = await GoogleConnectionModel.findByGoogleUserId(
    googleProfile.id,
    user.id,
  );

  let googleAccount: IGoogleConnection;
  if (existingAccount) {
    await GoogleConnectionModel.updateById(existingAccount.id, accountData);
    googleAccount = { ...existingAccount, ...accountData } as IGoogleConnection;
  } else {
    googleAccount = await GoogleConnectionModel.create(accountData);
  }

  console.log("[AUTH] Fallback non-transactional save completed");
  return { user, googleAccount };
}

/**
 * Gets the user's role for the response payload.
 * Defaults to "admin" for OAuth users.
 *
 * @param userId User's internal ID
 * @param organizationId Organization ID (may be null)
 * @returns Role string
 */
export async function getUserRole(
  userId: number,
  organizationId: number | null | undefined,
): Promise<string> {
  let userRole = "admin"; // Default for OAuth users
  if (organizationId) {
    const orgUser = await OrganizationUserModel.findByUserAndOrg(
      userId,
      organizationId,
    );
    if (orgUser) {
      userRole = orgUser.role;
    }
  }
  return userRole;
}
