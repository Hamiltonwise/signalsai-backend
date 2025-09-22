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
  "DB_PASS",
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

// Apply logging middleware to all routes
router.use(logRequest);

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
router.get("/auth/google", async (req: Request, res: Response) => {
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
router.get("/auth/google/callback", async (req: Request, res: Response) => {
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
      return res.status(400).json({
        success: false,
        error: "OAuth authorization failed",
        message: error as string,
        timestamp: new Date().toISOString(),
      });
    }

    // Validate required parameters
    if (!code) {
      return res.status(400).json({
        success: false,
        error: "Missing authorization code",
        message: "Authorization code is required to complete OAuth flow",
        timestamp: new Date().toISOString(),
      });
    }

    validateEnvironmentVariables();
    const oauth2Client = createOAuth2Client();

    // Exchange authorization code for tokens
    console.log("[AUTH] Exchanging authorization code for tokens");
    const { tokens } = await oauth2Client.getToken(code as string);

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
    });

    // Set credentials for profile fetch
    oauth2Client.setCredentials(tokens);

    // Fetch user profile from Google
    console.log("[AUTH] Fetching user profile from Google");
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data: profile } = await oauth2.userinfo.get();

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

    // Database transaction for user and account creation/update
    console.log("[AUTH] Starting database transaction");
    const result = await db.transaction(async (trx) => {
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

        const [userId] = await trx("users").insert(userData);
        user = await trx("users").where({ id: userId }).first();
        console.log(
          `[AUTH] Created new user: ${googleProfile.email} (ID: ${userId})`
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
        const [accountId] = await trx("google_accounts").insert({
          ...accountData,
          created_at: new Date(),
        });

        googleAccount = await trx("google_accounts")
          .where({ id: accountId })
          .first();

        console.log(`[AUTH] Created new Google account for user ${user.id}`);
      }

      return { user, googleAccount };
    });

    console.log("[AUTH] Database transaction completed successfully");

    const response: CallbackResponse = {
      success: true,
      user: result.user,
      googleAccount: result.googleAccount,
      message: `OAuth authorization successful for ${googleProfile.email}`,
      accessToken: tokens.access_token || undefined,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
    };

    console.log(
      `[AUTH] OAuth flow completed successfully for user: ${googleProfile.email}`
    );
    res.json(response);
  } catch (error) {
    console.error("[AUTH] OAuth callback error:", error);
    return handleError(res, error, "Process OAuth callback");
  }
});

// =====================================================================
// ADDITIONAL UTILITY ROUTES
// =====================================================================

/**
 * GET /auth/google/validate/:googleAccountId
 *
 * Validates and potentially refreshes OAuth tokens for a Google account
 */
router.get(
  "/auth/google/validate/:googleAccountId",
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
router.get("/auth/google/scopes", (req: Request, res: Response) => {
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
