/**
 * API Routes Documentation
 *
 * This file documents all available routes across GA4, GBP, and GSC services.
 * All routes are prefixed with their respective service paths: /ga4, /gbp, /gsc
 */

export const API_DOCUMENTATION = {
  // =============================================================================
  // GOOGLE ANALYTICS 4 (GA4) ROUTES - Prefix: /ga4
  // =============================================================================
  ga4: {
    // Get key metrics with trend analysis
    getKeyData: {
      method: "POST",
      endpoint: "/ga4/getKeyData",
      description:
        "Get key GA4 metrics with month-over-month comparison and trend score",
      requiredBody: {
        propertyId:
          'string // GA4 property ID (with or without "properties/" prefix)',
      },
      responseStructure: {
        activeUsers: {
          prevMonth: "number",
          currMonth: "number",
        },
        engagementRate: {
          prevMonth: "number",
          currMonth: "number",
        },
        conversions: {
          prevMonth: "number",
          currMonth: "number",
        },
        trendScore:
          "number // Weighted score: conversions (40%) + engagement (35%) + users (25%)",
      },
    },

    // Get comprehensive AI-ready analytics data
    getAIReadyData: {
      method: "POST",
      endpoint: "/ga4/getAIReadyData",
      description: "Get comprehensive GA4 data structured for AI analysis",
      requiredBody: {
        propertyId: "string // GA4 property ID",
      },
      responseStructure: {
        overview: {
          sessions: "number",
          users: "number",
          pageviews: "number",
          engagementRate: "number",
          avgSessionDuration: "number",
          bounceRate: "number",
          dateRange: { startDate: "string", endDate: "string" },
        },
        acquisition: {
          bySource:
            "Array<{ source: string, medium: string, users: number, sessions: number, engagementRate: number, conversions: number }>",
        },
        audience: {
          geographic:
            "Array<{ country: string, users: number, sessions: number, engagementRate: number }>",
          technology:
            "Array<{ deviceCategory: string, users: number, sessions: number, engagementRate: number }>",
        },
        behavior: {
          topPages:
            "Array<{ page: string, views: number, users: number, avgEngagementTime: number, bounceRate: number }>",
          topEvents:
            "Array<{ eventName: string, eventCount: number, users: number }>",
        },
        ecommerce: {
          revenue: {
            total: "number",
            transactions: "number",
            avgOrderValue: "number",
          },
          products:
            "Array<{ itemName: string, revenue: number, quantity: number }>",
        },
        realTime: {
          activeUsers: "number",
          popularPages: "Array<{ page: string, activeUsers: number }>",
        },
        opportunities:
          "Array<{ type: string, [key: string]: any }> // Performance improvement suggestions",
      },
    },

    // Get available GA4 properties (detailed)
    diagProperties: {
      method: "GET",
      endpoint: "/ga4/diag/properties",
      description: "Get detailed list of available GA4 properties",
      requiredBody: "None",
      responseStructure: {
        properties:
          "Array<{ propertyId: string, displayName: string, timeZone: string, currencyCode: string, accountId: string, accountDisplayName: string }>",
      },
    },

    // Get available GA4 properties (simplified with domains)
    getProperties: {
      method: "GET",
      endpoint: "/ga4/properties/get",
      description: "Get simplified list of GA4 properties with domain names",
      requiredBody: "None",
      responseStructure: "Array<{ propertyId: string, domain: string }>",
    },
  },

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

  // =============================================================================
  // GOOGLE SEARCH CONSOLE (GSC) ROUTES - Prefix: /gsc
  // =============================================================================
  gsc: {
    // Get key metrics with trend analysis
    getKeyData: {
      method: "POST",
      endpoint: "/gsc/getKeyData",
      description:
        "Get key GSC metrics with month-over-month comparison and trend score",
      requiredBody: {
        domainProperty:
          'string // GSC domain property (e.g., "https://example.com/" or "sc-domain:example.com")',
      },
      responseStructure: {
        impressions: {
          prevMonth: "number",
          currMonth: "number",
        },
        avgPosition: {
          prevMonth: "number",
          currMonth: "number",
        },
        clicks: {
          prevMonth: "number",
          currMonth: "number",
        },
        trendScore:
          "number // Weighted score: clicks (40%) + impressions (35%) + position (25%)",
      },
    },

    // Get comprehensive AI-ready search data
    getAIReadyData: {
      method: "POST",
      endpoint: "/gsc/getAIReadyData",
      description: "Get comprehensive GSC data structured for AI analysis",
      requiredBody: {
        domainProperty: "string // GSC domain property",
      },
      responseStructure: {
        overview: {
          totalClicks: "number",
          totalImpressions: "number",
          avgCTR: "number",
          avgPosition: "number",
          dateRange: { startDate: "string", endDate: "string" },
        },
        topQueries:
          "Array<{ keys: Array<string>, clicks: number, impressions: number, ctr: number, position: number }>",
        underperformingPages:
          "Array<{ keys: Array<string>, clicks: number, impressions: number, ctr: number, position: number }> // Pages ranking below position 10",
        deviceBreakdown: {
          desktop:
            "{ clicks: number, impressions: number, ctr: number, position: number }",
          mobile:
            "{ clicks: number, impressions: number, ctr: number, position: number }",
          tablet:
            "{ clicks: number, impressions: number, ctr: number, position: number }",
        },
        geoPerformance:
          "Array<{ keys: Array<string>, clicks: number, impressions: number, ctr: number, position: number }>",
        opportunities:
          "Array<{ type: string, [key: string]: any }> // SEO improvement opportunities",
      },
    },

    // Get available sites (detailed)
    diagSites: {
      method: "GET",
      endpoint: "/gsc/diag/sites",
      description: "Get detailed list of available GSC sites",
      requiredBody: "None",
      responseStructure: {
        sites: "Array<{ siteUrl: string, permissionLevel: string }>",
      },
    },

    // Get available sites (simplified)
    getSites: {
      method: "GET",
      endpoint: "/gsc/sites/get",
      description: "Get simplified list of available GSC site URLs",
      requiredBody: "None",
      responseStructure: "Array<string> // Array of site URLs",
    },
  },
} as const;

// =============================================================================
// COMMON PATTERNS & NOTES
// =============================================================================

/**
 * COMMON ERROR RESPONSES:
 * All endpoints may return error responses in this format:
 * {
 *   error: string,
 *   successful?: false,
 *   message?: string
 * }
 */

/**
 * DATE FORMATS:
 * - All dates are in YYYY-MM-DD format
 * - Date ranges typically use previous month by default
 * - Current month refers to the month before the current month (data availability delay)
 */

/**
 * AUTHENTICATION:
 * - All routes require OAuth2 authentication
 * - Authentication is handled automatically via the oauth2Helper
 * - No additional headers or tokens needed in requests
 */

/**
 * TREND SCORES:
 * - Calculated as weighted percentage changes between periods
 * - Positive scores indicate improvement, negative indicate decline
 * - Rounded to 2 decimal places
 */

/**
 * PROPERTY/SITE IDENTIFIERS:
 * - GA4: propertyId (with or without "properties/" prefix)
 * - GBP: accountId + locationId combination
 * - GSC: domainProperty (URL or domain format)
 */
