/**
 * Practice Ranking Routes
 *
 * Endpoints for the Practice Ranking Analysis feature:
 * - POST /trigger - Start a new ranking analysis
 * - GET /status/:id - Check analysis status
 * - GET /results/:id - Get full results
 * - GET /list - List all analyses
 * - GET /accounts - List onboarded accounts
 * - DELETE /:id - Delete a ranking analysis
 * - POST /webhook/llm-response - Receive LLM analysis from n8n
 */

import express, { Request, Response } from "express";
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
  invalidateCache,
} from "../services/competitorCache";
import {
  calculateRankingScore,
  rankPractices,
  calculateBenchmarks,
  PracticeData,
  RankingResult as AlgorithmRankingResult,
  FACTOR_WEIGHTS,
} from "../services/rankingAlgorithm";
import axios from "axios";

const router = express.Router();

// Webhook URL from environment
const PRACTICE_RANKING_ANALYSIS_WEBHOOK =
  process.env.PRACTICE_RANKING_ANALYSIS_AGENT_WEBHOOK || "";
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

// =====================================================================
// HELPER FUNCTIONS
// =====================================================================

/**
 * Sum values from GBP performance time series data
 * The series structure is: multiDailyMetricTimeSeries[].dailyMetricTimeSeries[].timeSeries.datedValues[]
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

// =====================================================================
// LOGGING UTILITIES
// =====================================================================

function log(message: string): void {
  console.log(`[PRACTICE-RANKING] ${message}`);
}

function logError(operation: string, error: any): void {
  console.error(
    `[PRACTICE-RANKING ERROR] ${operation}: ${error.message || error}`
  );
}

// =====================================================================
// STATUS TRACKING HELPERS
// =====================================================================

interface StatusDetail {
  currentStep: string;
  message: string;
  progress: number;
  stepsCompleted: string[];
  timestamps: Record<string, string>;
}

async function updateStatus(
  rankingId: number,
  status: string,
  step: string,
  message: string,
  progress: number,
  existingDetail?: StatusDetail
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
    // Add previous step to completed
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

  log(`[${rankingId}] Status: ${status} - ${step} (${progress}%): ${message}`);
}

// =====================================================================
// BACKGROUND JOB PROCESSOR
// =====================================================================

async function processRankingAnalysis(rankingId: number): Promise<void> {
  let statusDetail: StatusDetail = {
    currentStep: "queued",
    message: "Analysis queued",
    progress: 0,
    stepsCompleted: [],
    timestamps: { started_at: new Date().toISOString() },
  };

  try {
    // Get ranking record
    const ranking = await db("practice_rankings")
      .where({ id: rankingId })
      .first();

    if (!ranking) {
      throw new Error(`Ranking ${rankingId} not found`);
    }

    const { google_account_id, domain, specialty, location } = ranking;

    // Get account details
    const account = await db("google_accounts")
      .where({ id: google_account_id })
      .first();

    if (!account) {
      throw new Error(`Account ${google_account_id} not found`);
    }

    const propertyIds =
      typeof account.google_property_ids === "string"
        ? JSON.parse(account.google_property_ids)
        : account.google_property_ids;

    // Get OAuth client
    const oauth2Client = await getValidOAuth2Client(google_account_id);

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
      "Fetching GBP data...",
      10,
      statusDetail
    );

    let clientGbpData: any = null;
    if (propertyIds?.gbp && propertyIds.gbp.length > 0) {
      clientGbpData = await fetchGBPDataForRange(
        oauth2Client,
        propertyIds.gbp,
        startDateStr,
        endDateStr
      );
      log(
        `[${rankingId}] Fetched GBP data for ${propertyIds.gbp.length} location(s)`
      );
    }

    // ========== STEP 2: Fetch GSC Data ==========
    await updateStatus(
      rankingId,
      "processing",
      "fetching_client_gsc",
      "Fetching GSC data...",
      20,
      statusDetail
    );

    let clientGscData: any = null;
    if (propertyIds?.gsc?.siteUrl) {
      clientGscData = await fetchGSCDataForRange(
        oauth2Client,
        propertyIds.gsc.siteUrl,
        startDateStr,
        endDateStr
      );
      log(`[${rankingId}] Fetched GSC data for ${propertyIds.gsc.siteUrl}`);
    }

    // ========== STEP 3: Discover Competitors (with caching) ==========
    await updateStatus(
      rankingId,
      "processing",
      "discovering_competitors",
      "Checking competitor cache...",
      30,
      statusDetail
    );

    // Check for cached competitors first
    const cachedCompetitors = await getCachedCompetitors(specialty, location);
    let discoveredCompetitors: any[];
    let usedCache = false;

    if (cachedCompetitors && cachedCompetitors.length > 0) {
      // Use cached competitor list
      log(
        `[${rankingId}] Using ${cachedCompetitors.length} cached competitors`
      );
      discoveredCompetitors = cachedCompetitors.map((c) => ({
        placeId: c.placeId,
        name: c.name,
        address: c.address || "",
        category: c.category || "Unknown",
        totalScore: 0, // Will be fetched fresh
        reviewsCount: 0, // Will be fetched fresh
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
        statusDetail
      );
    } else {
      // Discover new competitors
      await updateStatus(
        rankingId,
        "processing",
        "discovering_competitors",
        "Discovering local competitors...",
        30,
        statusDetail
      );

      const searchQuery = `${specialty} ${location}`;
      discoveredCompetitors = await discoverCompetitors(searchQuery, 50);
      log(
        `[${rankingId}] Discovered ${discoveredCompetitors.length} new competitors`
      );

      // Cache the discovered competitors for future analyses
      if (discoveredCompetitors.length > 0) {
        const competitorsToCache = discoveredCompetitors.map((c) => ({
          placeId: c.placeId,
          name: c.name,
          address: c.address,
          category: c.category,
        }));
        await setCachedCompetitors(specialty, location, competitorsToCache);
        log(
          `[${rankingId}] Cached ${competitorsToCache.length} competitors for future analyses`
        );
      }
    }

    // ========== STEP 4: Deep Scrape Competitors (optional) ==========
    await updateStatus(
      rankingId,
      "processing",
      "scraping_competitors",
      `Scraping ${discoveredCompetitors.length} competitors...`,
      50,
      statusDetail
    );

    const specialtyKeywords = getSpecialtyKeywords(specialty);
    let competitorDetails: any[] = [];

    try {
      const competitorPlaceIds = discoveredCompetitors.map((c) => c.placeId);
      competitorDetails = await getCompetitorDetails(
        competitorPlaceIds,
        specialtyKeywords
      );
      log(
        `[${rankingId}] Got detailed data for ${competitorDetails.length} competitors`
      );
    } catch (detailError: any) {
      // Fallback: use discovery data if detailed scrape fails
      log(
        `[${rankingId}] Detailed scrape failed (${detailError.message}), using discovery data`
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
      log(
        `[${rankingId}] Using ${competitorDetails.length} competitors from discovery data`
      );
    }

    // ========== STEP 5: Website Audit ==========
    await updateStatus(
      rankingId,
      "processing",
      "auditing_website",
      "Auditing client website...",
      60,
      statusDetail
    );

    let websiteAudit = null;
    const clientWebsite = propertyIds?.gbp?.[0]?.website || `https://${domain}`;
    try {
      websiteAudit = await auditWebsite(clientWebsite);
      log(
        `[${rankingId}] Website audit complete: performance ${websiteAudit.performanceScore}`
      );
    } catch (auditError: any) {
      log(`[${rankingId}] Website audit failed: ${auditError.message}`);
    }

    // ========== STEP 6: Calculate Scores ==========
    await updateStatus(
      rankingId,
      "processing",
      "calculating_scores",
      "Calculating ranking scores...",
      80,
      statusDetail
    );
    // Prepare client practice data
    // GBP data structure from getGBPAIReadyData:
    // { meta, reviews: { allTime, window }, performance, profile: { title, websiteUri, phoneNumber, primaryCategory, regularHours, hasHours } }
    const clientLocation = clientGbpData?.locations?.[0];
    const gbpData = clientLocation?.data;
    const profileData = gbpData?.profile; // NAP and category data
    const clientPracticeData: PracticeData = {
      name: account.practice_name || profileData?.title || domain,
      // Category from profile data
      primaryCategory: profileData?.primaryCategory || "Dentist",
      secondaryCategories: profileData?.additionalCategories || [],
      // Reviews are nested under allTime and window
      totalReviews: gbpData?.reviews?.allTime?.totalReviewCount || 0,
      averageRating: gbpData?.reviews?.allTime?.averageRating || 0,
      reviewsLast30d: gbpData?.reviews?.window?.newReviews || 0,
      postsLast90d: 0, // Posts not fetched in getGBPAIReadyData
      // NAP data from profile
      hasWebsite: !!profileData?.websiteUri,
      hasPhone: !!profileData?.phoneNumber,
      hasHours: !!profileData?.hasHours,
      hoursComplete: profileData?.hasHours || false,
      descriptionLength: profileData?.description?.length || 0,
      photosCount: 0, // Photos not fetched in getGBPAIReadyData
    };
    // Calculate client ranking
    const clientRanking = calculateRankingScore(clientPracticeData, specialty);

    // Prepare competitor data for ranking
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

    // Add client to the list and rank all
    const allPractices = [
      { id: "client", data: clientPracticeData },
      ...competitorsForRanking,
    ];

    const rankedPractices = rankPractices(allPractices, specialty);
    const clientRankResult = rankedPractices.find((p) => p.id === "client");

    // Calculate benchmarks
    const benchmarks = calculateBenchmarks(
      competitorDetails.map((c) => ({
        totalReviews: c.totalReviews,
        averageRating: c.averageRating,
        reviewsLast30d: c.reviewsLast30d,
      }))
    );

    // Update benchmarks with scores
    const competitorScores = rankedPractices
      .filter((p) => p.id !== "client")
      .map((p) => p.rankingResult.totalScore);
    benchmarks.avgScore =
      competitorScores.length > 0
        ? Math.round(
            (competitorScores.reduce((a, b) => a + b, 0) /
              competitorScores.length) *
              100
          ) / 100
        : 0;
    benchmarks.medianScore =
      competitorScores.length > 0
        ? competitorScores.sort((a, b) => a - b)[
            Math.floor(competitorScores.length / 2)
          ]
        : 0;

    // Prepare competitor data for storage (top 20 competitors)
    const competitorDataForStorage = rankedPractices
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
      });

    // Extract performance metrics from GBP data (Calls, Directions, Clicks)
    const performanceMetrics = extractPerformanceMetrics(gbpData);

    // Save results to database - flatten GBP data for easier frontend access
    const rawData = {
      client_gbp: {
        // Flattened metrics for easy access
        totalReviewCount: clientPracticeData.totalReviews,
        averageRating: clientPracticeData.averageRating,
        primaryCategory: clientPracticeData.primaryCategory,
        reviewsLast30d: clientPracticeData.reviewsLast30d,
        postsLast90d: clientPracticeData.postsLast90d,
        photosCount: clientPracticeData.photosCount || 0,
        hasWebsite: clientPracticeData.hasWebsite,
        hasPhone: clientPracticeData.hasPhone,
        hasHours: clientPracticeData.hasHours,
        // Performance metrics (30 days) - Patient Engagement
        performance: performanceMetrics,
        // Also store the raw nested data for reference
        _raw: clientGbpData,
      },
      client_gsc: clientGscData,
      competitors: competitorDataForStorage,
      competitors_discovered: competitorDetails.length,
      competitors_from_cache: usedCache,
      website_audit: websiteAudit,
    };

    // Store ranking factors with normalized structure for frontend
    // Convert scores to 0-1 scale for percentage display
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

    // Total competitors includes the client in the ranking
    const totalInRanking = competitorDetails.length + 1;

    await db("practice_rankings")
      .where({ id: rankingId })
      .update({
        rank_score:
          clientRankResult?.rankingResult.totalScore ||
          clientRanking.totalScore,
        rank_position: clientRankResult?.rankPosition || 1,
        total_competitors: totalInRanking,
        ranking_factors: JSON.stringify(rankingFactors),
        raw_data: JSON.stringify(rawData),
        updated_at: new Date(),
      });

    log(
      `[${rankingId}] Client rank: #${clientRankResult?.rankPosition} with score ${clientRanking.totalScore}`
    );

    // ========== STEP 7: Send to LLM for Analysis (Synchronous) ==========
    await updateStatus(
      rankingId,
      "processing",
      "awaiting_llm",
      "Sending to AI for gap analysis...",
      90,
      statusDetail
    );

    if (PRACTICE_RANKING_ANALYSIS_WEBHOOK) {
      // Prepare payload for n8n (synchronous - response comes back directly)
      const llmPayload = {
        additional_data: {
          practice_ranking_id: rankingId,
          client: {
            domain: domain,
            practice_name: account.practice_name || domain,
            specialty: specialty,
            location: location,
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
              photos_count: clientPracticeData.photosCount || 0,
              posts_last_90d: clientPracticeData.postsLast90d,
            },
            gsc_data: clientGscData
              ? {
                  top_queries: clientGscData.topQueries?.slice(0, 10) || [],
                  total_impressions: clientGscData.totals?.impressions || 0,
                  total_clicks: clientGscData.totals?.clicks || 0,
                  avg_position: clientGscData.totals?.avgPosition || 0,
                }
              : null,
            website_audit: websiteAudit
              ? {
                  lcp: websiteAudit.lcp,
                  performance_score: websiteAudit.performanceScore,
                  has_local_schema: websiteAudit.hasLocalSchema,
                  has_review_schema: websiteAudit.hasReviewSchema,
                }
              : null,
          },
          competitors: competitorDataForStorage.slice(0, 5),
          benchmarks: {
            avg_score: benchmarks.avgScore,
            avg_reviews: benchmarks.avgReviews,
            avg_rating: benchmarks.avgRating,
            top_performer: competitorDataForStorage[0]
              ? {
                  name: competitorDataForStorage[0].name,
                  score: competitorDataForStorage[0].rankScore,
                }
              : null,
          },
        },
      };

      try {
        // Synchronous call - n8n returns LLM analysis directly via Respond to Webhook
        log(`[${rankingId}] Sending to LLM webhook (synchronous)...`);
        const llmResponse = await axios.post(
          PRACTICE_RANKING_ANALYSIS_WEBHOOK,
          llmPayload,
          {
            timeout: 120000, // 2 minutes for LLM processing
            headers: { "Content-Type": "application/json" },
          }
        );

        // Parse response - handle both array and object formats
        let llmData = llmResponse.data;
        if (Array.isArray(llmData)) {
          llmData = llmData[0] || {};
        }

        // Extract LLM analysis (remove practice_ranking_id if present)
        const { practice_ranking_id: _, ...llmAnalysis } = llmData;

        log(`[${rankingId}] Received LLM analysis, saving to database...`);

        // Save LLM analysis and complete
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

        log(`[${rankingId}] Analysis complete with AI insights`);
      } catch (webhookError: any) {
        log(`[${rankingId}] LLM webhook failed: ${webhookError.message}`);
        // Complete without LLM analysis
        await updateStatus(
          rankingId,
          "completed",
          "done",
          "Analysis complete (without AI insights)",
          100,
          statusDetail
        );
      }
    } else {
      // No webhook configured, complete without LLM
      await updateStatus(
        rankingId,
        "completed",
        "done",
        "Analysis complete",
        100,
        statusDetail
      );
    }
  } catch (error: any) {
    logError(`processRankingAnalysis ${rankingId}`, error);
    await db("practice_rankings")
      .where({ id: rankingId })
      .update({
        status: "failed",
        error_message: error.message || String(error),
        updated_at: new Date(),
      });
  }
}

// =====================================================================
// API ENDPOINTS
// =====================================================================

/**
 * POST /api/admin/practice-ranking/trigger
 * Start a new ranking analysis
 */
