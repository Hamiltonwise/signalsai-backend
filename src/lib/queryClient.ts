import { QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

// ─── QueryClient ─────────────────────────────────────────────────
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes — data is "fresh"
      gcTime: 24 * 60 * 60 * 1000, // 24 hours — cache retention
      refetchOnWindowFocus: false,
      refetchOnMount: true, // silent background refetch if stale
      refetchOnReconnect: false,
      retry: 1,
      retryDelay: 1000,
    },
  },
});

// ─── LocalStorage Persister ──────────────────────────────────────
export const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: "ALLORO_QUERY_CACHE",
  throttleTime: 1000,
  serialize: JSON.stringify,
  deserialize: JSON.parse,
});

export const persistOptions = {
  persister,
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  dehydrateOptions: {
    shouldDehydrateQuery: (query: { state: { status: string } }) =>
      query.state.status === "success",
  },
};

// ─── Query Key Factory ───────────────────────────────────────────
export const QUERY_KEYS = {
  // Admin — organizations
  organizations: ["admin", "organizations"] as const,
  organization: (id: number) => ["admin", "organization", id] as const,
  organizationLocations: (id: number) =>
    ["admin", "organization", id, "locations"] as const,

  // Admin — minds
  adminMinds: ["admin", "minds"] as const,

  // Admin — websites
  adminWebsites: (params?: { page?: number; limit?: number; status?: string }) =>
    ["admin", "websites", params] as const,
  adminWebsitesAll: ["admin", "websites"] as const,
  adminStatuses: ["admin", "website-statuses"] as const,

  // Admin — templates
  adminTemplates: ["admin", "templates"] as const,

  // Client — notifications
  notifications: (orgId: number | null, locationId: number | null) =>
    ["notifications", orgId, locationId] as const,

  // Client — settings
  settings: {
    users: ["settings", "users"] as const,
    scopes: ["settings", "scopes"] as const,
    pmsStatus: (orgId: number) => ["settings", "pms", orgId] as const,
  },

  // Client — agent data / dashboard
  agentData: (orgId: number | null, locationId?: number | null) =>
    ["agent-data", orgId, locationId] as const,
  tasks: (orgId: number | null, locationId?: number | null) =>
    ["tasks", orgId, locationId] as const,

  // Client — DFY website
  userWebsite: ["user", "website"] as const,
  websiteSubmissions: (params?: { page?: number; limit?: number }) =>
    ["user", "website", "submissions", params] as const,
  websiteRecipients: ["user", "website", "recipients"] as const,
} as const;
