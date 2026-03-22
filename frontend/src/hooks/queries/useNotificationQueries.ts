import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryClient, QUERY_KEYS } from "../../lib/queryClient";
import {
  fetchNotifications,
  type NotificationsResponse,
} from "../../api/notifications";

// ─── Queries ────────────────────────────────────────────────────────

export function useNotifications(
  orgId: number | null,
  locationId: number | null
) {
  return useQuery<NotificationsResponse>({
    queryKey: QUERY_KEYS.notifications(orgId, locationId),
    queryFn: () => fetchNotifications(orgId!, locationId),
    enabled: !!orgId,
    staleTime: 0,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    initialData: () =>
      queryClient.getQueryData<NotificationsResponse>(
        QUERY_KEYS.notifications(orgId, locationId)
      ),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(QUERY_KEYS.notifications(orgId, locationId))
        ?.dataUpdatedAt,
  });
}

// ─── Invalidation ───────────────────────────────────────────────────

export function useInvalidateNotifications() {
  const qc = useQueryClient();

  const invalidateAll = () =>
    qc.invalidateQueries({ queryKey: ["notifications"] });

  return { invalidateAll };
}