router.post("/trigger", async (req: Request, res: Response) => {
  try {
    const { googleAccountId, specialty, location } = req.body;

    if (!googleAccountId || !specialty || !location) {
      return res.status(400).json({
        success: false,
        error: "MISSING_PARAMS",
        message: "googleAccountId, specialty, and location are required",
      });
    }

    // Validate account exists
    const account = await db("google_accounts")
      .where({ id: googleAccountId })
      .first();

    if (!account) {
      return res.status(404).json({
        success: false,
        error: "ACCOUNT_NOT_FOUND",
        message: `Account ${googleAccountId} not found`,
      });
    }

    // Create ranking record
    const [result] = await db("practice_rankings")
      .insert({
        google_account_id: googleAccountId,
        domain: account.domain_name,
        specialty: specialty,
        location: location,
        observed_at: new Date(),
        status: "pending",
        status_detail: JSON.stringify({
          currentStep: "queued",
          message: "Analysis queued",
          progress: 0,
          stepsCompleted: [],
          timestamps: { created_at: new Date().toISOString() },
        }),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("id");

    const rankingId = result.id;
    log(`Created ranking analysis ${rankingId} for ${account.domain_name}`);

    // Get the created record for response
    const newRanking = await db("practice_rankings")
      .where({ id: rankingId })
      .first();

    // Start background processing
    setImmediate(() => {
      processRankingAnalysis(rankingId).catch((err) => {
        logError(`Background process ${rankingId}`, err);
      });
    });

    return res.json({
      success: true,
      message: "Ranking analysis started",
      ranking: {
        id: newRanking.id,
        google_account_id: newRanking.google_account_id,
        domain: newRanking.domain,
        specialty: newRanking.specialty,
        location: newRanking.location,
        status: newRanking.status,
        rank_score: newRanking.rank_score,
        rank_position: newRanking.rank_position,
        total_competitors: newRanking.total_competitors,
        created_at: newRanking.created_at,
        updated_at: newRanking.updated_at,
        observed_at: newRanking.observed_at,
        status_detail:
          typeof newRanking.status_detail === "string"
            ? JSON.parse(newRanking.status_detail)
            : newRanking.status_detail,
      },
    });
  } catch (error: any) {
    logError("POST /trigger", error);
    return res.status(500).json({
      success: false,
      error: "TRIGGER_ERROR",
      message: error.message || "Failed to start analysis",
    });
  }
});

/**
 * GET /api/admin/practice-ranking/status/:id
 * Get analysis status
 */
router.get("/status/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const ranking = await db("practice_rankings")
      .where({ id: parseInt(id) })
      .first();

    if (!ranking) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: `Ranking ${id} not found`,
      });
    }

    const statusDetail =
      typeof ranking.status_detail === "string"
        ? JSON.parse(ranking.status_detail)
        : ranking.status_detail;

    return res.json({
      success: true,
      rankingId: ranking.id,
      status: ranking.status,
      statusDetail: statusDetail,
      rankScore: ranking.rank_score,
      rankPosition: ranking.rank_position,
      totalCompetitors: ranking.total_competitors,
      createdAt: ranking.created_at,
      updatedAt: ranking.updated_at,
    });
  } catch (error: any) {
    logError("GET /status/:id", error);
    return res.status(500).json({
      success: false,
      error: "STATUS_ERROR",
      message: error.message || "Failed to get status",
    });
  }
});

