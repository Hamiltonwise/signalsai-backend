/**
 * useVocabulary — loads org vocabulary config on mount
 *
 * Returns the merged vocabulary (vertical defaults + org overrides).
 * Falls back to universal defaults if the API fails or org has no config.
 *
 * Usage:
 *   const vocab = useVocabulary();
 *   <p>{vocab.patientTerm} referral from {vocab.referralTerm}</p>
 */

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { apiGet } from "@/api/index";

export interface VocabularyConfig {
  vertical: string;
  patientTerm: string;
  referralTerm: string;
  caseType: string;
  primaryMetric: string;
  healthScoreLabel: string;
  competitorTerm: string;
  providerTerm: string;
  locationTerm: string;
  avgCaseValue: number;
  [key: string]: string | number; // allow custom overrides
}

const FALLBACK: VocabularyConfig = {
  vertical: "general",
  patientTerm: "customer",
  referralTerm: "referral source",
  caseType: "new customer",
  primaryMetric: "customer acquisition",
  healthScoreLabel: "Business Clarity Score",
  competitorTerm: "competitor",
  providerTerm: "owner",
  locationTerm: "business",
  avgCaseValue: 500,
};

export function useVocabulary(): VocabularyConfig {
  const { userProfile } = useAuth();
  const orgId = userProfile?.organizationId;

  const { data } = useQuery({
    queryKey: ["vocabulary", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const res = await apiGet({ path: `/org/${orgId}/vocabulary` });
      return res?.success ? res.vocabulary : null;
    },
    enabled: !!orgId,
    staleTime: 30 * 60_000, // 30 min — vocab doesn't change often
  });

  return data ? { ...FALLBACK, ...data } : FALLBACK;
}

export default useVocabulary;
