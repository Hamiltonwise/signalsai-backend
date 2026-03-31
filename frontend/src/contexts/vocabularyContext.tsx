/**
 * VocabularyProvider -- wraps the authenticated app with vocabulary context.
 *
 * Every component inside the provider can call useVocab() to get
 * vertical-appropriate terms. Falls back to universal terms if no
 * org config is loaded.
 *
 * Usage:
 *   const vocab = useVocab();
 *   <p>{vocab.patientTerm} referral from {vocab.referralTerm}</p>
 *
 * Universal fallback terms (what a barber sees):
 *   patientTerm: "customer"
 *   referralTerm: "referral source"
 *   locationTerm: "business"
 *   providerTerm: "owner"
 *   caseType: "new customer"
 *   competitorTerm: "competitor"
 */

import { createContext, useContext, type ReactNode } from "react";
import useVocabulary, { type VocabularyConfig } from "@/hooks/useVocabulary";

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

const VocabularyContext = createContext<VocabularyConfig>(FALLBACK);

export function VocabularyProvider({ children }: { children: ReactNode }) {
  const vocab = useVocabulary();
  return (
    <VocabularyContext.Provider value={vocab}>
      {children}
    </VocabularyContext.Provider>
  );
}

/**
 * useVocab -- shorthand context hook for vocabulary terms.
 * Use this in components instead of importing useVocabulary directly.
 */
export function useVocab(): VocabularyConfig {
  return useContext(VocabularyContext);
}

export default VocabularyProvider;
