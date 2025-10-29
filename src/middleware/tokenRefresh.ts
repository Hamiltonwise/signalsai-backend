import { Request, Response, NextFunction } from "express";
import { db } from "../database/connection";
import { createOAuth2ClientForAccount } from "../auth/oauth2Helper";
import { OAuth2Client } from "google-auth-library";

/**
 * Extended Express Request type with OAuth2Client
 */
export interface AuthenticatedRequest extends Request {
  oauth2Client?: OAuth2Client;
  googleAccountId?: number;
}

/**
 * Token Refresh Middleware
 *
 * Automatically refreshes Google OAuth tokens if they're expired or expiring soon.
 * This middleware:
 * 1. Extracts googleAccountId from request header
 * 2. Checks token expiry from database
 * 3. Refreshes token if < 5 minutes remaining
 * 4. Updates database with new token
 * 5. Attaches OAuth2Client to request for route handlers
 *
 * Usage:
 *   router.use(tokenRefreshMiddleware);
 */
export const tokenRefreshMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Extract googleAccountId from header
    const googleAccountIdHeader = req.headers["x-google-account-id"];

    if (!googleAccountIdHeader) {
      return res.status(401).json({
        error: "Missing authentication",
        message: "x-google-account-id header is required",
        timestamp: new Date().toISOString(),
      });
    }

    const googleAccountId = parseInt(googleAccountIdHeader as string, 10);

    if (isNaN(googleAccountId)) {
      return res.status(400).json({
        error: "Invalid authentication",
        message: "x-google-account-id must be a valid number",
        timestamp: new Date().toISOString(),
      });
    }

    // Fetch Google account from database
    const googleAccount = await db("google_accounts")
      .where({ id: googleAccountId })
      .first();

    if (!googleAccount) {
      return res.status(404).json({
        error: "Account not found",
        message: `Google account ${googleAccountId} not found`,
        timestamp: new Date().toISOString(),
      });
    }

    // ✅ ALWAYS refresh token to ensure it's valid (fixes 401 errors)
    console.log(
      `[Token Refresh] Force refreshing token for account ${googleAccountId}`
    );

    try {
      // Create OAuth2 client and force token refresh
      const oauth2Client = await createOAuth2ClientForAccount(googleAccountId);

      // Force refresh to get a fresh access token
      const { credentials } = await oauth2Client.refreshAccessToken();

      if (!credentials.access_token) {
        throw new Error("Failed to obtain access token after refresh");
      }

      // Calculate new expiry from credentials or default to 1 hour
      const newExpiry = credentials.expiry_date
        ? new Date(credentials.expiry_date)
        : new Date(Date.now() + 3600000);

      // Update database with fresh token
      await db("google_accounts").where({ id: googleAccountId }).update({
        access_token: credentials.access_token,
        expiry_date: newExpiry,
        updated_at: new Date(),
      });

      console.log(
        `[Token Refresh] ✓ Token refreshed successfully for account ${googleAccountId}`
      );
      console.log(`  - New expiry: ${newExpiry.toISOString()}`);
      console.log(`  - Has access token: ${!!credentials.access_token}`);
      console.log(`  - Has refresh token: ${!!credentials.refresh_token}`);
      console.log(`  - Scopes: ${credentials.scope || "not available"}`);

      // Ensure credentials are set on the client
      oauth2Client.setCredentials({
        access_token: credentials.access_token,
        refresh_token: googleAccount.refresh_token,
        expiry_date: credentials.expiry_date,
        scope: credentials.scope,
        token_type: credentials.token_type,
      });

      // Attach to request
      req.oauth2Client = oauth2Client;
      req.googleAccountId = googleAccountId;
    } catch (refreshError: any) {
      console.error(
        `[Token Refresh] ✗ Failed to refresh token for account ${googleAccountId}:`,
        refreshError.message
      );
      console.error(`[Token Refresh] Error details:`, refreshError);

      return res.status(401).json({
        error: "Token refresh failed",
        message: "Failed to refresh access token. Please re-authenticate.",
        details:
          process.env.NODE_ENV === "development"
            ? refreshError.message
            : undefined,
        timestamp: new Date().toISOString(),
      });
    }

    next();
  } catch (error: any) {
    console.error("[Token Refresh] Middleware error:", error);

    return res.status(500).json({
      error: "Authentication error",
      message: "Failed to process authentication",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
      timestamp: new Date().toISOString(),
    });
  }
};
