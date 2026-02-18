/**
 * Required OAuth scopes for all Google APIs
 */
export const REQUIRED_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/business.manage",
] as const;

/**
 * Scope mapping for incremental authorization.
 * Maps short keys (ga4, gsc, gbp) to full Google API scope URLs.
 */
export const SCOPE_MAP: Record<string, string> = {
  ga4: "https://www.googleapis.com/auth/analytics.readonly",
  gsc: "https://www.googleapis.com/auth/webmasters.readonly",
  gbp: "https://www.googleapis.com/auth/business.manage",
};

/**
 * Scope descriptions for the /google/scopes endpoint response.
 */
const SCOPE_DESCRIPTIONS: Record<string, string> = {
  "https://www.googleapis.com/auth/analytics.readonly":
    "Google Analytics 4 - Read access to analytics data and reports",
  "https://www.googleapis.com/auth/webmasters.readonly":
    "Google Search Console - Read access to search performance data",
  "https://www.googleapis.com/auth/business.manage":
    "Google Business Profile - Manage business listings and access insights",
};

/**
 * APIs covered by the required scopes.
 */
const APIS_COVERED = [
  "Google Analytics 4 (GA4)",
  "Google Search Console (GSC)",
  "Google Business Profile (GBP)",
];

/**
 * Returns scope metadata for the /google/scopes endpoint.
 */
export function getScopeInfo(): {
  requiredScopes: readonly string[];
  scopeDescriptions: Record<string, string>;
  apisCovered: string[];
  message: string;
} {
  return {
    requiredScopes: REQUIRED_SCOPES,
    scopeDescriptions: SCOPE_DESCRIPTIONS,
    apisCovered: APIS_COVERED,
    message: "These scopes provide access to all required Google APIs",
  };
}

/**
 * Resolves scope keys (e.g., "ga4", "gsc", "all") to full Google API scope URLs.
 * Returns an error string if an invalid key is encountered.
 *
 * @param scopeInput Raw scopes query parameter (comma-separated keys or "all")
 * @returns Object with either resolved scope URLs or an error
 */
export function resolveScopes(
  scopeInput: string,
): { scopes: string[]; error?: undefined } | { scopes?: undefined; error: string } {
  if (scopeInput === "all") {
    return {
      scopes: [SCOPE_MAP.ga4, SCOPE_MAP.gsc, SCOPE_MAP.gbp],
    };
  }

  const scopeKeys = scopeInput.split(",").map((s) => s.trim().toLowerCase());
  const resolved: string[] = [];

  for (const key of scopeKeys) {
    if (SCOPE_MAP[key]) {
      resolved.push(SCOPE_MAP[key]);
    } else {
      return { error: `Invalid scope key: ${key}` };
    }
  }

  if (resolved.length === 0) {
    return { error: "No valid scopes specified" };
  }

  return { scopes: resolved };
}

/**
 * Maps scope URLs to human-readable API names for response messages.
 *
 * @param scopes Array of scope URLs
 * @returns Human-readable description of scopes
 */
export function formatScopeNames(scopes: string[]): string {
  return scopes
    .map((s) => {
      if (s.includes("analytics")) return "Google Analytics 4";
      if (s.includes("webmasters")) return "Google Search Console";
      if (s.includes("business")) return "Google Business Profile";
      return s;
    })
    .join(", ");
}
