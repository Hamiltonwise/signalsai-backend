import { google } from "googleapis";
import { db } from "../database/connection";

// OAuth2 configuration interface
interface OAuth2Config {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

// Get OAuth2 configuration from environment variables
const getOAuth2Config = (): OAuth2Config => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    const missing = [];
    if (!clientId) missing.push("GOOGLE_CLIENT_ID");
    if (!clientSecret) missing.push("GOOGLE_CLIENT_SECRET");
    if (!redirectUri) missing.push("GOOGLE_REDIRECT_URI");

    throw new Error(
      `Missing required OAuth2 environment variables: ${missing.join(", ")}`
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
  };
};

/**
 * Create OAuth2 client for a specific Google account (multi-tenant)
 * This fetches the refresh token from the database for the given googleAccountId
 *
 * @param googleAccountId - The ID from google_accounts table
 * @returns OAuth2Client configured with the user's refresh token
 */
export const createOAuth2ClientForAccount = async (googleAccountId: number) => {
  const config = getOAuth2Config();

  // Fetch the Google account from database
  const googleAccount = await db("google_accounts")
    .where({ id: googleAccountId })
    .first();

  if (!googleAccount) {
    throw new Error(`Google account not found: ${googleAccountId}`);
  }

  if (!googleAccount.refresh_token) {
    throw new Error(
      `No refresh token found for Google account: ${googleAccountId}`
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );

  oauth2Client.setCredentials({
    refresh_token: googleAccount.refresh_token,
    access_token: googleAccount.access_token || undefined,
  });

  return oauth2Client;
};

/**
 * Legacy: Create OAuth2 client with refresh token from environment variable
 * This is for backward compatibility with single-tenant setup
 * @deprecated Use createOAuth2ClientForAccount for multi-tenant support
 */
export const createOAuth2Client = () => {
  const config = getOAuth2Config();
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!refreshToken) {
    throw new Error("Missing GOOGLE_REFRESH_TOKEN environment variable");
  }

  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });

  return oauth2Client;
};

// Legacy aliases for backward compatibility
export const createGA4Auth = createOAuth2Client;
export const createGSCAuth = createOAuth2Client;
export const createCustomAuth = createOAuth2Client;

// Note: For multi-tenant applications, use createOAuth2ClientForAccount instead
// Combined scopes for all Google APIs (managed via /api/auth routes):
// - GA4: https://www.googleapis.com/auth/analytics.readonly
// - GSC: https://www.googleapis.com/auth/webmasters.readonly
// - GBP: https://www.googleapis.com/auth/business.manage
