import { Request, Response } from "express";
import { REQUIRED_SCOPES, SCOPE_DESCRIPTIONS, SUPPORTED_APIS } from "./utils/scopeDefinitions";
import { OAUTH2_CONFIG } from "./utils/oauthConfig";
import { formatOAuthError } from "./utils/errorHandler";
import { generateAuthorizationUrl, exchangeCodeForTokens } from "./services/OAuth2Service";
import { validateRefreshToken } from "./services/TokenValidationService";
import { generateSuccessPage } from "./utils/templates/successTemplate";
import { generateErrorPage } from "./utils/templates/errorTemplate";

// GET /url - Generate OAuth2 authorization URL
export async function generateAuthUrl(req: Request, res: Response) {
  try {
    console.log("=== Generating OAuth2 Authorization URL ===");
    console.log("Required scopes:", REQUIRED_SCOPES);

    const authUrl = generateAuthorizationUrl();

    console.log("✅ Authorization URL generated successfully");

    res.json({
      authUrl,
      scopes: REQUIRED_SCOPES,
      message:
        "Visit the authUrl to authorize access for GA4, GSC, and GBP APIs",
    });
  } catch (error: any) {
    return formatOAuthError(res, error, "Generate OAuth URL");
  }
}

// POST /callback - Exchange authorization code for tokens
export async function handleCallback(req: Request, res: Response) {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: "Authorization code is required" });
    }

    console.log("=== Processing OAuth2 Callback ===");

    const tokens = await exchangeCodeForTokens(code);

    console.log("✅ OAuth2 tokens received successfully");
    console.log("Token info:", {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiryDate: tokens.expiry_date,
      scope: tokens.scope,
    });

    res.json({
      message:
        "Authorization successful - tokens obtained for GA4, GSC, and GBP",
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiryDate: tokens.expiry_date,
      scope: tokens.scope,
      apis: [
        "Google Analytics 4",
        "Google Search Console",
        "Google Business Profile",
      ],
    });
  } catch (error: any) {
    return formatOAuthError(res, error, "OAuth callback");
  }
}

// GET /web-callback - Browser-based OAuth callback that returns HTML
export async function handleWebCallback(req: Request, res: Response) {
  try {
    const { code, error, state } = req.query;

    if (error) {
      return res.status(400).json({
        error: "OAuth authorization failed",
        details: error,
        description: req.query.error_description,
      });
    }

    if (!code) {
      return res.status(400).json({ error: "Authorization code is required" });
    }

    console.log("=== Processing Web OAuth2 Callback ===");

    const tokens = await exchangeCodeForTokens(code as string);

    console.log("✅ Web OAuth2 tokens received successfully");

    // Return enhanced success page with tokens
    res.send(generateSuccessPage(tokens));
  } catch (error: any) {
    console.error("Web OAuth callback error:", error);
    res.status(500).send(generateErrorPage(error.message));
  }
}

// GET /validate - Validate stored refresh token
export async function validateToken(req: Request, res: Response) {
  try {
    const result = await validateRefreshToken();

    if (result.valid) {
      res.json({
        valid: true,
        message: result.message,
        hasRefreshToken: !!OAUTH2_CONFIG.refreshToken,
        scopes: REQUIRED_SCOPES,
      });
    } else {
      res.status(401).json({
        valid: false,
        message: result.message,
      });
    }
  } catch (error: any) {
    return formatOAuthError(res, error, "Validate OAuth token");
  }
}

// GET /scopes - Return scope information
export async function getScopeInfo(req: Request, res: Response) {
  res.json({
    requiredScopes: REQUIRED_SCOPES,
    scopeDescriptions: SCOPE_DESCRIPTIONS,
    apisCovered: SUPPORTED_APIS,
  });
}
