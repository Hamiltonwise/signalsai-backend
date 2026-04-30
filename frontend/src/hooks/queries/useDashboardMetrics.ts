import { useQuery } from "@tanstack/react-query";
import { fetchDashboardMetrics } from "../../api/dashboardMetrics";
import type { DashboardMetrics } from "../../types/dashboardMetrics";

/**
 * useDashboardMetrics — TanStack Query hook for the deterministic
 * dashboard metrics dictionary. Disabled when `orgId` is null.
 *
 * Spec: plans/04282026-no-ticket-focus-dashboard-frontend/spec.md (T9)
 */
export function useDashboardMetrics(
  orgId: number | null,
  locationId: number | null
) {
  return useQuery<DashboardMetrics>({
    queryKey: ["dashboardMetrics", orgId, locationId],
    queryFn: () => fetchDashboardMetrics(orgId!, locationId),
    enabled: !!orgId && locationId != null,
    staleTime: 5 * 60 * 1000,
  });
}
