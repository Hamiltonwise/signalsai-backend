/**
 * Tier Gating Service -- DWY (Done With You) vs DFY (Done For You)
 *
 * Not "plans." Levels of care.
 *
 * DWY (Function Health): "I can see inside my business."
 *   - Business Clarity Score + rankings + competitive monitoring
 *   - Monday email with Oz moments + one action card
 *   - Referral intelligence (upload + analysis)
 *   - Competitor tracking + market position
 *   - Data export
 *   - CS Agent chat
 *
 * DFY (GLP-1): "It's handled."
 *   - Everything in DWY, plus:
 *   - PatientPath website built + maintained
 *   - SEO + AEO running automatically
 *   - Review request system
 *   - Review response auto-drafts
 *   - Referral thank-you letters
 *   - GP discovery + outreach
 *   - ClearPath referral page
 *
 * Foundation: Full DFY, free forever.
 *   - Veterans, active duty spouses, first responders, Gold Star families
 *
 * The upgrade from DWY to DFY should never feel like a sales pitch.
 * It should feel like the natural conclusion of watching your own data.
 * "You can see the problem. Want us to fix it?"
 */

export type AlloroTier = "free" | "dwy" | "dfy" | "foundation";

export interface TierConfig {
  tier: AlloroTier;
  label: string;
  tagline: string;
  monthlyPrice: number;
  features: {
    // Intelligence (DWY core)
    businessClarityScore: boolean;
    competitiveMonitoring: boolean;
    mondayEmail: boolean;
    ozMoments: boolean;
    oneActionCard: boolean;
    referralIntelligence: boolean;
    dataUpload: boolean;
    dataExport: boolean;
    csAgentChat: boolean;
    streaks: boolean;
    milestoneCards: boolean;

    // Autonomy (DFY additions)
    patientpathWebsite: boolean;
    seoManagement: boolean;
    aeoOptimization: boolean;
    reviewRequests: boolean;
    reviewResponseDrafts: boolean;
    referralThankYous: boolean;
    gpDiscoveryOutreach: boolean;
    clearPathPage: boolean;
    lobPhysicalCards: boolean;
  };
}

const TIER_CONFIGS: Record<AlloroTier, TierConfig> = {
  free: {
    tier: "free",
    label: "Business Clarity Score",
    tagline: "See inside your business. 60 seconds. Free.",
    monthlyPrice: 0,
    features: {
      businessClarityScore: true,
      competitiveMonitoring: false,
      mondayEmail: false,
      ozMoments: true, // Oz moments are the hook. Always show them.
      oneActionCard: false,
      referralIntelligence: false,
      dataUpload: false,
      dataExport: false,
      csAgentChat: false,
      streaks: false,
      milestoneCards: false,
      patientpathWebsite: false,
      seoManagement: false,
      aeoOptimization: false,
      reviewRequests: false,
      reviewResponseDrafts: false,
      referralThankYous: false,
      gpDiscoveryOutreach: false,
      clearPathPage: false,
      lobPhysicalCards: false,
    },
  },
  dwy: {
    tier: "dwy",
    label: "Clarity",
    tagline: "See what's happening. Know what to do.",
    monthlyPrice: 400, // Corey to confirm pricing
    features: {
      businessClarityScore: true,
      competitiveMonitoring: true,
      mondayEmail: true,
      ozMoments: true,
      oneActionCard: true,
      referralIntelligence: true,
      dataUpload: true,
      dataExport: true,
      csAgentChat: true,
      streaks: true,
      milestoneCards: true,
      patientpathWebsite: false,
      seoManagement: false,
      aeoOptimization: false,
      reviewRequests: false,
      reviewResponseDrafts: false,
      referralThankYous: false,
      gpDiscoveryOutreach: false,
      clearPathPage: false,
      lobPhysicalCards: false,
    },
  },
  dfy: {
    tier: "dfy",
    label: "Clarity + Freedom",
    tagline: "It's handled. Focus on your craft and your family.",
    monthlyPrice: 2000,
    features: {
      businessClarityScore: true,
      competitiveMonitoring: true,
      mondayEmail: true,
      ozMoments: true,
      oneActionCard: true,
      referralIntelligence: true,
      dataUpload: true,
      dataExport: true,
      csAgentChat: true,
      streaks: true,
      milestoneCards: true,
      patientpathWebsite: true,
      seoManagement: true,
      aeoOptimization: true,
      reviewRequests: true,
      reviewResponseDrafts: true,
      referralThankYous: true,
      gpDiscoveryOutreach: true,
      clearPathPage: true,
      lobPhysicalCards: true,
    },
  },
  foundation: {
    tier: "foundation",
    label: "Heroes & Founders",
    tagline: "You served your community. Now your community serves you.",
    monthlyPrice: 0,
    features: {
      // Full DFY, free forever
      businessClarityScore: true,
      competitiveMonitoring: true,
      mondayEmail: true,
      ozMoments: true,
      oneActionCard: true,
      referralIntelligence: true,
      dataUpload: true,
      dataExport: true,
      csAgentChat: true,
      streaks: true,
      milestoneCards: true,
      patientpathWebsite: true,
      seoManagement: true,
      aeoOptimization: true,
      reviewRequests: true,
      reviewResponseDrafts: true,
      referralThankYous: true,
      gpDiscoveryOutreach: true,
      clearPathPage: true,
      lobPhysicalCards: true,
    },
  },
};

