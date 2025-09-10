import { google } from "googleapis";

// OAuth2 configuration interface
interface OAuth2Config {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  refreshToken: string;
}

// Get OAuth2 configuration from environment variables
const getOAuth2Config = (): OAuth2Config => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !redirectUri || !refreshToken) {
    const missing = [];
    if (!clientId) missing.push("GOOGLE_CLIENT_ID");
    if (!clientSecret) missing.push("GOOGLE_CLIENT_SECRET");
    if (!redirectUri) missing.push("GOOGLE_REDIRECT_URI");
    if (!refreshToken) missing.push("GOOGLE_REFRESH_TOKEN");

    throw new Error(
      `Missing required OAuth2 environment variables: ${missing.join(", ")}`
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    refreshToken,
  };
};

// Create OAuth2 client with refresh token
export const createOAuth2Client = () => {
  const config = getOAuth2Config();

  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );

  oauth2Client.setCredentials({
    refresh_token: config.refreshToken,
  });

  return oauth2Client;
};

// Create Google Auth for GA4
export const createGA4Auth = () => {
  return createOAuth2Client();
};

// Create Google Auth for GSC
export const createGSCAuth = () => {
  return createOAuth2Client();
};

// Create Google Auth with custom configuration
export const createCustomAuth = () => {
  return createOAuth2Client();
};

// Note: Scopes are handled when the refresh token was initially obtained.
// The OAuth2 client will use the scopes that were granted during the initial authorization.
//
// Combined scopes for all Google APIs (managed via /api/auth routes):
// - GA4: https://www.googleapis.com/auth/analytics.readonly
// - GSC: https://www.googleapis.com/auth/webmasters.readonly
// - GBP: https://www.googleapis.com/auth/business.manage
//
// To refresh or obtain new tokens with updated scopes, use:
// GET /api/auth/auth/url - Get authorization URL
// GET /api/auth/auth/scopes - View all required scopes
// GET /api/auth/auth/validate - Validate current token