/**
 * GET /api/admin/practice-ranking/results/:id
 * Get full results
 */
router.get("/results/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const ranking = await db("practice_rankings")
      .where({ id: parseInt(id) })
      .first();

    if (!ranking) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: `Ranking ${id} not found`,
      });
    }

    // Parse JSON fields
    const parse = (field: any) => {
      if (!field) return null;
      return typeof field === "string" ? JSON.parse(field) : field;
    };

    return res.json({
      success: true,
      ranking: {
        id: ranking.id,
        googleAccountId: ranking.google_account_id,
        domain: ranking.domain,
        specialty: ranking.specialty,
        location: ranking.location,
        observedAt: ranking.observed_at,
        status: ranking.status,
        rankScore: ranking.rank_score,
        rankPosition: ranking.rank_position,
        totalCompetitors: ranking.total_competitors,
        rankingFactors: parse(ranking.ranking_factors),
        rawData: parse(ranking.raw_data),
        llmAnalysis: parse(ranking.llm_analysis),
        statusDetail: parse(ranking.status_detail),
        errorMessage: ranking.error_message,
        createdAt: ranking.created_at,
        updatedAt: ranking.updated_at,
      },
    });
  } catch (error: any) {
    logError("GET /results/:id", error);
    return res.status(500).json({
      success: false,
      error: "RESULTS_ERROR",
      message: error.message || "Failed to get results",
    });
  }
});

