import { Request, Response } from "express";
import {
  createOAuth2Client,
  validateEnvironmentVariables,
} from "./feature-utils/oauth-client-factory";
import { generateSecureState } from "./feature-utils/security-utils";
import { handleError, generatePopupHtml } from "./feature-utils/response-formatters";
import * as OAuthFlowService from "./feature-services/OAuthFlowService";
import * as TokenManagementService from "./feature-services/TokenManagementService";
import * as ScopeManagementService from "./feature-services/ScopeManagementService";

/**
 * GET /auth/google
 * Generates Google OAuth consent screen URL with required scopes.
 */
export async function getGoogleAuthUrl(req: Request, res: Response): Promise<void> {
  try {
    console.log("[AUTH] Generating OAuth authorization URL");

    validateEnvironmentVariables();
    const oauth2Client = createOAuth2Client();

    const state = (req.query.state as string) || generateSecureState();

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: true,
      scope: [...ScopeManagementService.REQUIRED_SCOPES],
      state: state,
    });

    console.log("[AUTH] Generated authorization URL successfully");
    console.log(
      `[AUTH] Scopes requested: ${ScopeManagementService.REQUIRED_SCOPES.join(", ")}`,
    );

    res.json({
      success: true,
      authUrl,
      state,
      scopes: [...ScopeManagementService.REQUIRED_SCOPES],
      message:
        "Authorization URL generated successfully. Visit authUrl to grant permissions.",
    });
  } catch (error) {
    handleError(res, error, "Generate OAuth authorization URL");
  }
}

/**
 * GET /auth/callback & GET /auth/google/callback
 * Processes OAuth callback from Google after user grants permissions.
 * Handles token exchange, profile fetch, transactional user/account creation,
 * and returns an HTML popup response.
 */
export async function handleOAuthCallback(req: Request, res: Response): Promise<void> {
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
      res.status(400).json({
        success: false,
        error: "OAuth authorization failed",
        message: error as string,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Validate required parameters
    if (!code) {
      res.status(400).json({
        success: false,
        error: "Missing authorization code",
        message: "Authorization code is required to complete OAuth flow",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    validateEnvironmentVariables();
    const oauth2Client = createOAuth2Client();

    // Exchange authorization code for tokens
    const tokens = await OAuthFlowService.exchangeCodeForTokens(
      oauth2Client,
      code as string,
    );

    // Fetch user profile from Google
    const googleProfile = await OAuthFlowService.fetchGoogleUserProfile(
      tokens.access_token,
    );

    // Database transaction for user and account creation/update with fallback
    let result: OAuthFlowService.OAuthFlowResult;
    try {
      result = await OAuthFlowService.completeOAuthFlow(tokens, googleProfile);
    } catch (transactionError: any) {
      console.error("[AUTH] Database transaction failed:", {
        error: transactionError.message,
        code: transactionError.code,
        errno: transactionError.errno,
      });

      try {
        result = await OAuthFlowService.handleFallbackAuth(tokens, googleProfile);
      } catch (fallbackError) {
        console.error("[AUTH] Fallback save also failed:", fallbackError);
        throw transactionError; // Throw original transaction error
      }
    }

    // Get user role for response
    const userRole = await OAuthFlowService.getUserRole(
      result.user.id,
      result.googleAccount.organization_id,
    );

    const response = {
      success: true,
      user: result.user,
      googleConnection: result.googleAccount,
      message: `OAuth authorization successful for ${googleProfile.email}`,
      accessToken: tokens.access_token || undefined,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      googleConnectionId: result.googleAccount.id,
      role: userRole,
    };

    console.log(
      `[AUTH] OAuth flow completed successfully for user: ${googleProfile.email}`,
    );

    // Return HTML that posts message to parent window and closes popup
    const htmlResponse = generatePopupHtml(response);

    res.setHeader("Content-Type", "text/html");
    res.send(htmlResponse);
  } catch (error) {
    console.error("[AUTH] OAuth callback error:", error);
    handleError(res, error, "Process OAuth callback");
  }
}

/**
 * GET /auth/google/validate/:connectionId
 * Validates and potentially refreshes OAuth tokens for a Google connection.
 */
export async function validateToken(req: Request, res: Response): Promise<Response | void> {
  try {
    const { connectionId } = req.params;

    if (!connectionId || isNaN(Number(connectionId))) {
      return res.status(400).json({
        success: false,
        error: "Invalid connection ID",
        timestamp: new Date().toISOString(),
      });
    }

    const googleConnection = await TokenManagementService.validateAndRefreshToken(
      Number(connectionId),
    );
    const scopes = TokenManagementService.getAccountScopes(googleConnection);

    res.json({
      success: true,
      message: "Token validated and refreshed successfully",
      expiresAt: googleConnection.expiry_date,
      scopes,
    });
  } catch (error) {
    return handleError(res, error, "Validate OAuth tokens");
  }
}

/**
 * GET /auth/google/scopes
 * Returns information about required OAuth scopes.
 */
export function getScopeInfo(_req: Request, res: Response): void {
  const scopeInfo = ScopeManagementService.getScopeInfo();

  res.json({
    success: true,
    ...scopeInfo,
  });
}

/**
 * GET /auth/google/reconnect
 * Generates an OAuth URL for incremental authorization (re-granting missing scopes).
 */
export async function getReconnectUrl(req: Request, res: Response): Promise<Response | void> {
  try {
    const { scopes } = req.query;

    if (!scopes || typeof scopes !== "string") {
      return res.status(400).json({
        success: false,
        error: "Missing scopes parameter",
        message:
          "Please specify which scopes to request (e.g., scopes=gbp or scopes=all)",
        timestamp: new Date().toISOString(),
      });
    }

    console.log("[AUTH] Generating incremental OAuth URL for scopes:", scopes);

    // Resolve scope keys to URLs
    const resolveResult = ScopeManagementService.resolveScopes(scopes);

    if (resolveResult.error) {
      // Determine the appropriate error message
      const isInvalidKey = resolveResult.error.startsWith("Invalid scope key:");
      return res.status(400).json({
        success: false,
        error: resolveResult.error,
        message: isInvalidKey
          ? "Valid scope keys are: gbp, or 'all'"
          : "Please specify at least one valid scope (gbp or all)",
        timestamp: new Date().toISOString(),
      });
    }

    // After the error guard above, scopes is guaranteed to be defined
    const requestedScopes = resolveResult.scopes!;

    validateEnvironmentVariables();
    const oauth2Client = createOAuth2Client();

    const state = generateSecureState() + "_reconnect";

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: true,
      scope: requestedScopes,
      state: state,
    });

    console.log("[AUTH] Generated incremental authorization URL");
    console.log(`[AUTH] Requested scopes: ${requestedScopes.join(", ")}`);

    res.json({
      success: true,
      authUrl,
      state,
      requestedScopes,
      message: `Authorization URL generated for incremental scope grant. Visit authUrl to grant permissions for: ${ScopeManagementService.formatScopeNames(requestedScopes)}`,
    });
  } catch (error) {
    return handleError(
      res,
      error,
      "Generate incremental OAuth authorization URL",
    );
  }
}
