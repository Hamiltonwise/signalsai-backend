/**
 * Multi-Tenant Google OAuth Integration Route
 *
 * This file implements a complete multi-tenant Google OAuth integration system
 * that handles user authentication, token management, and database operations
 * for GA4, GSC, and GBP APIs.
 *
 * Features:
 * - Automatic user creation from Google authentication
 * - Multi-tenant Google account management
 * - Token storage and refresh handling
 * - Production-ready error handling and logging
 * - TypeScript interfaces and proper typing
 * - Database transactions for data consistency
 *
 * @author SignalsAI Backend
 * @version 1.0.0
 */

import express, { Request, Response, NextFunction } from "express";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { Knex } from "knex";
import * as dotenv from "dotenv";
import { db } from "../database/connection";

// Load environment variables
dotenv.config();

// Create Express router
const router = express.Router();

// =====================================================================
// TYPES AND INTERFACES
// =====================================================================

/**
 * User database model interface
 */
interface User {
  id: number;
  email: string;
  name?: string;
  password_hash?: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Google Account database model interface
 */
interface GoogleAccount {
  id: number;
  user_id: number;
  google_user_id: string;
  email: string;
  refresh_token: string;
  access_token?: string;
  token_type?: string;
  expiry_date?: Date;
  scopes?: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Google Property database model interface
 */
interface GoogleProperty {
  id: number;
  google_account_id: number;
  type: "ga4" | "gsc" | "gbp";
  external_id: string;
  display_name?: string;
  metadata?: any;
  selected: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Google user profile from OAuth response
 */
interface GoogleUserProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
  verified_email?: boolean;
}

/**
 * API response for auth URL generation
 */
interface AuthUrlResponse {
  success: boolean;
  authUrl: string;
  state?: string;
  scopes: string[];
  message: string;
}

/**
 * API response for OAuth callback
 */
interface CallbackResponse {
  success: boolean;
  user: User;
  googleAccount: GoogleAccount;
  message: string;
  accessToken?: string;
  expiresAt?: Date;
  googleAccountId?: number; // Added for multi-tenant token refresh
}

/**
 * Error response interface
 */
interface ErrorResponse {
  error: string;
  message: string;
  details?: any;
  timestamp: string;
}

// =====================================================================
// CONFIGURATION AND CONSTANTS
// =====================================================================

/**
 * Required OAuth scopes for all Google APIs
 */
const REQUIRED_SCOPES = [
  "openid", // OpenID Connect - required for user identity
  "email", // Email access - required for user email
  "profile", // Profile access - required for user profile info
  "https://www.googleapis.com/auth/analytics.readonly", // GA4
  "https://www.googleapis.com/auth/webmasters.readonly", // GSC
  "https://www.googleapis.com/auth/business.manage", // GBP
] as const;

/**
 * Required environment variables
 */
const REQUIRED_ENV_VARS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "DB_HOST",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
] as const;

// =====================================================================
// UTILITY FUNCTIONS
// =====================================================================

/**
 * Validates that all required environment variables are present
 * @throws {Error} If any required environment variables are missing
 */
function validateEnvironmentVariables(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        "Please check your .env file configuration."
    );
  }
}

/**
 * Creates a new OAuth2 client instance with proper configuration
 * @returns {OAuth2Client} Configured OAuth2 client
 */
function createOAuth2Client(): OAuth2Client {
  validateEnvironmentVariables();

  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!
  );
}

/**
 * Generates a secure random state parameter for CSRF protection
 * @returns {string} Random state string
 */
