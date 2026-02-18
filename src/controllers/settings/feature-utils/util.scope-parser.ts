export const SCOPE_MAP = {
  ga4: "https://www.googleapis.com/auth/analytics.readonly",
  gsc: "https://www.googleapis.com/auth/webmasters.readonly",
  gbp: "https://www.googleapis.com/auth/business.manage",
} as const;

export function parseScopes(scopeString: string | null | undefined): string[] {
  const raw = scopeString || "";

  let grantedScopes: string[] = [];
  if (raw.includes(" ")) {
    grantedScopes = raw.split(" ");
  } else if (raw.includes(",")) {
    grantedScopes = raw.split(",");
  } else if (raw.length > 0) {
    grantedScopes = [raw];
  }

  return grantedScopes
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0);
}

export function buildScopeStatus(normalizedScopes: string[]) {
  return {
    ga4: {
      granted: normalizedScopes.includes(SCOPE_MAP.ga4),
      scope: SCOPE_MAP.ga4,
      name: "Google Analytics 4",
      description: "Read-only access to analytics data and reports",
    },
    gsc: {
      granted: normalizedScopes.includes(SCOPE_MAP.gsc),
      scope: SCOPE_MAP.gsc,
      name: "Google Search Console",
      description: "Read-only access to search performance data",
    },
    gbp: {
      granted: normalizedScopes.includes(SCOPE_MAP.gbp),
      scope: SCOPE_MAP.gbp,
      name: "Google Business Profile",
      description:
        "Manage business listings (used for read access and future review replies)",
    },
  };
}

export function getMissingScopes(
  scopeStatus: Record<string, { granted: boolean }>
): string[] {
  return Object.entries(scopeStatus)
    .filter(([_, status]) => !status.granted)
    .map(([key]) => key);
}
