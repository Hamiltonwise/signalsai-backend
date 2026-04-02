/**
 * useBusinessMetrics -- Single React Query hook for all admin dashboards.
 *
 * Calls GET /api/admin/metrics which computes from the single source of truth
 * in src/services/businessMetrics.ts. No admin page should compute MRR locally.
 */

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/api/index";

export interface BusinessMetrics {
  mrr: {
    total: number;
    byOrg: Record<number, number>;
    burn: number;
    delta: number;
    isProfitable: boolean;
    payingCount: number;
  };
  health: {
    green: number;
    amber: number;
    red: number;
  };
  orgCount: {
    total: number;
    active: number;
    growth: number;
  };
}

export function useBusinessMetrics() {
  return useQuery<BusinessMetrics>({
    queryKey: ["admin-business-metrics"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/metrics" });
      return res;
    },
    staleTime: 30_000, // 30s -- fresh enough for dashboards
    retry: 1,
  });
}