function generateSecureState(): string {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

/**
 * Enhanced error handler for API responses
 * @param res Express response object
 * @param error Error object or message
 * @param operation Operation name for logging
 * @returns Express response
 */
function handleError(res: Response, error: any, operation: string): Response {
  const errorDetails = {
    operation,
    message: error?.message || "Unknown error occurred",
    status: error?.response?.status || error?.status || 500,
    timestamp: new Date().toISOString(),
    stack: process.env.NODE_ENV === "development" ? error?.stack : undefined,
  };

  console.error(`[AUTH ERROR] ${operation}:`, {
    ...errorDetails,
    ...(error?.response?.data && { googleApiError: error.response.data }),
  });

  const response: ErrorResponse = {
    error: `Failed to ${operation.toLowerCase()}`,
    message: errorDetails.message,
    timestamp: errorDetails.timestamp,
    ...(process.env.NODE_ENV === "development" && {
      details: errorDetails,
    }),
  };

  return res.status(errorDetails.status).json(response);
}

/**
 * Request logging middleware
 */
function logRequest(req: Request, res: Response, next: NextFunction): void {
  console.log(`[AUTH] ${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.headers["user-agent"]?.substring(0, 100),
    timestamp: new Date().toISOString(),
    query: req.query,
    ...(req.method === "POST" && { bodyKeys: Object.keys(req.body || {}) }),
  });
  next();
}

// =====================================================================
// DATABASE OPERATIONS
// =====================================================================

/**
 * Finds an existing user by email or creates a new one
 * @param email User's email address
 * @param name User's display name (optional)
 * @returns Promise resolving to User object
 */
async function findOrCreateUser(email: string, name?: string): Promise<User> {
  try {
    // Check if user already exists
    const existingUser = await db("users")
      .where({ email: email.toLowerCase() })
      .first();

    if (existingUser) {
      console.log(`[AUTH] Found existing user: ${email}`);
      return existingUser;
    }

    // Create new user
    const userData = {
      email: email.toLowerCase(),
      name: name || email.split("@")[0], // Use email prefix as fallback name
      created_at: new Date(),
      updated_at: new Date(),
    };

    const [userId] = await db("users").insert(userData);
    const newUser = await db("users").where({ id: userId }).first();

    console.log(`[AUTH] Created new user: ${email} (ID: ${userId})`);
    return newUser;
  } catch (error) {
    console.error("[AUTH] Error in findOrCreateUser:", error);
    throw new Error(
      `Failed to create or find user: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Creates or updates a Google account record for a user
 * @param userId Internal user ID
 * @param googleProfile Google user profile data
 * @param tokens OAuth tokens from Google
 * @returns Promise resolving to GoogleAccount object
 */
async function upsertGoogleAccount(
  userId: number,
  googleProfile: GoogleUserProfile,
  tokens: any
): Promise<GoogleAccount> {
  try {
    const accountData = {
      user_id: userId,
      google_user_id: googleProfile.id,
      email: googleProfile.email.toLowerCase(),
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      token_type: tokens.token_type || "Bearer",
      expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      scopes: tokens.scope || REQUIRED_SCOPES.join(","),
      updated_at: new Date(),
    };

    // Check if Google account already exists for this user
    const existingAccount = await db("google_accounts")
      .where({
        google_user_id: googleProfile.id,
        user_id: userId,
      })
      .first();

    if (existingAccount) {
      // Update existing account
      await db("google_accounts")
        .where({ id: existingAccount.id })
        .update(accountData);

      console.log(`[AUTH] Updated Google account for user ${userId}`);
      return { ...existingAccount, ...accountData };
    } else {
      // Create new Google account
      const [accountId] = await db("google_accounts").insert({
        ...accountData,
        created_at: new Date(),
      });

      const newAccount = await db("google_accounts")
        .where({ id: accountId })
        .first();

      console.log(`[AUTH] Created new Google account for user ${userId}`);
      return newAccount;
    }
  } catch (error) {
    console.error("[AUTH] Error in upsertGoogleAccount:", error);
    throw new Error(
      `Failed to create or update Google account: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Refreshes an access token using the stored refresh token
 * @param googleAccountId Google account database ID
 * @returns Promise resolving to updated GoogleAccount
 */
async function refreshAccessToken(
  googleAccountId: number
): Promise<GoogleAccount> {
  try {
    const googleAccount = await db("google_accounts")
      .where({ id: googleAccountId })
      .first();

    if (!googleAccount || !googleAccount.refresh_token) {
      throw new Error("Google account not found or missing refresh token");
    }

    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({
      refresh_token: googleAccount.refresh_token,
    });

    const { token } = await oauth2Client.getAccessToken();

    if (token) {
      const updatedData = {
        access_token: token,
        updated_at: new Date(),
      };

      await db("google_accounts")
        .where({ id: googleAccountId })
        .update(updatedData);

      return { ...googleAccount, ...updatedData };
    } else {
      throw new Error("Failed to refresh access token");
    }
  } catch (error) {
    console.error("[AUTH] Error refreshing access token:", error);
    throw error;
  }
}

// =====================================================================
// API ROUTES
// =====================================================================

/**
 * GET /auth/google
 *
 * Generates Google OAuth consent screen URL with required scopes.
 * This endpoint initiates the OAuth flow by providing an authorization URL
 * that users can visit to grant permissions for GA4, GSC, and GBP APIs.
 *
 * Query Parameters:
 * - state (optional): Custom state parameter for CSRF protection
 *
 * Response:
 * - success: boolean
 * - authUrl: string - URL to redirect user for OAuth consent
 * - scopes: string[] - List of requested OAuth scopes
 * - message: string - Human-readable success message
 */
router.get("/ttim", async (req: Request, res: Response) => {
  return res.json("hello");
});

router.get("/google", async (req: Request, res: Response) => {
  try {
    console.log("[AUTH] Generating OAuth authorization URL");

    validateEnvironmentVariables();
    const oauth2Client = createOAuth2Client();

    // Generate secure state parameter if not provided
    const state = (req.query.state as string) || generateSecureState();

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline", // Request refresh token
      prompt: "consent", // Force consent screen to get refresh token
      include_granted_scopes: true, // Include previously granted scopes
      scope: [...REQUIRED_SCOPES], // Request all required scopes
      state: state, // CSRF protection
    });

    console.log("[AUTH] Generated authorization URL successfully");
    console.log(`[AUTH] Scopes requested: ${REQUIRED_SCOPES.join(", ")}`);

    const response: AuthUrlResponse = {
      success: true,
      authUrl,
      state,
      scopes: [...REQUIRED_SCOPES],
      message:
        "Authorization URL generated successfully. Visit authUrl to grant permissions.",
    };

    res.json(response);
  } catch (error) {
    return handleError(res, error, "Generate OAuth authorization URL");
  }
});
/**
 * Shared OAuth callback handler function
 * Processes OAuth callback from Google after user grants permissions
 *
 * @param req Express request object
 * @param res Express response object
 */
async function handleOAuthCallback(req: Request, res: Response): Promise<void> {
  try {
    const { code, state, error } = req.query;

    console.log("[AUTH] Processing OAuth callback", {
      hasCode: !!code,
      hasState: !!state,
      error: error || "none",
    });

    // Handle OAuth errors
    if (error) {
      console.error("[AUTH] OAuth authorization failed:", error);
      res.status(400).json({
        success: false,
        error: "OAuth authorization failed",
        message: error as string,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Validate required parameters
    if (!code) {
      res.status(400).json({
        success: false,
        error: "Missing authorization code",
        message: "Authorization code is required to complete OAuth flow",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    validateEnvironmentVariables();
    const oauth2Client = createOAuth2Client();

    // Exchange authorization code for tokens
    console.log("[AUTH] Exchanging authorization code for tokens");
    const { tokens } = await oauth2Client.getToken(code as string);

    // CRITICAL: Set credentials on client BEFORE using it
    oauth2Client.setCredentials(tokens);

    if (!tokens.refresh_token) {
      console.warn(
        "[AUTH] No refresh token received - user may have already authorized"
      );
    }

    console.log("[AUTH] OAuth tokens received:", {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiryDate: tokens.expiry_date,
      scopes: tokens.scope,
      // Log first and last 10 chars for debugging (secure)
      accessTokenPreview: tokens.access_token
        ? `${tokens.access_token.substring(
            0,
            10
          )}...${tokens.access_token.substring(
            tokens.access_token.length - 10
          )}`
        : "NONE",
      accessTokenLength: tokens.access_token?.length || 0,
    });

    // Verify we have an access token
    if (!tokens.access_token) {
      throw new Error("No access token received from Google OAuth");
    }

    // Fetch user profile from Google using direct fetch (bypasses oauth2Client auth issues)
    console.log("[AUTH] Fetching user profile from Google");
    console.log("[AUTH] Using access token:", {
      preview: `${tokens.access_token.substring(
        0,
        10
      )}...${tokens.access_token.substring(tokens.access_token.length - 10)}`,
      length: tokens.access_token.length,
      authHeader: `Bearer ${tokens.access_token.substring(0, 20)}...`,
    });

    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      }
    );

    if (!userInfoResponse.ok) {
      const errorText = await userInfoResponse.text();
      throw new Error(
        `Failed to fetch user profile: ${userInfoResponse.status} ${userInfoResponse.statusText}. ${errorText}`
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

    // Database transaction for user and account creation/update with proper error handling
    console.log("[AUTH] Starting database transaction");

    let result;
    try {
      result = await db.transaction(async (trx) => {
        // Create or find user (using transaction context)
        const existingUser = await trx("users")
          .where({ email: googleProfile.email.toLowerCase() })
          .first();

        let user: User;
        if (existingUser) {
          console.log(`[AUTH] Found existing user: ${googleProfile.email}`);
          user = existingUser;
        } else {
          const userData = {
            email: googleProfile.email.toLowerCase(),
            name: googleProfile.name,
            created_at: new Date(),
            updated_at: new Date(),
          };

          user = (await trx("users").insert(userData).returning("*"))[0];
          console.log(
            `[AUTH] Created new user: ${googleProfile.email} (ID: ${user.id})`
          );
        }

        // Create or update Google account (using transaction context)
        const accountData = {
          user_id: user.id,
          google_user_id: googleProfile.id,
          email: googleProfile.email.toLowerCase(),
          refresh_token: tokens.refresh_token,
          access_token: tokens.access_token,
          token_type: tokens.token_type || "Bearer",
          expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          scopes: tokens.scope || REQUIRED_SCOPES.join(","),
          updated_at: new Date(),
        };

        const existingAccount = await trx("google_accounts")
          .where({
            google_user_id: googleProfile.id,
            user_id: user.id,
          })
          .first();

        let googleAccount: GoogleAccount;
        if (existingAccount) {
          // Update existing account
          await trx("google_accounts")
            .where({ id: existingAccount.id })
            .update(accountData);

          googleAccount = { ...existingAccount, ...accountData };
          console.log(`[AUTH] Updated Google account for user ${user.id}`);
        } else {
          // Create new Google account
          googleAccount = (
            await trx("google_accounts")
              .insert({
                ...accountData,
                created_at: new Date(),
              })
              .returning("*")
          )[0];

          console.log(`[AUTH] Created new Google account for user ${user.id}`);
        }

        return { user, googleAccount };
      });

      console.log("[AUTH] Database transaction completed successfully");
    } catch (transactionError: any) {
      console.error("[AUTH] Database transaction failed:", {
        error: transactionError.message,
        code: transactionError.code,
        errno: transactionError.errno,
      });

      // If transaction fails, try non-transactional approach as fallback
      console.log("[AUTH] Attempting fallback non-transactional save...");

      try {
        // Find or create user without transaction
        let user = await db("users")
          .where({ email: googleProfile.email.toLowerCase() })
          .first();

        if (!user) {
          const userData = {
            email: googleProfile.email.toLowerCase(),
            name: googleProfile.name,
            created_at: new Date(),
            updated_at: new Date(),
          };
          user = (await db("users").insert(userData).returning("*"))[0];
        }

        // Find or create Google account without transaction
        let googleAccount = await db("google_accounts")
          .where({
            google_user_id: googleProfile.id,
            user_id: user.id,
          })
          .first();

        const accountData = {
          user_id: user.id,
          google_user_id: googleProfile.id,
          email: googleProfile.email.toLowerCase(),
          refresh_token: tokens.refresh_token,
          access_token: tokens.access_token,
          token_type: tokens.token_type || "Bearer",
          expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          scopes: tokens.scope || REQUIRED_SCOPES.join(","),
          updated_at: new Date(),
        };

        if (googleAccount) {
          await db("google_accounts")
            .where({ id: googleAccount.id })
            .update(accountData);
          googleAccount = { ...googleAccount, ...accountData };
        } else {
          googleAccount = (
            await db("google_accounts")
              .insert({
                ...accountData,
                created_at: new Date(),
              })
              .returning("*")
          )[0];
        }

        result = { user, googleAccount };
        console.log("[AUTH] Fallback non-transactional save completed");
      } catch (fallbackError) {
        console.error("[AUTH] Fallback save also failed:", fallbackError);
        throw transactionError; // Throw original transaction error
      }
    }

    const response: CallbackResponse = {
      success: true,
      user: result.user,
      googleAccount: result.googleAccount,
      message: `OAuth authorization successful for ${googleProfile.email}`,
      accessToken: tokens.access_token || undefined,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      googleAccountId: result.googleAccount.id, // Added for multi-tenant token refresh
    };

    console.log(
      `[AUTH] OAuth flow completed successfully for user: ${googleProfile.email}`
    );

    // Return HTML that posts message to parent window and closes popup
    const htmlResponse = `
<!DOCTYPE html>
<html>
<head>
  <title>Authentication Successful</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .container {
      text-align: center;
      padding: 2rem;
    }
    .success-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
    h1 {
      margin: 0 0 1rem 0;
      font-size: 1.75rem;
    }
    p {
      margin: 0;
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="success-icon">✓</div>
    <h1>Authentication Successful!</h1>
    <p>This window will close automatically...</p>
  </div>
  <script>
    // Send success message to parent window
    // Use "*" as target origin because cross-origin redirects break origin matching
    // Security is handled by origin validation in the frontend message handler
    if (window.opener) {
      window.opener.postMessage(
        {
          type: 'GOOGLE_OAUTH_SUCCESS',
          payload: ${JSON.stringify(response)}
        },
        '*'
      );
    }
    
    // Close popup after a short delay
    setTimeout(() => {
      window.close();
    }, 1500);
  </script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html");
    res.send(htmlResponse);
  } catch (error) {
    console.error("[AUTH] OAuth callback error:", error);
    handleError(res, error, "Process OAuth callback");
  }
}

/**
 * GET /callback
 *
 * Alternative callback endpoint for Google OAuth (without /google prefix)
 * This matches Google's redirect URI when configured as /api/auth/callback
 *
 * Query Parameters:
 * - code: string - Authorization code from Google OAuth
 * - state: string - State parameter for CSRF validation
 * - error: string - Error message if authorization failed
 *
 * Response: Same as /auth/google/callback
 */
router.get("/callback", handleOAuthCallback);

/**
 * GET /auth/google/callback
 *
 * Handles the OAuth callback from Google after user grants permissions.
 * This endpoint:
 * 1. Exchanges authorization code for access/refresh tokens
 * 2. Fetches user profile information from Google
 * 3. Creates or updates user record in database
 * 4. Stores OAuth tokens for future API calls
 *
 * Query Parameters:
 * - code: string - Authorization code from Google OAuth
 * - state: string - State parameter for CSRF validation
 * - error: string - Error message if authorization failed
 *
 * Response:
 * - success: boolean
 * - user: User object
 * - googleAccount: GoogleAccount object
 * - message: string
 * - accessToken: string (optional, for immediate use)
 * - expiresAt: Date (optional, token expiration)
 */
router.get("/google/callback", handleOAuthCallback);

// =====================================================================
// ADDITIONAL UTILITY ROUTES
// =====================================================================

/**
 * GET /auth/google/validate/:googleAccountId
 *
 * Validates and potentially refreshes OAuth tokens for a Google account
 */
router.get(
  "/google/validate/:googleAccountId",
  async (req: Request, res: Response) => {
    try {
      const { googleAccountId } = req.params;

      if (!googleAccountId || isNaN(Number(googleAccountId))) {
        return res.status(400).json({
          success: false,
          error: "Invalid Google account ID",
          timestamp: new Date().toISOString(),
        });
      }

      const googleAccount = await refreshAccessToken(Number(googleAccountId));

      res.json({
        success: true,
        message: "Token validated and refreshed successfully",
        expiresAt: googleAccount.expiry_date,
        scopes: googleAccount.scopes?.split(",") || REQUIRED_SCOPES,
      });
    } catch (error) {
      return handleError(res, error, "Validate OAuth tokens");
    }
  }
);

/**
 * GET /auth/google/scopes
 *
 * Returns information about required OAuth scopes
 */
router.get("/google/scopes", (req: Request, res: Response) => {
  res.json({
    success: true,
    requiredScopes: REQUIRED_SCOPES,
    scopeDescriptions: {
      "https://www.googleapis.com/auth/analytics.readonly":
        "Google Analytics 4 - Read access to analytics data and reports",
      "https://www.googleapis.com/auth/webmasters.readonly":
        "Google Search Console - Read access to search performance data",
      "https://www.googleapis.com/auth/business.manage":
        "Google Business Profile - Manage business listings and access insights",
    },
    apisCovered: [
      "Google Analytics 4 (GA4)",
      "Google Search Console (GSC)",
      "Google Business Profile (GBP)",
    ],
    message: "These scopes provide access to all required Google APIs",
  });
});

// =====================================================================
// ERROR HANDLING MIDDLEWARE
// =====================================================================

/**
 * Global error handler for auth routes
 */
router.use((error: any, req: Request, res: Response, next: NextFunction) => {
  console.error("[AUTH] Unhandled route error:", error);

  if (!res.headersSent) {
    return handleError(res, error, "Handle request");
  }

  next(error);
});

// =====================================================================
// EXPORTS
// =====================================================================

export default router;
export {
  createOAuth2Client,
  validateEnvironmentVariables,
  findOrCreateUser,
  upsertGoogleAccount,
  refreshAccessToken,
  REQUIRED_SCOPES,
};

// Type exports for use in other modules
export type {
  User,
  GoogleAccount,
  GoogleProperty,
  GoogleUserProfile,
  AuthUrlResponse,
  CallbackResponse,
  ErrorResponse,
};
