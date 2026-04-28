import { useQuery } from "@tanstack/react-query";
import {
  fetchRankingHistory,
  type RankingHistoryPoint,
} from "../../api/rankingHistory";

/**
 * useRankingHistory — TanStack Query hook for the practice-ranking
 * history series. Disabled when `orgId` is null.
 *
 * Spec: plans/04282026-no-ticket-focus-dashboard-frontend/spec.md (T9)
 */
export function useRankingHistory(
  orgId: number | null,
  locationId: number | null,
  range: "3m" | "6m" = "6m"
) {
  return useQuery<RankingHistoryPoint[]>({
    queryKey: ["rankingHistory", orgId, locationId, range],
    queryFn: () => fetchRankingHistory(orgId!, locationId, range),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}
