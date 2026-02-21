/**
 * Common Patterns & Notes
 *
 * Structured documentation of common patterns shared across all API endpoints.
 * Extracted from inline comments for programmatic access and consistency.
 */

export const COMMON_PATTERNS = {
  errorResponses: {
    description: "All endpoints may return error responses in this format",
    structure: {
      error: "string",
      successful: "false // optional",
      message: "string // optional",
    },
  },

  dateFormats: {
    format: "YYYY-MM-DD",
    defaultRange: "Previous month",
    note: "Current month refers to the month before the current month (data availability delay)",
  },

  authentication: {
    type: "JWT + OAuth2",
    handler: "authenticateToken + tokenRefreshMiddleware",
    note: "All routes require JWT authentication via Authorization header. GBP routes additionally use OAuth2 via tokenRefreshMiddleware for Google API access. The OAuth2 client is resolved from the organization's google_connection.",
  },

  trendScores: {
    calculation: "Weighted percentage changes between periods",
    positiveIndicates: "improvement",
    negativeIndicates: "decline",
    precision: "Rounded to 2 decimal places",
  },

  identifiers: {
    gbp: {
      fields: ["accountId", "locationId"],
      note: "accountId + locationId combination",
    },
  },
} as const;
