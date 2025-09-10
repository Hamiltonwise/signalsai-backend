import express from "express";
import { google } from "googleapis";

const googleAuthRoutes = express.Router();

// OAuth2 configuration
const OAUTH2_CONFIG = {
  clientId: process.env.GOOGLE_CLIENT_ID || "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  refreshToken: process.env.GOOGLE_REFRESH_TOKEN || "",
  redirectUri:
    process.env.GOOGLE_REDIRECT_URI ||
    "http://localhost:3000/api/auth/web-callback",
  email: "info@hamiltonwise.com",
};

// Combined OAuth2 scopes for all Google APIs we use
const REQUIRED_SCOPES = [
  // GA4 Analytics scopes
  "https://www.googleapis.com/auth/analytics.readonly",

  // Google Search Console scopes
  "https://www.googleapis.com/auth/webmasters.readonly",

  // Google Business Profile scopes
  "https://www.googleapis.com/auth/business.manage",
];

// Validate OAuth2 configuration
const validateOAuth2Config = () => {
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

// OAuth2 client for initial authorization (doesn't require refresh token)
const createInitialOAuth2Client = () => {
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

  return new google.auth.OAuth2(
    OAUTH2_CONFIG.clientId,
    OAUTH2_CONFIG.clientSecret,
    OAUTH2_CONFIG.redirectUri
  );
};

// Enhanced error handler
const handleError = (res: express.Response, error: any, operation: string) => {
  const errorDetails = {
    operation,
    message: error?.message || "Unknown error",
    status: error?.response?.status || error?.status,
    data: error?.response?.data || error?.data,
    stack: error?.stack?.split("\n").slice(0, 3).join("\n"),
  };

  console.error(`=== ${operation} Error ===`, errorDetails);

  const statusCode = error?.response?.status || error?.status || 500;
  return res.status(statusCode).json({
    error: `Failed to ${operation.toLowerCase()}`,
    details: process.env.NODE_ENV === "development" ? errorDetails : undefined,
  });
};

// OAuth2 authorization routes
googleAuthRoutes.get("/url", (req, res) => {
  try {
    console.log("=== Generating OAuth2 Authorization URL ===");
    console.log("Required scopes:", REQUIRED_SCOPES);

    const oauth2Client = createInitialOAuth2Client();

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: REQUIRED_SCOPES,
      prompt: "consent", // Force consent screen to ensure refresh token
      include_granted_scopes: true, // Include previously granted scopes
    });

    console.log("✅ Authorization URL generated successfully");

    res.json({
      authUrl,
      scopes: REQUIRED_SCOPES,
      message:
        "Visit the authUrl to authorize access for GA4, GSC, and GBP APIs",
    });
  } catch (error: any) {
    return handleError(res, error, "Generate OAuth URL");
  }
});

googleAuthRoutes.post("/callback", async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: "Authorization code is required" });
    }

    console.log("=== Processing OAuth2 Callback ===");

    const oauth2Client = createInitialOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

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
    return handleError(res, error, "OAuth callback");
  }
});

