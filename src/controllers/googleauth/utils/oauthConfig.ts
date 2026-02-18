// OAuth2 configuration extracted from environment variables
export const OAUTH2_CONFIG = {
  clientId: process.env.GOOGLE_CLIENT_ID || "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  refreshToken: process.env.GOOGLE_REFRESH_TOKEN || "",
  redirectUri:
    process.env.GOOGLE_REDIRECT_URI ||
    "http://localhost:3000/api/auth/web-callback",
  email: "info@hamiltonwise.com",
};

// Validates all required OAuth2 environment variables are present
export const validateOAuth2Config = () => {
  const missing = [];
  if (!OAUTH2_CONFIG.clientId) missing.push("GOOGLE_CLIENT_ID");
  if (!OAUTH2_CONFIG.clientSecret) missing.push("GOOGLE_CLIENT_SECRET");
  if (!OAUTH2_CONFIG.refreshToken) missing.push("GOOGLE_REFRESH_TOKEN");

  if (missing.length > 0) {
    throw new Error(
      `Missing required OAuth2 environment variables: ${missing.join(", ")}. ` +
        `Please check .env.example for setup instructions.`
    );
  }
};

// Validates only clientId and clientSecret (for initial auth before refresh token exists)
export const validateInitialConfig = () => {
  const missing = [];
  if (!OAUTH2_CONFIG.clientId) missing.push("GOOGLE_CLIENT_ID");
  if (!OAUTH2_CONFIG.clientSecret) missing.push("GOOGLE_CLIENT_SECRET");

  if (missing.length > 0) {
    throw new Error(
      `Missing required OAuth2 environment variables for initial setup: ${missing.join(
        ", "
      )}. ` + `Please check .env.example for setup instructions.`
    );
  }
};