/**
 * Get the tier config for an organization.
 */
export function getTierConfig(tier: AlloroTier): TierConfig {
  return TIER_CONFIGS[tier] || TIER_CONFIGS.free;
}

/**
 * Check if a specific feature is available for a tier.
 */
export function hasFeature(tier: AlloroTier, feature: keyof TierConfig["features"]): boolean {
  const config = getTierConfig(tier);
  return config.features[feature] ?? false;
}

/**
 * Get the list of DFY features a DWY user doesn't have yet.
 * Used for the upgrade prompt: "We found 3 things we could do for you."
 */
export function getUpgradeableFeatures(currentTier: AlloroTier): Array<{
  feature: string;
  label: string;
  description: string;
}> {
  if (currentTier !== "dwy") return [];

  return [
    {
      feature: "patientpathWebsite",
      label: "Your website, built and running",
      description: "A site built from your reviews, your strengths, and what makes you irreplaceable. Already indexed. Already ranking.",
    },
    {
      feature: "seoManagement",
      label: "Search visibility on autopilot",
      description: "Your online presence optimized automatically. When someone searches for your specialty, they find you.",
    },
    {
      feature: "aeoOptimization",
      label: "Be the AI answer",
      description: "When someone asks Siri, ChatGPT, or Google for a recommendation, your business is the answer.",
    },
    {
      feature: "reviewRequests",
      label: "Review requests sent for you",
      description: "Your customers get a gentle, personalized review request. You don't send it. We do.",
    },
    {
      feature: "reviewResponseDrafts",
      label: "Review responses drafted",
      description: "Every new review gets a thoughtful, personalized response draft. You approve or edit. One tap.",
    },
    {
      feature: "referralThankYous",
      label: "Referral thank-you letters",
      description: "When someone sends you a customer, they get a handwritten-feeling thank-you. Automatically.",
    },
    {
      feature: "gpDiscoveryOutreach",
      label: "New referral source discovery",
      description: "We find professionals in your area who should be sending you customers but aren't yet. And introduce you.",
    },
  ];
}

/**
 * Generate the natural upgrade prompt for a DWY user.
 * Based on their actual data, not a generic upsell.
 * "You can see the problem. Want us to fix it?"
 */
export function generateUpgradeContext(
  tier: AlloroTier,
  data: {
    hasWebsite: boolean;
    reviewCount: number;
    competitorReviewCount: number;
    rankPosition: number | null;
    referralSourceCount: number;
  },
): string | null {
  if (tier !== "dwy") return null;

  // Find the most compelling reason to upgrade based on THEIR data
  if (!data.hasWebsite && data.rankPosition && data.rankPosition > 3) {
    return `You don't have a website yet. We can build one from your reviews and start improving your Google visibility this week.`;
  }

  if (data.competitorReviewCount > data.reviewCount * 1.5) {
    return `Your competitor has ${data.competitorReviewCount - data.reviewCount} more reviews. We can send review requests to your customers automatically.`;
  }

  if (data.referralSourceCount > 0 && data.referralSourceCount <= 3) {
    return `You have ${data.referralSourceCount} referral source${data.referralSourceCount !== 1 ? "s" : ""}. We can find and introduce you to more professionals who should be sending you customers.`;
  }

  return `You can see what's happening in your market. Want us to start fixing the gaps we found?`;
}
