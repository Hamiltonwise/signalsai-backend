import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

/**
 * Required environment variables for OAuth2 configuration
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

/**
 * Validates that all required environment variables are present.
 * @throws {Error} If any required environment variables are missing
 */
export function validateEnvironmentVariables(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        "Please check your .env file configuration.",
    );
  }
}

/**
 * Creates a new OAuth2 client instance with proper configuration.
 * Validates environment variables before creating the client.
 * @returns Configured OAuth2 client
 */
export function createOAuth2Client(): OAuth2Client {
  validateEnvironmentVariables();

  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!,
  );
}