/**
 * GET /api/admin/practice-ranking/list
 * List all analyses (optionally filtered by account)
 */
router.get("/list", async (req: Request, res: Response) => {
  try {
    const { googleAccountId, limit = 20, offset = 0 } = req.query;

    let query = db("practice_rankings")
      .select(
        "id",
        "google_account_id",
        "domain",
        "specialty",
        "location",
        "status",
        "rank_score",
        "rank_position",
        "total_competitors",
        "created_at",
        "updated_at"
      )
      .orderBy("created_at", "desc")
      .limit(Number(limit))
      .offset(Number(offset));

    if (googleAccountId) {
      query = query.where({ google_account_id: Number(googleAccountId) });
    }

    const rankings = await query;

    return res.json({
      success: true,
      count: rankings.length,
      rankings: rankings.map((r) => ({
        id: r.id,
        googleAccountId: r.google_account_id,
        domain: r.domain,
        specialty: r.specialty,
        location: r.location,
        status: r.status,
        rankScore: r.rank_score,
        rankPosition: r.rank_position,
        totalCompetitors: r.total_competitors,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (error: any) {
    logError("GET /list", error);
    return res.status(500).json({
      success: false,
      error: "LIST_ERROR",
      message: error.message || "Failed to list rankings",
    });
  }
});

/**
 * GET /api/admin/practice-ranking/accounts
 * List onboarded accounts for dropdown
 */
router.get("/accounts", async (req: Request, res: Response) => {
  try {
    const accounts = await db("google_accounts")
      .where({ onboarding_completed: true })
      .select("id", "domain_name", "practice_name", "google_property_ids")
      .orderBy("practice_name", "asc");

    return res.json({
      success: true,
      accounts: accounts.map((a) => ({
        id: a.id,
        domain: a.domain_name,
        practiceName: a.practice_name || a.domain_name,
        hasGbp: !!(typeof a.google_property_ids === "string"
          ? JSON.parse(a.google_property_ids)?.gbp?.length
          : a.google_property_ids?.gbp?.length),
        hasGsc: !!(typeof a.google_property_ids === "string"
          ? JSON.parse(a.google_property_ids)?.gsc?.siteUrl
          : a.google_property_ids?.gsc?.siteUrl),
      })),
    });
  } catch (error: any) {
    logError("GET /accounts", error);
    return res.status(500).json({
      success: false,
      error: "ACCOUNTS_ERROR",
      message: error.message || "Failed to list accounts",
    });
  }
});

/**
 * DELETE /api/admin/practice-ranking/:id
 * Delete a ranking analysis
 */
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const rankingId = parseInt(id);

    if (isNaN(rankingId)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_ID",
        message: "Invalid ranking ID",
      });
    }

    // Check if ranking exists
    const ranking = await db("practice_rankings")
      .where({ id: rankingId })
      .first();

    if (!ranking) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: `Ranking ${id} not found`,
      });
    }

    // Delete the ranking
    await db("practice_rankings").where({ id: rankingId }).del();

    log(`Deleted ranking analysis ${rankingId}`);

    return res.json({
      success: true,
      message: `Ranking ${id} deleted successfully`,
    });
  } catch (error: any) {
    logError("DELETE /:id", error);
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error.message || "Failed to delete ranking",
    });
  }
});

