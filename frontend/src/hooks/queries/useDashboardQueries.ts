/**
 * TanStack Query hooks for dashboard components.
 *
 * Each hook uses the initialData + initialDataUpdatedAt pattern so that
 * previously-cached data is returned synchronously on mount while a
 * background refetch runs if stale.
 */

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryClient, QUERY_KEYS } from "../../lib/queryClient";

// ─── API imports ─────────────────────────────────────────────────
import agents from "../../api/agents";
import { fetchClientTasks } from "../../api/tasks";
import type { GroupedActionItemsResponse } from "../../types/tasks";

// =====================================================================
// QUERY HOOKS
// =====================================================================

/**
 * Latest agent data for the current org/location.
 * Skips fetching when the onboarding wizard is active (demo data is used instead).
 */
export function useAgentDataQuery(
  orgId: number | null,
  locationId?: number | null,
  isWizardActive?: boolean,
) {
  const queryKey = QUERY_KEYS.agentData(orgId, locationId);

  return useQuery({
    queryKey,
    queryFn: async () => {
      const json = await agents.getLatestAgentData(orgId!, locationId);

      if (json.successful === false) {
        throw new Error(json.errorMessage || "Failed to fetch agent data");
      }

      return json;
    },
    enabled: !!orgId && !isWizardActive,
    staleTime: 10 * 60 * 1000, // 10 minutes -- agent data doesn't change frequently
    initialData: () => queryClient.getQueryData(queryKey),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(queryKey)?.dataUpdatedAt,
  });
}

/**
 * Client tasks grouped by category (ALLORO / USER).
 */
export function useClientTasks(
  orgId: number | null,
  locationId?: number | null,
) {
  const queryKey = QUERY_KEYS.tasks(orgId, locationId);

  return useQuery<GroupedActionItemsResponse>({
    queryKey,
    queryFn: () => fetchClientTasks(orgId!, locationId),
    enabled: !!orgId,
    initialData: () =>
      queryClient.getQueryData<GroupedActionItemsResponse>(queryKey),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(queryKey)?.dataUpdatedAt,
  });
}

// =====================================================================
// INVALIDATION HOOKS
// =====================================================================

/**
 * Invalidate agent data queries (all org/location variants).
 */
export function useInvalidateAgentData() {
  const qc = useQueryClient();

  const invalidateAll = useCallback(
    () => qc.invalidateQueries({ queryKey: ["agent-data"] }),
    [qc],
  );

  return { invalidateAll };
}

/**
 * Invalidate client tasks queries (all org/location variants).
 */
export function useInvalidateClientTasks() {
  const qc = useQueryClient();

  const invalidateAll = useCallback(
    () => qc.invalidateQueries({ queryKey: ["tasks"] }),
    [qc],
  );

  return { invalidateAll };
}
