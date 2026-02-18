import { validateOAuth2Config } from "../utils/oauthConfig";
import { REQUIRED_SCOPES } from "../utils/scopeDefinitions";
import { refreshAccessToken } from "./OAuth2Service";

interface TokenValidationResult {
  valid: boolean;
  message: string;
  hasRefreshToken?: boolean;
  scopes?: string[];
}

// Validates the stored refresh token by attempting to refresh the access token
export const validateRefreshToken = async (): Promise<TokenValidationResult> => {
  validateOAuth2Config();

  const token = await refreshAccessToken();

  if (token) {
    return {
      valid: true,
      message: "OAuth2 token is valid and can be refreshed",
      hasRefreshToken: true,
      scopes: REQUIRED_SCOPES,
    };
  }

  return {
    valid: false,
    message: "Failed to refresh access token",
  };
};