// Web OAuth callback endpoint with enhanced UI
googleAuthRoutes.get("/web-callback", async (req, res) => {
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

    const oauth2Client = createInitialOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code as string);

    console.log("✅ Web OAuth2 tokens received successfully");

    // Return enhanced success page with tokens
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Google APIs OAuth Success</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            max-width: 800px; margin: 50px auto; padding: 20px; 
            background: #f8f9fa; color: #333;
          }
          .container { background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .success { background: #d4edda; border: 1px solid #c3e6cb; padding: 20px; border-radius: 8px; color: #155724; margin-bottom: 25px; }
          .token-section { background: #f8f9fa; border: 1px solid #dee2e6; padding: 20px; margin: 15px 0; border-radius: 5px; }
          .token { 
            background: #fff; border: 1px solid #ccc; padding: 15px; margin: 10px 0; 
            border-radius: 4px; font-family: 'Courier New', monospace; 
            word-break: break-all; font-size: 13px; color: #d73a49;
          }
          .instructions { 
            background: #fff3cd; border: 1px solid #ffeaa7; padding: 20px; 
            border-radius: 8px; color: #856404; margin-top: 25px; 
          }
          .api-list { background: #e3f2fd; border: 1px solid #bbdefb; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .api-item { display: inline-block; background: #2196f3; color: white; padding: 5px 12px; margin: 3px; border-radius: 15px; font-size: 12px; }
          h2 { color: #155724; margin-top: 0; }
          h3 { color: #495057; border-bottom: 2px solid #007bff; padding-bottom: 5px; }
          code { background: #f1f3f4; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
          .copy-btn { 
            background: #007bff; color: white; border: none; padding: 8px 15px; 
            border-radius: 4px; cursor: pointer; margin-left: 10px; 
          }
          .copy-btn:hover { background: #0056b3; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success">
            <h2>🎉 OAuth Authorization Successful!</h2>
            <p>Your Google API access has been authorized for multiple services.</p>
          </div>
          
          <div class="api-list">
            <h3>✅ Authorized APIs:</h3>
            <span class="api-item">Google Analytics 4</span>
            <span class="api-item">Google Search Console</span>
            <span class="api-item">Google Business Profile</span>
          </div>
          
          <div class="token-section">
            <h3>🔑 Refresh Token (Save this to your .env file):</h3>
            <div class="token" id="refreshToken">
              GOOGLE_REFRESH_TOKEN=${
                tokens.refresh_token || "No refresh token received"
              }
            </div>
            <button class="copy-btn" onclick="copyToClipboard('refreshToken')">Copy to Clipboard</button>
          </div>
          
          <div class="token-section">
            <h3>⏰ Access Token (temporary - expires ${
              tokens.expiry_date
                ? new Date(tokens.expiry_date).toLocaleString()
                : "unknown"
            }):</h3>
            <div class="token" id="accessToken">
              ${
                tokens.access_token
                  ? tokens.access_token.substring(0, 50) + "..."
                  : "No access token received"
              }
            </div>
          </div>
          
          <div class="instructions">
            <h4>📋 Next Steps:</h4>
            <ol>
              <li><strong>Copy the refresh token</strong> from above (click the copy button)</li>
              <li><strong>Update your .env file:</strong> Add or replace <code>GOOGLE_REFRESH_TOKEN=your_token_here</code></li>
              <li><strong>Restart your server</strong> to load the new token</li>
              <li><strong>Test your APIs:</strong>
                <ul>
                  <li>GA4: <code>GET /api/ga4/properties/get</code></li>
                  <li>GSC: <code>GET /api/gsc/sites/get</code></li>
                  <li>GBP: <code>GET /api/gbp/locations/get</code></li>
                </ul>
              </li>
            </ol>
            
            <p><strong>📝 Note:</strong> This token grants access to all three Google APIs with the following scopes:</p>
            <ul>
              <li>Analytics (read-only access to GA4 data)</li>
              <li>Search Console (read-only access to search performance data)</li>
              <li>Business Profile (manage business listings and access insights)</li>
            </ul>
          </div>
        </div>
        
        <script>
          function copyToClipboard(elementId) {
            const element = document.getElementById(elementId);
            const text = element.textContent || element.innerText;
            navigator.clipboard.writeText(text).then(function() {
              const btn = event.target;
              const originalText = btn.textContent;
              btn.textContent = 'Copied!';
              btn.style.background = '#28a745';
              setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '#007bff';
              }, 2000);
            }).catch(function(err) {
              console.error('Failed to copy text: ', err);
            });
          }
        </script>
      </body>
      </html>
    `);
  } catch (error: any) {
    console.error("Web OAuth callback error:", error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>OAuth Error</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
          .error { background: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 5px; color: #721c24; }
        </style>
      </head>
      <body>
        <div class="error">
          <h2>❌ OAuth Error</h2>
          <p><strong>Error:</strong> ${error.message}</p>
          <p>Please try the authorization process again.</p>
          <p><a href="/api/auth/auth/url">Click here to get a new authorization URL</a></p>
        </div>
      </body>
      </html>
    `);
  }
});

// Token validation endpoint
googleAuthRoutes.get("/validate", async (req, res) => {
  try {
    validateOAuth2Config();

    const oauth2Client = new google.auth.OAuth2(
      OAUTH2_CONFIG.clientId,
      OAUTH2_CONFIG.clientSecret,
      OAUTH2_CONFIG.redirectUri
    );

    oauth2Client.setCredentials({
      refresh_token: OAUTH2_CONFIG.refreshToken,
    });

    // Test the token by getting a new access token
    const { token } = await oauth2Client.getAccessToken();

    if (token) {
      res.json({
        valid: true,
        message: "OAuth2 token is valid and can be refreshed",
        hasRefreshToken: !!OAUTH2_CONFIG.refreshToken,
        scopes: REQUIRED_SCOPES,
      });
    } else {
      res.status(401).json({
        valid: false,
        message: "Failed to refresh access token",
      });
    }
  } catch (error: any) {
    return handleError(res, error, "Validate OAuth token");
  }
});

// Scopes information endpoint
googleAuthRoutes.get("/scopes", (req, res) => {
  res.json({
    requiredScopes: REQUIRED_SCOPES,
    scopeDescriptions: {
      "https://www.googleapis.com/auth/analytics.readonly":
        "Google Analytics 4 - Read access to analytics data",
      "https://www.googleapis.com/auth/webmasters.readonly":
        "Google Search Console - Read access to search performance data",
      "https://www.googleapis.com/auth/business.manage":
        "Google Business Profile - Manage business listings and access insights",
      "https://www.googleapis.com/auth/plus.business.manage":
        "Google Business Profile - Legacy scope for reviews (may be required)",
      "https://www.googleapis.com/auth/plus.profiles.read":
        "Google Business Profile - Read profile data (may be required for reviews)",
    },
    apisCovered: [
      "Google Analytics 4 (GA4)",
      "Google Search Console (GSC)",
      "Google Business Profile (GBP)",
    ],
  });
});

export default googleAuthRoutes;
