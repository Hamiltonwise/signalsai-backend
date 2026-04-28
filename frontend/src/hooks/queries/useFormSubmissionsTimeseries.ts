import { useQuery } from "@tanstack/react-query";
import {
  fetchFormSubmissionsTimeseries,
  type TimeseriesPoint,
} from "../../api/formSubmissionsTimeseries";

/**
 * useFormSubmissionsTimeseries — TanStack Query hook for the
 * form-submissions monthly timeseries. Auth-derived org context, so this
 * is always enabled (the backend resolves the org from the JWT, mirroring
 * the existing `/stats` pattern).
 *
 * Spec: plans/04282026-no-ticket-focus-dashboard-frontend/spec.md (T9)
 */
export function useFormSubmissionsTimeseries(
  range: "3m" | "6m" | "12m" = "12m"
) {
  return useQuery<TimeseriesPoint[]>({
    queryKey: ["formSubmissionsTimeseries", range],
    queryFn: () => fetchFormSubmissionsTimeseries(range),
    staleTime: 5 * 60 * 1000,
  });
}
