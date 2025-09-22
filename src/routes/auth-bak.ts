import express from "express";
import { google } from "googleapis";
import { domainMappings } from "../utils/domainMappings";

const authRoutes = express.Router();

// Required scopes for all Google APIs
const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly", // GA4
  "https://www.googleapis.com/auth/webmasters.readonly", // GSC
  "https://www.googleapis.com/auth/business.manage", // GBP
];

// Get authorization URL to start OAuth flow
authRoutes.get("/auth/url", (req, res) => {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline", // Important: this ensures we get a refresh token
      prompt: "consent", // Force consent screen to ensure refresh token
      scope: SCOPES,
      state: "signalsai-backend", // Optional state parameter
    });

    res.json({
      success: true,
      authUrl,
      message:
        "Visit this URL to authorize the application and get your refresh token",
      scopes: SCOPES,
    });
  } catch (error) {
    console.error("Error generating auth URL:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate authorization URL",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// View all required scopes
authRoutes.get("/auth/scopes", (req, res) => {
  res.json({
    success: true,
    scopes: SCOPES,
    descriptions: {
      "https://www.googleapis.com/auth/analytics.readonly":
        "Google Analytics 4 - Read access",
      "https://www.googleapis.com/auth/webmasters.readonly":
        "Google Search Console - Read access",
      "https://www.googleapis.com/auth/business.manage":
        "Google Business Profile - Manage access",
    },
  });
});

// Validate current token
authRoutes.get("/auth/validate", async (req, res) => {
  try {
    if (!process.env.GOOGLE_REFRESH_TOKEN) {
      return res.status(400).json({
        success: false,
        error: "No refresh token found in environment variables",
      });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    // Try to get a fresh access token
    const { credentials } = await oauth2Client.refreshAccessToken();

    res.json({
      success: true,
      message: "Refresh token is valid",
      tokenInfo: {
        scope: credentials.scope,
        token_type: credentials.token_type,
        expiry_date: credentials.expiry_date,
      },
    });
  } catch (error) {
    console.error("Token validation error:", error);
    res.status(400).json({
      success: false,
      error: "Invalid or expired refresh token",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// OAuth2 callback route
authRoutes.get("/callback", async (req, res) => {
  try {
    const { code, error, state } = req.query;

    // Handle OAuth error
    if (error) {
      return res.status(400).json({
        success: false,
        error: "OAuth authorization failed",
        details: error,
      });
    }

    // Ensure we have an authorization code
    if (!code || typeof code !== "string") {
      return res.status(400).json({
        success: false,
        error: "Missing authorization code",
      });
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    // Exchange authorization code for tokens
    const { tokens } = await oauth2Client.getToken(code);

    // Set the credentials on the client
    oauth2Client.setCredentials(tokens);

    // Return success response with tokens
    res.json({
      success: true,
      message: "OAuth authorization successful",
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        scope: tokens.scope,
        token_type: tokens.token_type,
        expiry_date: tokens.expiry_date,
      },
      state,
    });
  } catch (error) {
    console.error("OAuth callback error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process OAuth callback",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

authRoutes.get("/returnEligibleDomains", function (req, res) {
  const eligibleDomains = domainMappings.filter(
    (domain) => domain.completed === true
  );
  res.json(eligibleDomains);
});

export default authRoutes;
