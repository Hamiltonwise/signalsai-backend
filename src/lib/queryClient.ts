import { QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

// ─── QueryClient ─────────────────────────────────────────────────
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0, // Always stale — show cached instantly, refetch silently in background
      gcTime: 24 * 60 * 60 * 1000, // 24 hours — cache retention
      refetchOnWindowFocus: false,
      refetchOnMount: true, // silent background refetch on every mount
      refetchOnReconnect: true, // refetch when network reconnects
      retry: 1,
      retryDelay: 1000,
      placeholderData: (previousData: unknown) => previousData, // show previous data while refetching
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

  // Admin — schedules
  adminSchedules: ["admin", "schedules"] as const,
  adminScheduleRuns: (scheduleId: number) =>
    ["admin", "schedule-runs", scheduleId] as const,

  // Admin — org sub-tab data (tasks, notifications, rankings, PMS, agent outputs)
  adminOrgTasks: (orgId: number, params?: Record<string, unknown>) =>
    ["admin", "org-tasks", orgId, params] as const,
  adminOrgTasksAll: (orgId: number) =>
    ["admin", "org-tasks", orgId] as const,
  adminOrgNotifications: (orgId: number, params?: Record<string, unknown>) =>
    ["admin", "org-notifications", orgId, params] as const,
  adminOrgNotificationsAll: (orgId: number) =>
    ["admin", "org-notifications", orgId] as const,
  adminOrgRankings: (orgId: number, locationId?: number | null) =>
    ["admin", "org-rankings", orgId, locationId] as const,
  adminOrgPmsJobs: (orgId: number, params?: Record<string, unknown>) =>
    ["admin", "org-pms-jobs", orgId, params] as const,
  adminOrgPmsJobsAll: (orgId: number) =>
    ["admin", "org-pms-jobs", orgId] as const,
  adminOrgPmsKeyData: (orgId: number, locationId?: number | null) =>
    ["admin", "org-pms-key-data", orgId, locationId] as const,
  adminOrgAgentOutputs: (orgId: number, agentType: string, params?: Record<string, unknown>) =>
    ["admin", "org-agent-outputs", orgId, agentType, params] as const,
  adminOrgAgentOutputsAll: (orgId: number) =>
    ["admin", "org-agent-outputs", orgId] as const,

  // Admin — standalone pages
  adminAgentOutputs: (params?: Record<string, unknown>) =>
    ["admin", "agent-outputs", params] as const,
  adminAgentOutputsAll: ["admin", "agent-outputs"] as const,
  adminAgentOutputOrgs: ["admin", "agent-output-orgs"] as const,
  adminAgentOutputTypes: ["admin", "agent-output-types"] as const,
  adminActionItems: (params?: Record<string, unknown>) =>
    ["admin", "action-items", params] as const,
  adminActionItemsAll: ["admin", "action-items"] as const,
  adminActionItemOrgs: ["admin", "action-item-orgs"] as const,
  adminInsightsSummary: (page: number, month: string) =>
    ["admin", "insights-summary", page, month] as const,
  adminInsightsSummaryAll: ["admin", "insights-summary"] as const,
  adminInsightsRecommendations: (agentType: string, page: number, month?: string | null) =>
    ["admin", "insights-recommendations", agentType, page, month] as const,
  adminInsightsRecommendationsAll: (agentType: string) =>
    ["admin", "insights-recommendations", agentType] as const,

  // Admin — website detail
  adminWebsiteDetail: (uuid: string) =>
    ["admin", "website-detail", uuid] as const,

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
