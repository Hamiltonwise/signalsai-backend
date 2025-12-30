/**
 * Ranking Service
 *
 * Shared logic for Practice Ranking Analysis.
 * Used by:
 * - src/routes/practiceRanking.ts (Admin Trigger)
 * - src/routes/agentsV2.ts (Automated API Run)
 */

import { db } from "../database/connection";
import { getValidOAuth2Client } from "../auth/oauth2Helper";
import {
  fetchGBPDataForRange,
  fetchGSCDataForRange,
} from "../services/dataAggregator";
import {
  discoverCompetitors,
  getCompetitorDetails,
  auditWebsite,
  getSpecialtyKeywords,
} from "../services/apifyService";
import {
  getCachedCompetitors,
  setCachedCompetitors,
} from "../services/competitorCache";
import {
  calculateRankingScore,
  rankPractices,
  calculateBenchmarks,
  PracticeData,
  FACTOR_WEIGHTS,
} from "../services/rankingAlgorithm";
import { createNotification } from "../utils/notificationHelper";
import axios from "axios";

// Webhook URL from environment
const PRACTICE_RANKING_ANALYSIS_WEBHOOK =
  process.env.PRACTICE_RANKING_ANALYSIS_AGENT_WEBHOOK || "";

// Batch processing configuration
export const MAX_RETRIES = 3;
export const RETRY_DELAY_MS = 5000;

export interface StatusDetail {
  currentStep: string;
  message: string;
  progress: number;
  stepsCompleted: string[];
  timestamps: Record<string, string>;
}

export interface LocationRankingResult {
  rankingId: number;
  gbpLocationId: string;
  gbpLocationName: string;
  rankScore: number;
  rankPosition: number;
}

/**
 * Sum values from GBP performance time series data
 */
function sumPerformanceMetric(
  performanceSeries: any[],
  metricName: string
): number {
  if (!performanceSeries || !Array.isArray(performanceSeries)) return 0;

  for (const multiSeries of performanceSeries) {
    const dailyMetricList = multiSeries?.dailyMetricTimeSeries || [];
    for (const series of dailyMetricList) {
      if (series.dailyMetric === metricName) {
        const datedValues = series?.timeSeries?.datedValues || [];
        return datedValues.reduce((sum: number, dv: any) => {
          const value = dv?.value !== undefined ? parseInt(dv.value, 10) : 0;
          return sum + (isNaN(value) ? 0 : value);
        }, 0);
      }
    }
  }
  return 0;
}

/**
 * Extract performance metrics from GBP data
 */
function extractPerformanceMetrics(gbpData: any): {
  calls: number;
  directions: number;
  clicks: number;
} {
  const performanceSeries = gbpData?.performance?.series || [];
  return {
    calls: sumPerformanceMetric(performanceSeries, "CALL_CLICKS"),
    directions: sumPerformanceMetric(
      performanceSeries,
      "BUSINESS_DIRECTION_REQUESTS"
    ),
    clicks: sumPerformanceMetric(performanceSeries, "WEBSITE_CLICKS"),
  };
}

/**
 * Update ranking status in database
 */
export async function updateStatus(
  rankingId: number,
  status: string,
  step: string,
  message: string,
  progress: number,
  existingDetail?: StatusDetail,
  logger?: (msg: string) => void
): Promise<void> {
  const detail: StatusDetail = existingDetail || {
    currentStep: step,
    message: message,
    progress: progress,
    stepsCompleted: [],
    timestamps: { started_at: new Date().toISOString() },
  };

  detail.currentStep = step;
  detail.message = message;
  detail.progress = progress;
  detail.timestamps[`${step}_at`] = new Date().toISOString();

  if (progress > 0 && !detail.stepsCompleted.includes(step)) {
    const steps = [
      "queued",
      "fetching_client_gbp",
      "fetching_client_gsc",
      "discovering_competitors",
      "scraping_competitors",
      "auditing_website",
      "calculating_scores",
      "awaiting_llm",
      "done",
    ];
    const currentIndex = steps.indexOf(step);
    if (currentIndex > 0) {
      detail.stepsCompleted = steps.slice(0, currentIndex);
    }
  }

  await db("practice_rankings")
    .where({ id: rankingId })
    .update({
      status: status,
      status_detail: JSON.stringify(detail),
      updated_at: new Date(),
    });

  if (logger) {
    logger(
      `[RANKING] [${rankingId}] Status: ${status} - ${step} (${progress}%): ${message}`
    );
  }
}

