/**
 * useTier -- Frontend hook for tier-aware feature gating
 *
 * Returns the current tier, whether a feature is available,
 * and the natural upgrade context (data-driven, never salesy).
 *
 * Usage:
 *   const { tier, hasFeature, upgradeContext } = useTier();
 *   if (!hasFeature("reviewRequests")) {
 *     // Show the upgrade prompt with upgradeContext
 *   }
 */

import { useAuth } from "./useAuth";

export type AlloroTier = "free" | "dwy" | "dfy" | "foundation";

// Features available at each tier
const TIER_FEATURES: Record<AlloroTier, Set<string>> = {
  free: new Set([
    "businessClarityScore",
    "ozMoments",
  ]),
  dwy: new Set([
    "businessClarityScore",
    "competitiveMonitoring",
    "mondayEmail",
    "ozMoments",
    "oneActionCard",
    "referralIntelligence",
    "dataUpload",
    "dataExport",
    "csAgentChat",
    "streaks",
    "milestoneCards",
  ]),
  dfy: new Set([
    "businessClarityScore",
    "competitiveMonitoring",
    "mondayEmail",
    "ozMoments",
    "oneActionCard",
    "referralIntelligence",
    "dataUpload",
    "dataExport",
    "csAgentChat",
    "streaks",
    "milestoneCards",
    "patientpathWebsite",
    "seoManagement",
    "aeoOptimization",
    "reviewRequests",
    "reviewResponseDrafts",
    "referralThankYous",
    "gpDiscoveryOutreach",
    "clearPathPage",
    "lobPhysicalCards",
  ]),
  foundation: new Set([
    // Everything in DFY
    "businessClarityScore",
    "competitiveMonitoring",
    "mondayEmail",
    "ozMoments",
    "oneActionCard",
    "referralIntelligence",
    "dataUpload",
    "dataExport",
    "csAgentChat",
    "streaks",
    "milestoneCards",
    "patientpathWebsite",
    "seoManagement",
    "aeoOptimization",
    "reviewRequests",
    "reviewResponseDrafts",
    "referralThankYous",
    "gpDiscoveryOutreach",
    "clearPathPage",
    "lobPhysicalCards",
  ]),
};

const TIER_LABELS: Record<AlloroTier, string> = {
  free: "Business Clarity Score",
  dwy: "Clarity",
  dfy: "Clarity + Freedom",
  foundation: "Heroes & Founders",
};

export function useTier() {
  const { billingStatus } = useAuth();

  // Determine tier from billing status
  const tier: AlloroTier = (() => {
    if (billingStatus?.isFoundation) return "foundation";
    if (billingStatus?.subscriptionTier === "DFY" || billingStatus?.hasStripeSubscription) return "dfy";
    if (billingStatus?.subscriptionTier === "DWY") return "dwy";
    if (billingStatus?.isAdminGranted) return "dfy"; // Admin-granted = full access
    return "free";
  })();

  const features = TIER_FEATURES[tier] || TIER_FEATURES.free;

  return {
    tier,
    tierLabel: TIER_LABELS[tier],
    hasFeature: (feature: string) => features.has(feature),
    isDWY: tier === "dwy",
    isDFY: tier === "dfy" || tier === "foundation",
    isFoundation: tier === "foundation",
    canUpgrade: tier === "dwy" || tier === "free",
  };
}
