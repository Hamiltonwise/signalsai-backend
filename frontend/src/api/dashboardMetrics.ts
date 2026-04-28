import { apiGet } from "./index";
import type { DashboardMetrics } from "../types/dashboardMetrics";

/**
 * Dashboard Metrics API client
 *
 * Wraps `GET /api/dashboard/metrics` (Plan 1 backend).
 * Backend envelope: `{ success: true, data: DashboardMetrics }`.
 * This helper unwraps the envelope and returns `data` directly.
 *
 * Spec: plans/04282026-no-ticket-focus-dashboard-frontend/spec.md (T9)
 */

interface DashboardMetricsResponse {
  success: boolean;
  data?: DashboardMetrics;
  errorMessage?: string;
}

export async function fetchDashboardMetrics(
  organizationId: number,
  locationId: number | null
): Promise<DashboardMetrics> {
  const params = new URLSearchParams();
  params.set("organization_id", String(organizationId));
  if (locationId != null) params.set("location_id", String(locationId));

  const response = (await apiGet({
    path: `/dashboard/metrics?${params.toString()}`,
  })) as DashboardMetricsResponse;

  if (!response?.success || !response.data) {
    throw new Error(
      response?.errorMessage || "Failed to fetch dashboard metrics"
    );
  }

  return response.data;
}