/**
 * Process ranking analysis for a single location
 */
export async function processLocationRanking(
  rankingId: number,
  googleAccountId: number,
  gbpAccountId: string,
  gbpLocationId: string,
  gbpLocationName: string,
  specialty: string,
  marketLocation: string,
  domain: string,
  batchId: string,
  logger?: (msg: string) => void
): Promise<LocationRankingResult> {
  const startTime = Date.now();
  const log = logger || console.log;

  log(
    `[RANKING] [${rankingId}] START: ${gbpLocationName} (${specialty} in ${marketLocation})`
  );

  let statusDetail: StatusDetail = {
    currentStep: "queued",
    message: "Analysis queued",
    progress: 0,
    stepsCompleted: [],
    timestamps: { started_at: new Date().toISOString() },
  };

  // Get account details
  const account = await db("google_accounts")
    .where({ id: googleAccountId })
    .first();

  if (!account) {
    throw new Error(`Account ${googleAccountId} not found`);
  }

  const propertyIds =
    typeof account.google_property_ids === "string"
      ? JSON.parse(account.google_property_ids)
      : account.google_property_ids;

  // Get OAuth client
  const oauth2Client = await getValidOAuth2Client(googleAccountId);

  // Get date range (last 30 days)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  const startDateStr = startDate.toISOString().split("T")[0];
  const endDateStr = endDate.toISOString().split("T")[0];

  // ========== STEP 1: Fetch GBP Data ==========
  await updateStatus(
    rankingId,
    "processing",
    "fetching_client_gbp",
    `Fetching GBP data for ${gbpLocationName}...`,
    10,
    statusDetail,
    log
  );

  const targetLocation = propertyIds?.gbp?.find(
    (loc: any) =>
      loc.locationId === gbpLocationId && loc.accountId === gbpAccountId
  );

  if (!targetLocation) {
    throw new Error(
      `GBP location ${gbpLocationId} not found in account ${googleAccountId}`
    );
  }

  const clientGbpData = await fetchGBPDataForRange(
    oauth2Client,
    [targetLocation],
    startDateStr,
    endDateStr
  );

  // ========== STEP 2: Fetch GSC Data ==========
  await updateStatus(
    rankingId,
    "processing",
    "fetching_client_gsc",
    "Fetching GSC data...",
    20,
    statusDetail,
    log
  );

  let clientGscData: any = null;
  if (propertyIds?.gsc?.siteUrl) {
    clientGscData = await fetchGSCDataForRange(
      oauth2Client,
      propertyIds.gsc.siteUrl,
      startDateStr,
      endDateStr
    );
  }

  // ========== STEP 3: Discover Competitors ==========
  await updateStatus(
    rankingId,
    "processing",
    "discovering_competitors",
    "Checking competitor cache...",
    30,
    statusDetail,
    log
  );

  const cachedCompetitors = await getCachedCompetitors(
    specialty,
    marketLocation
  );
  let discoveredCompetitors: any[];
  let usedCache = false;

  if (cachedCompetitors && cachedCompetitors.length > 0) {
    discoveredCompetitors = cachedCompetitors.map((c) => ({
      placeId: c.placeId,
      name: c.name,
      address: c.address || "",
      category: c.category || "Unknown",
      totalScore: 0,
      reviewsCount: 0,
      url: "",
      website: undefined,
      phone: undefined,
    }));
    usedCache = true;
    await updateStatus(
      rankingId,
      "processing",
      "discovering_competitors",
      `Using ${cachedCompetitors.length} cached competitors`,
      35,
      statusDetail,
      log
    );
  } else {
    await updateStatus(
      rankingId,
      "processing",
      "discovering_competitors",
      "Discovering local competitors...",
      30,
      statusDetail,
      log
    );

    const searchQuery = `${specialty} ${marketLocation}`;
    discoveredCompetitors = await discoverCompetitors(searchQuery, 50);

    if (discoveredCompetitors.length > 0) {
      const competitorsToCache = discoveredCompetitors.map((c) => ({
        placeId: c.placeId,
        name: c.name,
        address: c.address,
        category: c.category,
      }));
      await setCachedCompetitors(specialty, marketLocation, competitorsToCache);
    }
  }

  // ========== STEP 4: Deep Scrape Competitors ==========
  await updateStatus(
    rankingId,
    "processing",
    "scraping_competitors",
    `Scraping ${discoveredCompetitors.length} competitors...`,
    50,
    statusDetail,
    log
  );

  const specialtyKeywords = getSpecialtyKeywords(specialty);
  let competitorDetails: any[] = [];

  try {
    const competitorPlaceIds = discoveredCompetitors.map((c) => c.placeId);
    competitorDetails = await getCompetitorDetails(
      competitorPlaceIds,
      specialtyKeywords
    );
  } catch (error: any) {
    log(
      `[RANKING] [${rankingId}] Detailed scrape failed, using discovery fallback: ${error.message}`
    );
    competitorDetails = discoveredCompetitors.map((comp) => {
      const hasKeywordInName = specialtyKeywords.some((keyword) =>
        comp.name.toLowerCase().includes(keyword.toLowerCase())
      );
      return {
        placeId: comp.placeId,
        name: comp.name,
        address: comp.address,
        categories: [comp.category],
        primaryCategory: comp.category,
        totalReviews: comp.reviewsCount,
        averageRating: comp.totalScore,
        reviewsLast30d: 0,
        reviewsLast90d: 0,
        photosCount: 0,
        postsLast90d: 0,
        hasWebsite: !!comp.website,
        hasPhone: !!comp.phone,
        hasHours: true,
        hoursComplete: true,
        descriptionLength: 0,
        hasKeywordInName,
        website: comp.website,
        phone: comp.phone,
      };
    });
  }

  // Filter client out of competitors
  const clientNameLower = gbpLocationName.toLowerCase().trim();
  competitorDetails = competitorDetails.filter((comp) => {
    const compNameLower = (comp.name || "").toLowerCase().trim();
    if (compNameLower === clientNameLower) return false;
    if (
      compNameLower.includes(clientNameLower) ||
      clientNameLower.includes(compNameLower)
    ) {
      const shorterLength = Math.min(
        compNameLower.length,
        clientNameLower.length
      );
      const longerLength = Math.max(
        compNameLower.length,
        clientNameLower.length
      );
      if (shorterLength / longerLength > 0.5) return false;
    }
    return true;
  });

  // ========== STEP 5: Website Audit ==========
  await updateStatus(
    rankingId,
    "processing",
    "auditing_website",
    "Auditing client website...",
    60,
    statusDetail,
    log
  );

  let websiteAudit = null;
  const clientWebsite = targetLocation?.website || `https://${domain}`;
  try {
    websiteAudit = await auditWebsite(clientWebsite);
  } catch (error: any) {
    log(`[RANKING] [${rankingId}] Website audit failed: ${error.message}`);
  }

  // ========== STEP 6: Calculate Scores ==========
  await updateStatus(
    rankingId,
    "processing",
    "calculating_scores",
    "Calculating ranking scores...",
    80,
    statusDetail,
    log
  );

  const clientLocation = clientGbpData?.locations?.[0];
  const gbpData = clientLocation?.data;
  const profileData = gbpData?.profile;

  const clientPracticeData: PracticeData = {
    name: gbpLocationName || profileData?.title || domain,
    primaryCategory: profileData?.primaryCategory || "Dentist",
    secondaryCategories: profileData?.additionalCategories || [],
    totalReviews: gbpData?.reviews?.allTime?.totalReviewCount || 0,
    averageRating: gbpData?.reviews?.allTime?.averageRating || 0,
    reviewsLast30d: gbpData?.reviews?.window?.newReviews || 0,
    postsLast90d: 0,
    hasWebsite: !!profileData?.websiteUri,
    hasPhone: !!profileData?.phoneNumber,
    hasHours: !!profileData?.hasHours,
    hoursComplete: profileData?.hasHours || false,
    descriptionLength: profileData?.description?.length || 0,
    photosCount: 0,
  };

  const clientRanking = calculateRankingScore(clientPracticeData, specialty);

  const competitorsForRanking = competitorDetails.map((comp) => ({
    id: comp.placeId,
    data: {
      name: comp.name,
      primaryCategory: comp.primaryCategory,
      secondaryCategories: comp.categories,
      totalReviews: comp.totalReviews,
      averageRating: comp.averageRating,
      reviewsLast30d: comp.reviewsLast30d || 0,
      postsLast90d: comp.postsLast90d || 0,
      hasWebsite: comp.hasWebsite,
      hasPhone: comp.hasPhone,
      hasHours: comp.hasHours,
      hoursComplete: comp.hoursComplete,
      descriptionLength: comp.descriptionLength,
      photosCount: comp.photosCount,
    } as PracticeData,
  }));

  const allPractices = [
    { id: "client", data: clientPracticeData },
    ...competitorsForRanking,
  ];

  const rankedPractices = rankPractices(allPractices, specialty);
  const clientRankResult = rankedPractices.find((p) => p.id === "client");

  const benchmarks = calculateBenchmarks(
    competitorDetails.map((c) => ({
      totalReviews: c.totalReviews,
      averageRating: c.averageRating,
      reviewsLast30d: c.reviewsLast30d,
    }))
  );

  const performanceMetrics = extractPerformanceMetrics(gbpData);

  const rawData = {
    client_gbp: {
      totalReviewCount: clientPracticeData.totalReviews,
      averageRating: clientPracticeData.averageRating,
      primaryCategory: clientPracticeData.primaryCategory,
      reviewsLast30d: clientPracticeData.reviewsLast30d,
      postsLast90d: clientPracticeData.postsLast90d,
      photosCount: clientPracticeData.photosCount || 0,
      hasWebsite: clientPracticeData.hasWebsite,
      hasPhone: clientPracticeData.hasPhone,
      hasHours: clientPracticeData.hasHours,
      performance: performanceMetrics,
      gbpLocationId,
      gbpAccountId,
      gbpLocationName,
      _raw: clientGbpData,
    },
    client_gsc: clientGscData,
    competitors: rankedPractices
      .filter((p) => p.id !== "client")
      .slice(0, 20)
      .map((p) => {
        const details = competitorDetails.find((c) => c.placeId === p.id);
        return {
          name: details?.name || "Unknown",
          placeId: p.id,
          rankScore: p.rankingResult.totalScore,
          rankPosition: p.rankPosition,
          totalReviews: details?.totalReviews || 0,
          averageRating: details?.averageRating || 0,
          reviewsLast30d: details?.reviewsLast30d || 0,
          primaryCategory: details?.primaryCategory || "Unknown",
          hasKeywordInName: details?.hasKeywordInName || false,
          photosCount: details?.photosCount || 0,
          postsLast90d: details?.postsLast90d || 0,
        };
      }),
    competitors_discovered: competitorDetails.length,
    competitors_from_cache: usedCache,
    website_audit: websiteAudit,
  };

  const rankingFactors = {
    category_match: {
      score:
        clientRanking.factors.categoryMatch.score /
        clientRanking.factors.categoryMatch.max,
      weighted: clientRanking.factors.categoryMatch.score,
      weight: FACTOR_WEIGHTS.categoryMatch,
      details: clientRanking.factors.categoryMatch.details,
    },
    review_count: {
      score:
        clientRanking.factors.reviewCount.score /
        clientRanking.factors.reviewCount.max,
      weighted: clientRanking.factors.reviewCount.score,
      weight: FACTOR_WEIGHTS.reviewCount,
      value: clientPracticeData.totalReviews,
      details: clientRanking.factors.reviewCount.details,
    },
    star_rating: {
      score:
        clientRanking.factors.starRating.score /
        clientRanking.factors.starRating.max,
      weighted: clientRanking.factors.starRating.score,
      weight: FACTOR_WEIGHTS.starRating,
      value: clientPracticeData.averageRating,
      details: clientRanking.factors.starRating.details,
    },
    keyword_name: {
      score:
        clientRanking.factors.keywordName.score /
        clientRanking.factors.keywordName.max,
      weighted: clientRanking.factors.keywordName.score,
      weight: FACTOR_WEIGHTS.keywordName,
      details: clientRanking.factors.keywordName.details,
    },
    review_velocity: {
      score:
        clientRanking.factors.reviewVelocity.score /
        clientRanking.factors.reviewVelocity.max,
      weighted: clientRanking.factors.reviewVelocity.score,
      weight: FACTOR_WEIGHTS.reviewVelocity,
      value: clientPracticeData.reviewsLast30d,
      details: clientRanking.factors.reviewVelocity.details,
    },
    nap_consistency: {
      score:
        clientRanking.factors.napConsistency.score /
        clientRanking.factors.napConsistency.max,
      weighted: clientRanking.factors.napConsistency.score,
      weight: FACTOR_WEIGHTS.napConsistency,
      details: clientRanking.factors.napConsistency.details,
    },
    gbp_activity: {
      score:
        clientRanking.factors.gbpActivity.score /
        clientRanking.factors.gbpActivity.max,
      weighted: clientRanking.factors.gbpActivity.score,
      weight: FACTOR_WEIGHTS.gbpActivity,
      value: clientPracticeData.postsLast90d,
      details: clientRanking.factors.gbpActivity.details,
    },
    sentiment: {
      score:
        clientRanking.factors.sentiment.score /
        clientRanking.factors.sentiment.max,
      weighted: clientRanking.factors.sentiment.score,
      weight: FACTOR_WEIGHTS.sentiment,
      details: clientRanking.factors.sentiment.details,
    },
  };

  await db("practice_rankings")
    .where({ id: rankingId })
    .update({
      rank_score:
        clientRankResult?.rankingResult.totalScore || clientRanking.totalScore,
      rank_position: clientRankResult?.rankPosition || 1,
      total_competitors: competitorDetails.length + 1,
      ranking_factors: JSON.stringify(rankingFactors),
      raw_data: JSON.stringify(rawData),
      updated_at: new Date(),
    });

  // ========== STEP 7: Send to LLM ==========
  await updateStatus(
    rankingId,
    "processing",
    "awaiting_llm",
    "Sending to AI for gap analysis...",
    90,
    statusDetail,
    log
  );

  if (PRACTICE_RANKING_ANALYSIS_WEBHOOK) {
    const llmPayload = {
      additional_data: {
        practice_ranking_id: rankingId,
        batch_id: batchId,
        client: {
          domain,
          practice_name: gbpLocationName,
          specialty,
          location: marketLocation,
          gbp_location_id: gbpLocationId,
          gbp_account_id: gbpAccountId,
          rank_score: clientRanking.totalScore,
          rank_position: clientRankResult?.rankPosition || 1,
          total_competitors: competitorDetails.length,
          factors: rankingFactors,
          gbp_data: {
            business_name: clientPracticeData.name,
            total_reviews: clientPracticeData.totalReviews,
            average_rating: clientPracticeData.averageRating,
            reviews_last_30d: clientPracticeData.reviewsLast30d,
            primary_category: clientPracticeData.primaryCategory,
          },
          website_audit: websiteAudit,
        },
        competitors: rawData.competitors.slice(0, 5),
        benchmarks,
      },
    };

    try {
      const llmResponse = await axios.post(
        PRACTICE_RANKING_ANALYSIS_WEBHOOK,
        llmPayload,
        {
          timeout: 120000,
          headers: { "Content-Type": "application/json" },
        }
      );

      let llmData = llmResponse.data;
      if (Array.isArray(llmData)) llmData = llmData[0] || {};
      const { practice_ranking_id: _, ...llmAnalysis } = llmData;

      // Create tasks from recommendations
      const topRecommendations = llmAnalysis.top_recommendations || [];
      if (topRecommendations.length > 0) {
        // Archive old tasks
        const previousRankings = await db("practice_rankings")
          .where({
            google_account_id: googleAccountId,
            gbp_location_id: gbpLocationId,
          })
          .whereNot({ id: rankingId })
          .select("id");

        if (previousRankings.length > 0) {
          await db("tasks")
            .where({ agent_type: "RANKING" })
            .whereRaw("metadata::jsonb->>'practice_ranking_id' IN (?)", [
              previousRankings.map((r: any) => String(r.id)).join(","),
            ])
            .whereNot({ status: "archived" })
            .update({ status: "archived", updated_at: new Date() });
        }

        const tasksToInsert = topRecommendations.map((item: any) => ({
          domain_name: domain,
          google_account_id: googleAccountId,
          title: item.title || "Ranking Improvement Action",
          description: item.expected_outcome
            ? `${item.description || ""}\n\n**Expected Outcome:**\n${
                item.expected_outcome
              }`
            : item.description || "",
          category: "USER",
          agent_type: "RANKING",
          status: "pending",
          is_approved: false,
          created_by_admin: true,
          metadata: JSON.stringify({
            practice_ranking_id: rankingId,
            gbp_location_id: gbpLocationId,
            gbp_location_name: gbpLocationName,
            priority: item.priority || null,
            impact: item.impact || null,
            effort: item.effort || null,
            timeline: item.timeline || null,
          }),
          created_at: new Date(),
          updated_at: new Date(),
        }));

        await db("tasks").insert(tasksToInsert);
      }

      await db("practice_rankings")
        .where({ id: rankingId })
        .update({
          llm_analysis: JSON.stringify(llmAnalysis),
          status: "completed",
          status_detail: JSON.stringify({
            currentStep: "done",
            message: "Analysis complete with AI insights",
            progress: 100,
            stepsCompleted: [
              "queued",
              "fetching_client_gbp",
              "fetching_client_gsc",
              "discovering_competitors",
              "scraping_competitors",
              "auditing_website",
              "calculating_scores",
              "awaiting_llm",
              "done",
            ],
            timestamps: { completed_at: new Date().toISOString() },
          }),
          updated_at: new Date(),
        });
    } catch (error: any) {
      log(`[RANKING] [${rankingId}] LLM Webhook failed: ${error.message}`);
      await updateStatus(
        rankingId,
        "completed",
        "done",
        "Analysis complete (without AI insights)",
        100,
        statusDetail,
        log
      );
    }
  } else {
    await updateStatus(
      rankingId,
      "completed",
      "done",
      "Analysis complete",
      100,
      statusDetail,
      log
    );
  }

  log(
    `[RANKING] [${rankingId}] COMPLETE in ${(
      (Date.now() - startTime) /
      1000
    ).toFixed(1)}s`
  );

  return {
    rankingId,
    gbpLocationId,
    gbpLocationName,
    rankScore:
      clientRankResult?.rankingResult.totalScore || clientRanking.totalScore,
    rankPosition: clientRankResult?.rankPosition || 1,
  };
}
