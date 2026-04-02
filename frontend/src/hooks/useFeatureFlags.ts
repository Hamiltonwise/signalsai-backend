/**
 * useFeatureFlags -- Fetches feature flags for a specific org.
 *
 * Used by the <FeatureGate> component to control rendering.
 * If a feature isn't enabled, the component is removed from the DOM entirely.
 */

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/api/index";

export function useFeatureFlags(orgId?: number) {
  return useQuery<Record<string, boolean>>({
    queryKey: ["feature-flags", orgId],
    queryFn: async () => {
      if (!orgId) return {};
      const res = await apiGet({ path: `/admin/feature-flags/org/${orgId}` });
      return res?.flags ?? {};
    },
    enabled: !!orgId,
    staleTime: 60_000, // Match backend cache TTL
    retry: 1,
  });
}
