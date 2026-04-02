/**
 * useBusinessMetrics -- Single React Query hook for all admin dashboards.
 *
 * Calls GET /api/admin/metrics which computes from the single source of truth
 * in src/services/businessMetrics.ts. No admin page should compute MRR locally.
 */

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/api/index";

export interface PayingClient {
  id: number;
  name: string;
  mrr: number;
  health: "green" | "amber" | "red";
  lastLogin: string;
  lastLoginRaw: string | null;
  insight: string;
  concentration: number;
}

export interface PipelineData {
  totalSignups: number;
  checkupStarted: number;
  accountCreated: number;
  inTrial: number;
  onboardingComplete: number;
  paying: number;
  conversionRates: {
    checkupToAccount: number;
    accountToTrial: number;
    trialToOnboarded: number;
    overallToPaying: number;
  };
  recentSignups: { id: number; name: string; createdAt: string }[];
}

export interface BusinessMetrics {
  mrr: {
    total: number;
    byOrg: Record<number, number>;
    burn: number;
    delta: number;
    isProfitable: boolean;
    payingCount: number;
    burnMultiple: number | null;
    arpu: number;
  };
  clients: PayingClient[];
  pipeline: PipelineData;
  health: {
    green: number;
    amber: number;
    red: number;
  };
}

export function useBusinessMetrics() {
  return useQuery<BusinessMetrics>({
    queryKey: ["admin-business-metrics"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/metrics" });
      return res;
    },
    staleTime: 30_000,
    retry: 1,
  });
}
