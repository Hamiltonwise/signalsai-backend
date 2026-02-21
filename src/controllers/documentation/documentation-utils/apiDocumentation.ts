/**
 * API Routes Documentation
 *
 * This file documents all available routes for the GBP service.
 * All routes are prefixed with: /gbp
 */

export const API_DOCUMENTATION = {
  // =============================================================================
  // GOOGLE BUSINESS PROFILE (GBP) ROUTES - Prefix: /gbp
  // =============================================================================
  gbp: {
    // Get key metrics with trend analysis
    getKeyData: {
      method: "POST",
      endpoint: "/gbp/getKeyData",
      description:
        "Get key GBP metrics with month-over-month comparison and trend score",
      requiredBody: {
        accountId: "string // GBP account ID",
        locationId: "string // GBP location ID",
      },
      responseStructure: {
        newReviews: {
          prevMonth: "number",
          currMonth: "number",
        },
        avgRating: {
          prevMonth: "number",
          currMonth: "number",
        },
        callClicks: {
          prevMonth: "number",
          currMonth: "number",
        },
        trendScore:
          "number // Weighted score: reviews (30%) + rating (50%) + calls (20%)",
      },
    },

    // Get comprehensive AI-ready business data
    getAIReadyData: {
      method: "POST",
      endpoint: "/gbp/getAIReadyData",
      description: "Get comprehensive GBP data for AI analysis",
      requiredBody: {
        accountId: "string // GBP account ID",
        locationId: "string // GBP location ID",
        startDate:
          "string // Optional: YYYY-MM-DD format, defaults to previous month",
        endDate:
          "string // Optional: YYYY-MM-DD format, defaults to previous month",
      },
      responseStructure: {
        meta: {
          accountId: "string",
          locationId: "string",
          dateRange: { startDate: "string", endDate: "string" },
        },
        reviews: {
          allTime: { averageRating: "number", totalReviewCount: "number" },
          window: { averageRating: "number", newReviews: "number" },
        },
        performance: {
          series:
            "Array // Time series data for various metrics including CALL_CLICKS, WEBSITE_CLICKS, etc.",
        },
      },
    },

    // Get available GBP accounts
    diagAccounts: {
      method: "GET",
      endpoint: "/gbp/diag/accounts",
      description: "Get list of available GBP accounts",
      requiredBody: "None",
      responseStructure:
        "Array<{ name: string, [key: string]: any }> // Array of account objects",
    },

    // Get available locations
    diagLocations: {
      method: "GET",
      endpoint: "/gbp/diag/locations",
      description: "Get list of available locations for an account",
      requiredBody: "None",
      queryParams: {
        accountName:
          "string // Optional: specific account name, uses first account if not provided",
      },
      responseStructure:
        "Array<{ name: string, title: string, storeCode: string, metadata: object }>",
    },
  },
} as const;
