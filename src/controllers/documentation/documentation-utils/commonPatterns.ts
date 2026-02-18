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
    type: "OAuth2",
    handler: "oauth2Helper",
    note: "All routes require OAuth2 authentication. Authentication is handled automatically via the oauth2Helper. No additional headers or tokens needed in requests.",
  },

  trendScores: {
    calculation: "Weighted percentage changes between periods",
    positiveIndicates: "improvement",
    negativeIndicates: "decline",
    precision: "Rounded to 2 decimal places",
  },

  identifiers: {
    ga4: {
      field: "propertyId",
      note: 'With or without "properties/" prefix',
    },
    gbp: {
      fields: ["accountId", "locationId"],
      note: "accountId + locationId combination",
    },
    gsc: {
      field: "domainProperty",
      note: "URL or domain format",
    },
  },
} as const;