/**
 * POST /api/admin/practice-ranking/refresh-competitors
 * Force refresh competitor cache for a specialty+location
 */
router.post("/refresh-competitors", async (req: Request, res: Response) => {
  try {
    const { specialty, location } = req.body;

    if (!specialty || !location) {
      return res.status(400).json({
        success: false,
        error: "MISSING_PARAMS",
        message: "specialty and location are required",
      });
    }

    // Invalidate the cache
    const wasInvalidated = await invalidateCache(specialty, location);

    log(
      `Invalidated competitor cache for ${specialty} in ${location}: ${wasInvalidated}`
    );

    return res.json({
      success: true,
      message: wasInvalidated
        ? "Competitor cache invalidated. Next analysis will discover fresh competitors."
        : "No cache found for this specialty+location. Next analysis will discover competitors.",
      invalidated: wasInvalidated,
    });
  } catch (error: any) {
    logError("POST /refresh-competitors", error);
    return res.status(500).json({
      success: false,
      error: "REFRESH_ERROR",
      message: error.message || "Failed to refresh competitors",
    });
  }
});

/**
 * GET /api/practice-ranking/latest
 * Get the latest completed ranking for a google account (client dashboard)
 */
router.get("/latest", async (req: Request, res: Response) => {
  try {
    const { googleAccountId } = req.query;

    if (!googleAccountId) {
      return res.status(400).json({
        success: false,
        error: "MISSING_PARAMS",
        message: "googleAccountId is required",
      });
    }

    // Get the latest completed ranking for this account
    const ranking = await db("practice_rankings")
      .where({
        google_account_id: Number(googleAccountId),
        status: "completed",
      })
      .orderBy("created_at", "desc")
      .first();

    if (!ranking) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "No completed ranking found for this account",
      });
    }

    // Parse JSON fields
    const parse = (field: any) => {
      if (!field) return null;
      return typeof field === "string" ? JSON.parse(field) : field;
    };

    return res.json({
      success: true,
      ranking: {
        id: ranking.id,
        googleAccountId: ranking.google_account_id,
        domain: ranking.domain,
        specialty: ranking.specialty,
        location: ranking.location,
        observedAt: ranking.observed_at,
        status: ranking.status,
        rankScore: ranking.rank_score,
        rankPosition: ranking.rank_position,
        totalCompetitors: ranking.total_competitors,
        rankingFactors: parse(ranking.ranking_factors),
        rawData: parse(ranking.raw_data),
        llmAnalysis: parse(ranking.llm_analysis),
        statusDetail: parse(ranking.status_detail),
        errorMessage: ranking.error_message,
        createdAt: ranking.created_at,
        updatedAt: ranking.updated_at,
      },
    });
  } catch (error: any) {
    logError("GET /latest", error);
    return res.status(500).json({
      success: false,
      error: "LATEST_ERROR",
      message: error.message || "Failed to get latest ranking",
    });
  }
});

