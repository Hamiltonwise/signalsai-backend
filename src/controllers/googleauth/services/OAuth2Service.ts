import { google } from "googleapis";
import { Credentials } from "google-auth-library";
import { OAUTH2_CONFIG, validateInitialConfig } from "../utils/oauthConfig";
import { REQUIRED_SCOPES } from "../utils/scopeDefinitions";

// Creates OAuth2 client for initial authorization (doesn't require refresh token)
export const createInitialClient = () => {
  validateInitialConfig();

  return new google.auth.OAuth2(
    OAUTH2_CONFIG.clientId,
    OAUTH2_CONFIG.clientSecret,
    OAUTH2_CONFIG.redirectUri
  );
};

// Creates OAuth2 client with refresh token credentials set
export const createAuthenticatedClient = () => {
  const oauth2Client = new google.auth.OAuth2(
    OAUTH2_CONFIG.clientId,
    OAUTH2_CONFIG.clientSecret,
    OAUTH2_CONFIG.redirectUri
  );

  oauth2Client.setCredentials({
    refresh_token: OAUTH2_CONFIG.refreshToken,
  });

  return oauth2Client;
};

// Generates the OAuth2 consent URL with all required scopes
export const generateAuthorizationUrl = (): string => {
  const oauth2Client = createInitialClient();

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: REQUIRED_SCOPES,
    prompt: "consent", // Force consent screen to ensure refresh token
    include_granted_scopes: true, // Include previously granted scopes
  });
};

// Exchanges an authorization code for tokens
export const exchangeCodeForTokens = async (
  code: string
): Promise<Credentials> => {
  const oauth2Client = createInitialClient();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
};

// Refreshes the access token using the stored refresh token
export const refreshAccessToken = async (): Promise<string | null | undefined> => {
  const oauth2Client = createAuthenticatedClient();
  const { token } = await oauth2Client.getAccessToken();
  return token;
};
