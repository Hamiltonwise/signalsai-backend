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

    // Check if token needs refresh (expired or < 5 minutes remaining)
    const needsRefresh =
      !googleAccount.expiry_date ||
      new Date(googleAccount.expiry_date).getTime() - Date.now() <
        5 * 60 * 1000;

    if (needsRefresh) {
      console.log(
        `[Token Refresh] Refreshing token for account ${googleAccountId}`
      );

      try {
        // Create OAuth2 client and refresh token
        const oauth2Client = await createOAuth2ClientForAccount(
          googleAccountId
        );
        const { token } = await oauth2Client.getAccessToken();

        if (!token) {
          throw new Error("Failed to refresh access token");
        }

        // Calculate new expiry (1 hour from now)
        const newExpiry = new Date(Date.now() + 3600000); // +1 hour

        // Update database with new token
        await db("google_accounts").where({ id: googleAccountId }).update({
          access_token: token,
          expiry_date: newExpiry,
          updated_at: new Date(),
        });

        console.log(
          `[Token Refresh] Token refreshed successfully for account ${googleAccountId}. Expires at: ${newExpiry.toISOString()}`
        );

        // Update oauth2Client with new token
        oauth2Client.setCredentials({
          access_token: token,
          refresh_token: googleAccount.refresh_token,
        });

        // Attach to request
        req.oauth2Client = oauth2Client;
        req.googleAccountId = googleAccountId;
      } catch (refreshError: any) {
        console.error(
          `[Token Refresh] Failed to refresh token for account ${googleAccountId}:`,
          refreshError
        );

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
    } else {
      // Token is still valid, just create client with existing credentials
      const oauth2Client = await createOAuth2ClientForAccount(googleAccountId);
      req.oauth2Client = oauth2Client;
      req.googleAccountId = googleAccountId;

      console.log(
        `[Token Refresh] Token still valid for account ${googleAccountId}. Expires at: ${new Date(
          googleAccount.expiry_date
        ).toISOString()}`
      );
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