/**
 * POST /api/admin/practice-ranking/webhook/llm-response
 * Receive LLM analysis from n8n
 */
router.post("/webhook/llm-response", async (req: Request, res: Response) => {
  try {
    // Handle both array and object formats from n8n
    let body = req.body;
    if (Array.isArray(body)) {
      log(`Webhook received array format, extracting first element`);
      body = body[0] || {};
    }

    const {
      practice_ranking_id,
      error,
      error_code,
      error_message,
      ...llmAnalysis
    } = body;

    if (!practice_ranking_id) {
      return res.status(400).json({
        success: false,
        error: "MISSING_ID",
        message: "practice_ranking_id is required",
      });
    }

    log(`Received LLM response for ranking ${practice_ranking_id}`);

    // Check if error response
    if (error) {
      await db("practice_rankings")
        .where({ id: practice_ranking_id })
        .update({
          status: "completed",
          status_detail: JSON.stringify({
            currentStep: "done",
            message: `Completed with LLM error: ${error_message}`,
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
            ],
            timestamps: {},
          }),
          error_message: `LLM Error: ${error_code} - ${error_message}`,
          updated_at: new Date(),
        });

      return res.json({ success: true, message: "Error recorded" });
    }

    // Save successful LLM analysis
    await db("practice_rankings")
      .where({ id: practice_ranking_id })
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

    log(`[${practice_ranking_id}] LLM analysis saved, status: completed`);

    return res.json({ success: true, message: "Analysis saved" });
  } catch (error: any) {
    logError("POST /webhook/llm-response", error);
    return res.status(500).json({
      success: false,
      error: "WEBHOOK_ERROR",
      message: error.message || "Failed to process webhook",
    });
  }
});

export default router;
