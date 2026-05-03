import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { db } from "../database/connection";

// OAuth2 configuration interface
interface OAuth2Config {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Register a `tokens` event handler on an OAuth2Client so that any
 * access-token refresh -- whether triggered explicitly via
 * `refreshAccessToken()` or transparently by the googleapis library
 * during an API call -- is persisted back to `google_connections`.
 *
 * Without this handler, the library refreshes on demand at call time
 * but the new access_token + expiry_date never lands in the database;
 * the row stays frozen at the last manual reconnection. The Phase 1
 * verification on May 2 caught Garrison in this exact state (token
 * expired since April 12, but polling still worked because the library
 * refreshed under the hood). This handler fixes the write-back gap.
 *
 * The handler is best-effort: a DB write failure logs and does not
 * abort the API call in flight. The next refresh will retry.
 */
export function attachTokenWriteBack(
  oauth2Client: OAuth2Client,
  connectionId: number,
): void {
  oauth2Client.on("tokens", (tokens) => {
    if (!tokens.access_token) return;
    const expiry = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600000);
    const update: Record<string, unknown> = {
      access_token: tokens.access_token,
      expiry_date: expiry,
      updated_at: new Date(),
    };
    // googleapis re-emits the refresh_token on first token issuance only.
    // Subsequent refreshes don't include it. Only update when present so
    // we don't blank a known-good refresh_token.
    if (tokens.refresh_token) {
      update.refresh_token = tokens.refresh_token;
    }
    db("google_connections")
      .where({ id: connectionId })
      .update(update)
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          `[OAuth Helper] tokens write-back failed for connection ${connectionId}: ${message}`,
        );
      });
  });
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
 * Create OAuth2 client for a specific Google connection.
 * Fetches the refresh token from the database for the given connection ID.
 *
 * @param connectionId - The ID from google_connections table
 * @returns OAuth2Client configured with the connection's refresh token
 */
export const createOAuth2ClientForConnection = async (connectionId: number) => {
  const config = getOAuth2Config();

  const connection = await db("google_connections")
    .where({ id: connectionId })
    .first();

  if (!connection) {
    throw new Error(`Google connection not found: ${connectionId}`);
  }

  if (!connection.refresh_token) {
    throw new Error(
      `No refresh token found for Google connection: ${connectionId}`
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );

  oauth2Client.setCredentials({
    refresh_token: connection.refresh_token,
    access_token: connection.access_token || undefined,
  });

  attachTokenWriteBack(oauth2Client, connectionId);

  return oauth2Client;
};

/**
 * Get a valid OAuth2 client for a specific Google connection.
 * Checks if the access token is expired or expiring soon and refreshes if needed.
 * Updates the database with the new token if a refresh occurs.
 *
 * @param connectionId - The ID from google_connections table
 * @returns OAuth2Client with valid credentials
 */
export const getValidOAuth2ClientByConnection = async (connectionId: number) => {
  const config = getOAuth2Config();

  const connection = await db("google_connections")
    .where({ id: connectionId })
    .first();

  if (!connection) {
    throw new Error(`Google connection not found: ${connectionId}`);
  }

  if (!connection.refresh_token) {
    throw new Error(
      `No refresh token found for Google connection: ${connectionId}`
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );

  // Check if token is expired or expiring soon (< 5 minutes)
  const expiryDate = connection.expiry_date
    ? new Date(connection.expiry_date)
    : new Date(0);
  const isExpiringSoon = expiryDate.getTime() - Date.now() < 5 * 60 * 1000;

  if (isExpiringSoon) {
    console.log(
      `[OAuth Helper] Token expiring soon, refreshing for connection ${connectionId}`
    );

    oauth2Client.setCredentials({
      refresh_token: connection.refresh_token,
    });

    try {
      const { credentials } = await oauth2Client.refreshAccessToken();

      if (!credentials.access_token) {
        throw new Error("Failed to obtain access token after refresh");
      }

      const newExpiry = credentials.expiry_date
        ? new Date(credentials.expiry_date)
        : new Date(Date.now() + 3600000);

      await db("google_connections").where({ id: connectionId }).update({
        access_token: credentials.access_token,
        expiry_date: newExpiry,
        updated_at: new Date(),
      });

      console.log(
        `[OAuth Helper] Token refreshed for connection ${connectionId}`
      );

      oauth2Client.setCredentials({
        access_token: credentials.access_token,
        refresh_token: connection.refresh_token,
        expiry_date: credentials.expiry_date,
        scope: credentials.scope,
        token_type: credentials.token_type,
      });
    } catch (error: any) {
      console.error(
        `[OAuth Helper] Failed to refresh token for connection ${connectionId}:`,
        error.message
      );
      throw error;
    }
  } else {
    oauth2Client.setCredentials({
      access_token: connection.access_token,
      refresh_token: connection.refresh_token,
      expiry_date: connection.expiry_date
        ? new Date(connection.expiry_date).getTime()
        : undefined,
    });
  }

  // Persist any future library-internal refreshes back to the DB.
  attachTokenWriteBack(oauth2Client, connectionId);

  return oauth2Client;
};

/**
 * Get a valid OAuth2 client by organization ID.
 * Looks up the google_connections record for the organization.
 *
 * @param organizationId - The organization ID
 * @returns OAuth2Client with valid credentials
 */
export const getValidOAuth2ClientByOrg = async (organizationId: number) => {
  const connection = await db("google_connections")
    .where({ organization_id: organizationId })
    .first();

  if (!connection) {
    throw new Error(
      `No Google connection found for organization: ${organizationId}`
    );
  }

  return getValidOAuth2ClientByConnection(connection.id);
};

// Backward-compatible aliases — callers will be migrated in Plan 04 Step 7
/** @deprecated Use createOAuth2ClientForConnection */
export const createOAuth2ClientForAccount = createOAuth2ClientForConnection;
/** @deprecated Use getValidOAuth2ClientByConnection or getValidOAuth2ClientByOrg */
export const getValidOAuth2Client = getValidOAuth2ClientByConnection;

/**
 * Legacy: Create OAuth2 client with refresh token from environment variable
 * @deprecated Use createOAuth2ClientForConnection for multi-tenant support
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
export const createCustomAuth = createOAuth2Client;
