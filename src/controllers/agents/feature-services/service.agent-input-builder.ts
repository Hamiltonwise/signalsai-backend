/**
 * Agent Input Builder Service
 *
 * Pure functions that build payloads for each agent type.
 * No side effects, no DB calls, no logging.
 */

import { log } from "../feature-utils/agentLogger";

// =====================================================================
// PROOFLINE (DAILY)
// =====================================================================

export function buildProoflinePayload(params: {
  domain: string;
  googleAccountId: number;
  dates: { yesterday: string; dayBeforeYesterday: string };
  dayBeforeYesterdayData: any;
  yesterdayData: any;
}): any {
  return {
    agent: "proofline",
    domain: params.domain,
    googleAccountId: params.googleAccountId,
    dateRange: {
      yesterday: params.dates.yesterday,
      dayBeforeYesterday: params.dates.dayBeforeYesterday,
    },
    additional_data: {
      yesterday: params.yesterdayData,
      dayBeforeYesterday: params.dayBeforeYesterdayData,
    },
  };
}

// =====================================================================
// SUMMARY (MONTHLY)
// =====================================================================

export function buildSummaryPayload(params: {
  domain: string;
  googleAccountId: number;
  startDate: string;
  endDate: string;
  monthData: any;
  pmsData?: any;
  clarityData?: any;
}): any {
  return {
    agent: "summary",
    domain: params.domain,
    googleAccountId: params.googleAccountId,
    dateRange: {
      start: params.startDate,
      end: params.endDate,
    },
    additional_data: {
      ...params.monthData,
      pms: params.pmsData || null,
      // clarity: params.clarityData || null,  // Temporarily disabled for testing
    },
  };
}

// =====================================================================
// OPPORTUNITY (MONTHLY)
// =====================================================================

export function buildOpportunityPayload(params: {
  domain: string;
  googleAccountId: number;
  startDate: string;
  endDate: string;
  summaryOutput: any;
}): any {
  return {
    agent: "opportunity",
    domain: params.domain,
    googleAccountId: params.googleAccountId,
    dateRange: {
      start: params.startDate,
      end: params.endDate,
    },
    additional_data: params.summaryOutput,
  };
}

// =====================================================================
// REFERRAL ENGINE (MONTHLY)
// =====================================================================

export function buildReferralEnginePayload(params: {
  domain: string;
  googleAccountId: number;
  startDate: string;
  endDate: string;
  monthData: any;
  pmsData?: any;
  clarityData?: any;
}): any {
  return {
    agent: "referral_engine",
    domain: params.domain,
    googleAccountId: params.googleAccountId,
    dateRange: {
      start: params.startDate,
      end: params.endDate,
    },
    additional_data: {
      // TODO: Revert this when needed
      // ...params.monthData,  // Contains gbpData, clarityData
      pms: params.pmsData || null,
      // clarity: params.clarityData || null,  // Temporarily disabled for testing
    },
  };
}

// =====================================================================
// CRO OPTIMIZER (MONTHLY)
// =====================================================================

export function buildCroOptimizerPayload(params: {
  domain: string;
  googleAccountId: number;
  startDate: string;
  endDate: string;
  summaryOutput: any;
}): any {
  return {
    agent: "cro_optimizer",
    domain: params.domain,
    googleAccountId: params.googleAccountId,
    dateRange: {
      start: params.startDate,
      end: params.endDate,
    },
    additional_data: params.summaryOutput,
  };
}

// =====================================================================
// GUARDIAN / GOVERNANCE
// =====================================================================

export function buildGuardianGovernancePayload(
  agentUnderTest: string,
  outputs: any[],
  passedRecommendations?: any[],
  rejectedRecommendations?: any[],
): any {
  return {
    additional_data: {
      agent_under_test: agentUnderTest,
      outputs: outputs,
      historical_context: {
        passed_recommendations: passedRecommendations || [],
        rejected_recommendations: rejectedRecommendations || [],
        summary: {
          total_passed: passedRecommendations?.length || 0,
          total_rejected: rejectedRecommendations?.length || 0,
        },
      },
    },
  };
}

// =====================================================================
// GBP COPY COMPANION
// =====================================================================

/**
 * Build payload for Copy Companion agent from GBP data
 */
export function buildCopyCompanionPayload(
  gbpData: any,
  domain: string,
  googleAccountId: number,
): any {
  log(`  [GBP-OPTIMIZER] Building Copy Companion payload for ${domain}`);

  const textSources = [];

  for (const location of gbpData.locations) {
    const locationName = location.meta?.businessName || "Unknown Location";
    log(`    \u2192 Processing location: ${locationName}`);

    const profile = location.gbp_profile;
    const posts = location.gbp_posts;

    // Add profile fields
    if (profile?.description) {
      textSources.push({
        field: "business_description",
        text: profile.description,
      });
      log(
        `      \u2713 Added business_description (${profile.description.length} chars)`,
      );
    }

    if (profile?.profile?.description) {
      textSources.push({
        field: "bio",
        text: profile.profile.description,
      });
      log(`      \u2713 Added bio (${profile.profile.description.length} chars)`);
    }

    if (profile?.callToAction?.actionType) {
      const ctaText = `${profile.callToAction.actionType}: ${
        profile.callToAction.url || ""
      }`;
      textSources.push({
        field: "cta",
        text: ctaText,
      });
      log(`      \u2713 Added CTA: ${profile.callToAction.actionType}`);
    }

    // Add posts
    log(`      \u2192 Processing ${posts.length} posts`);
    posts.forEach((post: any, index: number) => {
      if (post.summary) {
        textSources.push({
          field: `gbp_post_${index + 1}`,
          text: post.summary,
          metadata: {
            postId: post.postId,
            createTime: post.createTime,
            topicType: post.topicType,
            locationName: locationName,
          },
        });
      }
    });
    log(`      \u2713 Added ${posts.length} posts`);
  }

  log(
    `  [GBP-OPTIMIZER] \u2713 Built payload with ${textSources.length} text sources`,
  );

  return {
    additional_data: {
      text_sources: textSources,
    },
    domain: domain,
    googleAccountId: googleAccountId,
  };
}
