/**
 * Practice Ranking Routes
 *
 * Endpoints for the Practice Ranking Analysis feature:
 * - POST /trigger - Start a new batch ranking analysis (multi-location)
 * - GET /status/:id - Check individual analysis status
 * - GET /batch/:batchId/status - Check batch analysis status
 * - GET /results/:id - Get full results for single analysis
 * - GET /list - List all analyses
 * - GET /accounts - List onboarded accounts with GBP locations
 * - DELETE /:id - Delete a ranking analysis
 * - POST /webhook/llm-response - Receive LLM analysis from n8n
 * - GET /latest - Get latest rankings for all locations (client dashboard)
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
import { createNotification } from "../utils/notificationHelper";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

// Webhook URL from environment
const PRACTICE_RANKING_ANALYSIS_WEBHOOK =
  process.env.PRACTICE_RANKING_ANALYSIS_AGENT_WEBHOOK || "";
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

// Batch processing configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

// In-memory batch status tracking (for real-time progress)
interface BatchStatus {
  batchId: string;
  googleAccountId: number;
  totalLocations: number;
  completedLocations: number;
  failedLocations: number;
  currentLocationIndex: number;
  currentLocationName: string;
  status: "processing" | "completed" | "failed";
  rankingIds: number[];
  errors: Array<{ locationId: string; error: string; attempt: number }>;
  startedAt: Date;
  completedAt?: Date;
}

const batchStatusMap = new Map<string, BatchStatus>();

// GBP Location interface for type safety
interface GbpLocation {
  accountId: string;
  locationId: string;
  displayName: string;
}

// Location input for trigger endpoint
interface LocationInput {
  gbpAccountId: string;
  gbpLocationId: string;
  gbpLocationName: string;
  specialty: string;
  marketLocation: string;
}

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

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

// Set to DEBUG for verbose logging, INFO for standard logging
const CURRENT_LOG_LEVEL = LOG_LEVELS.DEBUG;

function formatTimestamp(): string {
  return new Date().toISOString();
}

function logDebug(message: string): void {
  if (CURRENT_LOG_LEVEL <= LOG_LEVELS.DEBUG) {
    console.log(`[${formatTimestamp()}] [PRACTICE-RANKING] [DEBUG] ${message}`);
  }
}

function log(message: string): void {
  if (CURRENT_LOG_LEVEL <= LOG_LEVELS.INFO) {
    console.log(`[${formatTimestamp()}] [PRACTICE-RANKING] [INFO] ${message}`);
  }
}

function logWarn(message: string): void {
  if (CURRENT_LOG_LEVEL <= LOG_LEVELS.WARN) {
    console.warn(`[${formatTimestamp()}] [PRACTICE-RANKING] [WARN] ${message}`);
  }
}

function logError(operation: string, error: any): void {
  console.error(
    `[${formatTimestamp()}] [PRACTICE-RANKING] [ERROR] ${operation}: ${
      error.message || error
    }`
  );
  if (error.stack) {
    console.error(
      `[${formatTimestamp()}] [PRACTICE-RANKING] [ERROR] Stack: ${error.stack}`
    );
  }
}

function logStep(rankingId: number, step: string, message: string): void {
  console.log(
    `[${formatTimestamp()}] [PRACTICE-RANKING] [STEP] [${rankingId}] ${step}: ${message}`
  );
}

function logDataSummary(label: string, data: any): void {
  if (CURRENT_LOG_LEVEL <= LOG_LEVELS.DEBUG) {
    const summary =
      typeof data === "object"
        ? JSON.stringify(data, null, 2).substring(0, 500)
        : String(data);
    console.log(
      `[${formatTimestamp()}] [PRACTICE-RANKING] [DATA] ${label}:\n${summary}${
        summary.length >= 500 ? "..." : ""
      }`
    );
  }
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
// BACKGROUND JOB PROCESSOR - MULTI-LOCATION BATCH PROCESSING
// =====================================================================

/**
 * Process a batch of location analyses with retry logic
 * All-or-nothing: if any location fails after max retries, entire batch fails
 */
async function processBatchAnalysis(
  batchId: string,
  googleAccountId: number,
  locations: LocationInput[],
  domain: string
): Promise<void> {
  log(`╔════════════════════════════════════════════════════════════════════╗`);
  log(`║ BATCH ANALYSIS STARTED                                            ║`);
  log(`╠════════════════════════════════════════════════════════════════════╣`);
  log(`║ Batch ID: ${batchId}`);
  log(`║ Account ID: ${googleAccountId}`);
  log(`║ Domain: ${domain}`);
  log(`║ Total Locations: ${locations.length}`);
  log(`╚════════════════════════════════════════════════════════════════════╝`);

  locations.forEach((loc, idx) => {
    logDebug(
      `  Location ${idx + 1}: ${loc.gbpLocationName} (${loc.gbpLocationId})`
    );
    logDebug(`    - Specialty: ${loc.specialty}`);
    logDebug(`    - Market: ${loc.marketLocation}`);
  });

  // Create ALL ranking records upfront with "pending" status
  // This ensures the frontend can see all locations immediately
  const rankingIds: number[] = [];
  for (let i = 0; i < locations.length; i++) {
    const locationInput = locations[i];
    const [result] = await db("practice_rankings")
      .insert({
        google_account_id: googleAccountId,
        domain: domain,
        specialty: locationInput.specialty,
        location: locationInput.marketLocation,
        gbp_account_id: locationInput.gbpAccountId,
        gbp_location_id: locationInput.gbpLocationId,
        gbp_location_name: locationInput.gbpLocationName,
        batch_id: batchId,
        observed_at: new Date(),
        status: "pending",
        status_detail: JSON.stringify({
          currentStep: "queued",
          message: "Waiting in queue...",
          progress: 0,
          stepsCompleted: [],
          timestamps: { created_at: new Date().toISOString() },
        }),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("id");
    rankingIds.push(result.id);
  }

  log(
    `[Batch ${batchId}] Created ${rankingIds.length} ranking records upfront`
  );

  const batchStatus: BatchStatus = {
    batchId,
    googleAccountId,
    totalLocations: locations.length,
    completedLocations: 0,
    failedLocations: 0,
    currentLocationIndex: 0,
    currentLocationName: locations[0]?.gbpLocationName || "",
    status: "processing",
    rankingIds: rankingIds,
    errors: [],
    startedAt: new Date(),
  };

  batchStatusMap.set(batchId, batchStatus);
  log(
    `[Batch ${batchId}] Starting batch analysis for ${locations.length} locations`
  );

  // Temporary storage for results - only save to DB if all succeed
  const successfulResults: Array<{
    rankingId: number;
    results: any;
  }> = [];

  try {
    // Process each location sequentially
    for (let i = 0; i < locations.length; i++) {
      const locationInput = locations[i];
      const rankingId = rankingIds[i];

      batchStatus.currentLocationIndex = i;
      batchStatus.currentLocationName = locationInput.gbpLocationName;
      batchStatusMap.set(batchId, batchStatus);

      log(
        `[Batch ${batchId}] Processing location ${i + 1}/${locations.length}: ${
          locationInput.gbpLocationName
        }`
      );

      // Update this location's status to "processing"
      await db("practice_rankings")
        .where({ id: rankingId })
        .update({
          status: "processing",
          status_detail: JSON.stringify({
            currentStep: "starting",
            message: "Starting analysis...",
            progress: 5,
            stepsCompleted: ["queued"],
            timestamps: { started_at: new Date().toISOString() },
          }),
          updated_at: new Date(),
        });

      // Retry logic for each location
      let lastError: Error | null = null;
      let success = false;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          log(
            `┌─────────────────────────────────────────────────────────────────┐`
          );
          log(
            `│ LOCATION ${i + 1}/${locations.length}: ${
              locationInput.gbpLocationName
            }`
          );
          log(`│ Attempt: ${attempt}/${MAX_RETRIES}`);
          log(
            `└─────────────────────────────────────────────────────────────────┘`
          );

          const results = await processLocationRanking(
            rankingId,
            googleAccountId,
            locationInput.gbpAccountId,
            locationInput.gbpLocationId,
            locationInput.gbpLocationName,
            locationInput.specialty,
            locationInput.marketLocation,
            domain,
            batchId
          );

          successfulResults.push({ rankingId, results });
          success = true;
          batchStatus.completedLocations++;
          break;
        } catch (error: any) {
          lastError = error;
          batchStatus.errors.push({
            locationId: locationInput.gbpLocationId,
            error: error.message || String(error),
            attempt,
          });

          log(
            `[Batch ${batchId}] Location ${locationInput.gbpLocationName} attempt ${attempt} failed: ${error.message}`
          );

          if (attempt < MAX_RETRIES) {
            log(`[Batch ${batchId}] Retrying in ${RETRY_DELAY_MS / 1000}s...`);
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          }
        }
      }

      if (!success) {
        // Location failed after all retries - fail entire batch
        batchStatus.failedLocations++;
        batchStatus.status = "failed";
        batchStatus.completedAt = new Date();
        batchStatusMap.set(batchId, batchStatus);

        // Mark all rankings in batch as failed
        await db("practice_rankings")
          .where({ batch_id: batchId })
          .update({
            status: "failed",
            error_message: `Batch failed: Location ${locationInput.gbpLocationName} failed after ${MAX_RETRIES} attempts. Error: ${lastError?.message}`,
            updated_at: new Date(),
          });

        log(
          `[Batch ${batchId}] FAILED - Location ${locationInput.gbpLocationName} exhausted all retries`
        );
        return;
      }
    }

    // All locations succeeded - batch complete
    batchStatus.status = "completed";
    batchStatus.completedAt = new Date();
    batchStatusMap.set(batchId, batchStatus);

    log(
      `╔════════════════════════════════════════════════════════════════════╗`
    );
    log(
      `║ BATCH ANALYSIS COMPLETED SUCCESSFULLY                             ║`
    );
    log(
      `╠════════════════════════════════════════════════════════════════════╣`
    );
    log(`║ Batch ID: ${batchId}`);
    log(`║ Total Locations: ${locations.length}`);
    log(
      `║ Duration: ${(
        (batchStatus.completedAt.getTime() - batchStatus.startedAt.getTime()) /
        1000
      ).toFixed(1)}s`
    );
    log(
      `╚════════════════════════════════════════════════════════════════════╝`
    );

    // Create notification for the client
    try {
      const locationCount = locations.length;
      const locationText =
        locationCount === 1
          ? locations[0].gbpLocationName
          : `${locationCount} locations`;

      // Get average score from successful results
      const avgScore =
        successfulResults.length > 0
          ? Math.round(
              (successfulResults.reduce(
                (sum, r) => sum + (r.results?.rankScore || 0),
                0
              ) /
                successfulResults.length) *
                10
            ) / 10
          : null;

      const scoreText = avgScore
        ? ` Average score: ${avgScore.toFixed(1)}`
        : "";

      await createNotification(
        domain,
        "Practice Ranking Analysis Complete",
        `Your ranking analysis for ${locationText} has been completed.${scoreText}`,
        "ranking",
        {
          batchId,
          locationCount,
          avgScore,
          rankingIds: batchStatus.rankingIds,
        }
      );

      log(`[Batch ${batchId}] Notification created for ${domain}`);
    } catch (notifyError: any) {
      logWarn(
        `Failed to create notification for batch ${batchId}: ${notifyError.message}`
      );
    }
  } catch (error: any) {
    logError(`processBatchAnalysis ${batchId}`, error);
    batchStatus.status = "failed";
    batchStatus.completedAt = new Date();
    batchStatusMap.set(batchId, batchStatus);

    // Mark all rankings in batch as failed
    await db("practice_rankings")
      .where({ batch_id: batchId })
      .update({
        status: "failed",
        error_message: `Batch failed: ${error.message}`,
        updated_at: new Date(),
      });
  }
}

/**
 * Process a batch with pre-created ranking records
 * Records are created in the trigger endpoint before this is called
 */
async function processBatchAnalysisWithExistingRecords(
  batchId: string,
  googleAccountId: number,
  locations: LocationInput[],
  domain: string,
  rankingIds: number[]
): Promise<void> {
  log(`╔════════════════════════════════════════════════════════════════════╗`);
  log(`║ BATCH ANALYSIS STARTED (WITH PRE-CREATED RECORDS)                 ║`);
  log(`╠════════════════════════════════════════════════════════════════════╣`);
  log(`║ Batch ID: ${batchId}`);
  log(`║ Account ID: ${googleAccountId}`);
  log(`║ Domain: ${domain}`);
  log(`║ Total Locations: ${locations.length}`);
  log(`║ Pre-created Ranking IDs: ${rankingIds.join(", ")}`);
  log(`╚════════════════════════════════════════════════════════════════════╝`);

  locations.forEach((loc, idx) => {
    logDebug(
      `  Location ${idx + 1}: ${loc.gbpLocationName} (${loc.gbpLocationId})`
    );
    logDebug(`    - Specialty: ${loc.specialty}`);
    logDebug(`    - Market: ${loc.marketLocation}`);
  });

  const batchStatus: BatchStatus = {
    batchId,
    googleAccountId,
    totalLocations: locations.length,
    completedLocations: 0,
    failedLocations: 0,
    currentLocationIndex: 0,
    currentLocationName: locations[0]?.gbpLocationName || "",
    status: "processing",
    rankingIds: rankingIds,
    errors: [],
    startedAt: new Date(),
  };

  batchStatusMap.set(batchId, batchStatus);
  log(
    `[Batch ${batchId}] Starting batch analysis for ${locations.length} locations`
  );

  // Temporary storage for results - only save to DB if all succeed
  const successfulResults: Array<{
    rankingId: number;
    results: any;
  }> = [];

  try {
    // Process each location sequentially
    for (let i = 0; i < locations.length; i++) {
      const locationInput = locations[i];
      const rankingId = rankingIds[i];

      batchStatus.currentLocationIndex = i;
      batchStatus.currentLocationName = locationInput.gbpLocationName;
      batchStatusMap.set(batchId, batchStatus);

      log(
        `[Batch ${batchId}] Processing location ${i + 1}/${locations.length}: ${
          locationInput.gbpLocationName
        }`
      );

      // Update this location's status to "processing"
      await db("practice_rankings")
        .where({ id: rankingId })
        .update({
          status: "processing",
          status_detail: JSON.stringify({
            currentStep: "starting",
            message: "Starting analysis...",
            progress: 5,
            stepsCompleted: ["queued"],
            timestamps: { started_at: new Date().toISOString() },
          }),
          updated_at: new Date(),
        });

      // Retry logic for each location
      let lastError: Error | null = null;
      let success = false;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          log(
            `┌─────────────────────────────────────────────────────────────────┐`
          );
          log(
            `│ LOCATION ${i + 1}/${locations.length}: ${
              locationInput.gbpLocationName
            }`
          );
          log(`│ Attempt: ${attempt}/${MAX_RETRIES}`);
          log(
            `└─────────────────────────────────────────────────────────────────┘`
          );

          const results = await processLocationRanking(
            rankingId,
            googleAccountId,
            locationInput.gbpAccountId,
            locationInput.gbpLocationId,
            locationInput.gbpLocationName,
            locationInput.specialty,
            locationInput.marketLocation,
            domain,
            batchId
          );

          successfulResults.push({ rankingId, results });
          success = true;
          batchStatus.completedLocations++;
          break;
        } catch (error: any) {
          lastError = error;
          batchStatus.errors.push({
            locationId: locationInput.gbpLocationId,
            error: error.message || String(error),
            attempt,
          });

          log(
            `[Batch ${batchId}] Location ${locationInput.gbpLocationName} attempt ${attempt} failed: ${error.message}`
          );

          if (attempt < MAX_RETRIES) {
            log(`[Batch ${batchId}] Retrying in ${RETRY_DELAY_MS / 1000}s...`);
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          }
        }
      }

      if (!success) {
        // Location failed after all retries - fail entire batch
        batchStatus.failedLocations++;
        batchStatus.status = "failed";
        batchStatus.completedAt = new Date();
        batchStatusMap.set(batchId, batchStatus);

        // Mark all rankings in batch as failed
        await db("practice_rankings")
          .where({ batch_id: batchId })
          .update({
            status: "failed",
            error_message: `Batch failed: Location ${locationInput.gbpLocationName} failed after ${MAX_RETRIES} attempts. Error: ${lastError?.message}`,
            updated_at: new Date(),
          });

        log(
          `[Batch ${batchId}] FAILED - Location ${locationInput.gbpLocationName} exhausted all retries`
        );
        return;
      }
    }

    // All locations succeeded - batch complete
    batchStatus.status = "completed";
    batchStatus.completedAt = new Date();
    batchStatusMap.set(batchId, batchStatus);

    log(
      `╔════════════════════════════════════════════════════════════════════╗`
    );
    log(
      `║ BATCH ANALYSIS COMPLETED SUCCESSFULLY                             ║`
    );
    log(
      `╠════════════════════════════════════════════════════════════════════╣`
    );
    log(`║ Batch ID: ${batchId}`);
    log(`║ Total Locations: ${locations.length}`);
    log(
      `║ Duration: ${(
        (batchStatus.completedAt.getTime() - batchStatus.startedAt.getTime()) /
        1000
      ).toFixed(1)}s`
    );
    log(
      `╚════════════════════════════════════════════════════════════════════╝`
    );

    // Create notification for the client
    try {
      const locationCount = locations.length;
      const locationText =
        locationCount === 1
          ? locations[0].gbpLocationName
          : `${locationCount} locations`;

      // Get average score from successful results
      const avgScore =
        successfulResults.length > 0
          ? Math.round(
              (successfulResults.reduce(
                (sum, r) => sum + (r.results?.rankScore || 0),
                0
              ) /
                successfulResults.length) *
                10
            ) / 10
          : null;

      const scoreText = avgScore
        ? ` Average score: ${avgScore.toFixed(1)}`
        : "";

      await createNotification(
        domain,
        "Practice Ranking Analysis Complete",
        `Your ranking analysis for ${locationText} has been completed.${scoreText}`,
        "ranking",
        {
          batchId,
          locationCount,
          avgScore,
          rankingIds: batchStatus.rankingIds,
        }
      );

      log(`[Batch ${batchId}] Notification created for ${domain}`);
    } catch (notifyError: any) {
      logWarn(
        `Failed to create notification for batch ${batchId}: ${notifyError.message}`
      );
    }
  } catch (error: any) {
    logError(`processBatchAnalysisWithExistingRecords ${batchId}`, error);
    batchStatus.status = "failed";
    batchStatus.completedAt = new Date();
    batchStatusMap.set(batchId, batchStatus);

    // Mark all rankings in batch as failed
    await db("practice_rankings")
      .where({ batch_id: batchId })
      .update({
        status: "failed",
        error_message: `Batch failed: ${error.message}`,
        updated_at: new Date(),
      });
  }
}

/**
 * Process ranking analysis for a single location
 * Refactored from processRankingAnalysis to handle specific GBP location
 */
async function processLocationRanking(
  rankingId: number,
  googleAccountId: number,
  gbpAccountId: string,
  gbpLocationId: string,
  gbpLocationName: string,
  specialty: string,
  marketLocation: string,
  domain: string,
  batchId: string
): Promise<any> {
  const startTime = Date.now();

  log(`  ┌─ LOCATION RANKING START ─────────────────────────────────────────`);
  log(`  │ Ranking ID: ${rankingId}`);
  log(`  │ Location: ${gbpLocationName}`);
  log(`  │ GBP Account: ${gbpAccountId}`);
  log(`  │ GBP Location: ${gbpLocationId}`);
  log(`  │ Specialty: ${specialty}`);
  log(`  │ Market: ${marketLocation}`);
  log(`  └──────────────────────────────────────────────────────────────────`);

  let statusDetail: StatusDetail = {
    currentStep: "queued",
    message: "Analysis queued",
    progress: 0,
    stepsCompleted: [],
    timestamps: { started_at: new Date().toISOString() },
  };

  // Get account details
  logStep(rankingId, "INIT", "Fetching account details...");
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

  logDebug(`  Account found: ${account.domain_name}`);
  logDebug(`  GBP locations in account: ${propertyIds?.gbp?.length || 0}`);
  logDebug(`  GSC configured: ${!!propertyIds?.gsc?.siteUrl}`);

  // Get OAuth client
  logStep(rankingId, "AUTH", "Getting OAuth2 client...");
  const oauth2Client = await getValidOAuth2Client(googleAccountId);
  logDebug(`  OAuth2 client obtained successfully`);

  // Get date range (last 30 days)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  const startDateStr = startDate.toISOString().split("T")[0];
  const endDateStr = endDate.toISOString().split("T")[0];

  // ========== STEP 1: Fetch GBP Data for Specific Location ==========
  logStep(rankingId, "STEP 1/7", "Fetching GBP data...");
  await updateStatus(
    rankingId,
    "processing",
    "fetching_client_gbp",
    `Fetching GBP data for ${gbpLocationName}...`,
    10,
    statusDetail
  );

  // Find the specific location from propertyIds
  const targetLocation = propertyIds?.gbp?.find(
    (loc: GbpLocation) =>
      loc.locationId === gbpLocationId && loc.accountId === gbpAccountId
  );

  if (!targetLocation) {
    logError(
      "STEP 1",
      new Error(
        `GBP location ${gbpLocationId} not found in account ${googleAccountId}`
      )
    );
    throw new Error(
      `GBP location ${gbpLocationId} not found in account ${googleAccountId}`
    );
  }

  logDebug(`  Target location found: ${JSON.stringify(targetLocation)}`);

  // Fetch GBP data for only this specific location
  let clientGbpData: any = null;
  const gbpFetchStart = Date.now();
  clientGbpData = await fetchGBPDataForRange(
    oauth2Client,
    [targetLocation], // Pass only the target location
    startDateStr,
    endDateStr
  );
  logStep(
    rankingId,
    "STEP 1/7",
    `GBP data fetched in ${Date.now() - gbpFetchStart}ms`
  );
  logDebug(
    `  Reviews: ${
      clientGbpData?.locations?.[0]?.data?.reviews?.allTime?.totalReviewCount ||
      0
    }`
  );
  logDebug(
    `  Rating: ${
      clientGbpData?.locations?.[0]?.data?.reviews?.allTime?.averageRating || 0
    }`
  );

  // ========== STEP 2: Fetch GSC Data (shared across locations) ==========
  logStep(rankingId, "STEP 2/7", "Fetching GSC data...");
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
    const gscFetchStart = Date.now();
    clientGscData = await fetchGSCDataForRange(
      oauth2Client,
      propertyIds.gsc.siteUrl,
      startDateStr,
      endDateStr
    );
    logStep(
      rankingId,
      "STEP 2/7",
      `GSC data fetched in ${Date.now() - gscFetchStart}ms`
    );
    logDebug(`  GSC Site: ${propertyIds.gsc.siteUrl}`);
    logDebug(
      `  Queries: ${
        clientGscData?.topQueries?.length || clientGscData?.rows?.length || 0
      }`
    );
    logDebug(`  Total Impressions: ${clientGscData?.totals?.impressions || 0}`);
  } else {
    logDebug(`  No GSC configured, skipping`);
  }

  // ========== STEP 3: Discover Competitors (with caching) ==========
  logStep(rankingId, "STEP 3/7", "Discovering competitors...");
  await updateStatus(
    rankingId,
    "processing",
    "discovering_competitors",
    "Checking competitor cache...",
    30,
    statusDetail
  );

  // Check for cached competitors first - use marketLocation for this specific location
  logDebug(`  Checking cache for: ${specialty} in ${marketLocation}`);
  const cachedCompetitors = await getCachedCompetitors(
    specialty,
    marketLocation
  );
  let discoveredCompetitors: any[];
  let usedCache = false;

  if (cachedCompetitors && cachedCompetitors.length > 0) {
    // Use cached competitor list
    logStep(
      rankingId,
      "STEP 3/7",
      `Using ${cachedCompetitors.length} CACHED competitors`
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

    const searchQuery = `${specialty} ${marketLocation}`;
    logDebug(`  Search query: "${searchQuery}"`);
    const discoverStart = Date.now();
    discoveredCompetitors = await discoverCompetitors(searchQuery, 50);
    logStep(
      rankingId,
      "STEP 3/7",
      `Discovered ${discoveredCompetitors.length} NEW competitors in ${
        Date.now() - discoverStart
      }ms`
    );

    // Cache the discovered competitors for future analyses
    if (discoveredCompetitors.length > 0) {
      const competitorsToCache = discoveredCompetitors.map((c) => ({
        placeId: c.placeId,
        name: c.name,
        address: c.address,
        category: c.category,
      }));
      await setCachedCompetitors(specialty, marketLocation, competitorsToCache);
      logDebug(
        `  Cached ${competitorsToCache.length} competitors for future use`
      );
    }
  }

  // ========== STEP 4: Deep Scrape Competitors (optional) ==========
  logStep(
    rankingId,
    "STEP 4/7",
    `Scraping ${discoveredCompetitors.length} competitors...`
  );
  await updateStatus(
    rankingId,
    "processing",
    "scraping_competitors",
    `Scraping ${discoveredCompetitors.length} competitors...`,
    50,
    statusDetail
  );

  const specialtyKeywords = getSpecialtyKeywords(specialty);
  logDebug(`  Specialty keywords: ${specialtyKeywords.join(", ")}`);
  let competitorDetails: any[] = [];

  try {
    const competitorPlaceIds = discoveredCompetitors.map((c) => c.placeId);
    logDebug(`  Scraping ${competitorPlaceIds.length} place IDs...`);
    const scrapeStart = Date.now();
    competitorDetails = await getCompetitorDetails(
      competitorPlaceIds,
      specialtyKeywords
    );
    logStep(
      rankingId,
      "STEP 4/7",
      `Got detailed data for ${competitorDetails.length} competitors in ${
        Date.now() - scrapeStart
      }ms`
    );
  } catch (detailError: any) {
    // Fallback: use discovery data if detailed scrape fails
    logWarn(
      `Detailed scrape failed (${detailError.message}), using discovery data`
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
    logDebug(
      `  Using ${competitorDetails.length} competitors from discovery data (fallback)`
    );
  }

  // ========== Filter out client's own listing from competitors ==========
  // When we search Google Maps for "orthodontist Mililani, HI", the client's own
  // listing is often included in the results. We need to remove it to avoid
  // the client appearing as their own competitor in the rankings.
  const clientNameLower = gbpLocationName.toLowerCase().trim();
  const originalCompetitorCount = competitorDetails.length;

  competitorDetails = competitorDetails.filter((comp) => {
    const compNameLower = (comp.name || "").toLowerCase().trim();

    // Check for exact match
    if (compNameLower === clientNameLower) {
      logDebug(
        `  Filtering out client's own listing (exact match): ${comp.name}`
      );
      return false;
    }

    // Check for substantial overlap (one contains the other)
    // This catches cases like "Caswell Orthodontics" vs "Caswell Orthodontics - Mililani, HI"
    if (
      compNameLower.includes(clientNameLower) ||
      clientNameLower.includes(compNameLower)
    ) {
      // Only filter if substantial overlap (>50% of shorter string length)
      const shorterLength = Math.min(
        compNameLower.length,
        clientNameLower.length
      );
      const longerLength = Math.max(
        compNameLower.length,
        clientNameLower.length
      );
      const overlapRatio = shorterLength / longerLength;

      if (overlapRatio > 0.5) {
        logDebug(
          `  Filtering out client's own listing (name overlap ${(
            overlapRatio * 100
          ).toFixed(0)}%): ${comp.name}`
        );
        return false;
      }
    }

    return true;
  });

  if (originalCompetitorCount !== competitorDetails.length) {
    logDebug(
      `  Filtered out ${
        originalCompetitorCount - competitorDetails.length
      } client listing(s) from competitors`
    );
    logDebug(`  Remaining competitors: ${competitorDetails.length}`);
  }

  // ========== STEP 5: Website Audit ==========
  logStep(rankingId, "STEP 5/7", "Auditing client website...");
  await updateStatus(
    rankingId,
    "processing",
    "auditing_website",
    "Auditing client website...",
    60,
    statusDetail
  );

  let websiteAudit = null;
  const clientWebsite = targetLocation?.website || `https://${domain}`;
  logDebug(`  Website URL: ${clientWebsite}`);
  try {
    const auditStart = Date.now();
    websiteAudit = await auditWebsite(clientWebsite);
    logStep(
      rankingId,
      "STEP 5/7",
      `Website audit complete in ${Date.now() - auditStart}ms`
    );
    logDebug(`  Performance score: ${websiteAudit.performanceScore}`);
    logDebug(`  LCP: ${websiteAudit.lcp}`);
    logDebug(`  Local schema: ${websiteAudit.hasLocalSchema}`);
  } catch (auditError: any) {
    logWarn(`Website audit failed: ${auditError.message}`);
  }

  // ========== STEP 6: Calculate Scores ==========
  logStep(rankingId, "STEP 6/7", "Calculating ranking scores...");
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
  // For multi-location, we expect only one location in the response since we fetched a single location
  const clientLocation = clientGbpData?.locations?.[0];
  const gbpData = clientLocation?.data;
  const profileData = gbpData?.profile; // NAP and category data
  const clientPracticeData: PracticeData = {
    name: gbpLocationName || profileData?.title || domain,
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
  logDebug(`  Client data prepared:`);
  logDebug(`    - Name: ${clientPracticeData.name}`);
  logDebug(`    - Category: ${clientPracticeData.primaryCategory}`);
  logDebug(`    - Total Reviews: ${clientPracticeData.totalReviews}`);
  logDebug(`    - Avg Rating: ${clientPracticeData.averageRating}`);
  logDebug(`    - Reviews (30d): ${clientPracticeData.reviewsLast30d}`);

  const clientRanking = calculateRankingScore(clientPracticeData, specialty);
  logDebug(`  Client ranking score: ${clientRanking.totalScore.toFixed(2)}`);

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
      // Location metadata
      gbpLocationId: gbpLocationId,
      gbpAccountId: gbpAccountId,
      gbpLocationName: gbpLocationName,
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
        clientRankResult?.rankingResult.totalScore || clientRanking.totalScore,
      rank_position: clientRankResult?.rankPosition || 1,
      total_competitors: totalInRanking,
      ranking_factors: JSON.stringify(rankingFactors),
      raw_data: JSON.stringify(rawData),
      updated_at: new Date(),
    });

  logStep(
    rankingId,
    "STEP 6/7",
    `Ranking calculated: #${
      clientRankResult?.rankPosition
    } with score ${clientRanking.totalScore.toFixed(2)}`
  );
  logDebug(`  Total competitors in ranking: ${totalInRanking}`);
  logDebug(`  Benchmark avg score: ${benchmarks.avgScore}`);
  logDebug(`  Benchmark avg reviews: ${benchmarks.avgReviews}`);

  // ========== STEP 7: Send to LLM for Analysis (Synchronous) ==========
  logStep(rankingId, "STEP 7/7", "Sending to LLM for analysis...");
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
        batch_id: batchId,
        client: {
          domain: domain,
          practice_name: gbpLocationName,
          specialty: specialty,
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
      logDebug(
        `  LLM webhook URL: ${PRACTICE_RANKING_ANALYSIS_WEBHOOK.substring(
          0,
          50
        )}...`
      );
      const llmStart = Date.now();
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

      logStep(
        rankingId,
        "STEP 7/7",
        `LLM analysis received in ${Date.now() - llmStart}ms`
      );
      logDebug(`  LLM response keys: ${Object.keys(llmAnalysis).join(", ")}`);

      // ========== CREATE TASKS FROM TOP RECOMMENDATIONS ==========
      // Archive old tasks for this location before creating new ones
      // This ensures that when re-running analysis, old action items are replaced
      try {
        // Find previous ranking IDs for this location (excluding current)
        const previousRankings = await db("practice_rankings")
          .where({
            google_account_id: googleAccountId,
            gbp_location_id: gbpLocationId,
          })
          .whereNot({ id: rankingId })
          .select("id");

        const previousRankingIds = previousRankings.map((r) => r.id);

        if (previousRankingIds.length > 0) {
          // Archive tasks from previous rankings for this location
          const archivedCount = await db("tasks")
            .where({ agent_type: "RANKING" })
            .whereRaw("metadata::jsonb->>'practice_ranking_id' IN (?)", [
              previousRankingIds.map(String).join(","),
            ])
            .whereNot({ status: "archived" })
            .update({
              status: "archived",
              updated_at: new Date(),
            });

          if (archivedCount > 0) {
            logDebug(
              `  Archived ${archivedCount} tasks from previous rankings`
            );
          }
        }

        // Extract top_recommendations from LLM analysis
        const topRecommendations = llmAnalysis.top_recommendations || [];
        logDebug(
          `  Found ${topRecommendations.length} top recommendations to create as tasks`
        );

        // Create task records for each recommendation
        if (topRecommendations.length > 0) {
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
            due_date: null,
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
          logDebug(
            `  Created ${tasksToInsert.length} pending tasks from ranking recommendations`
          );
        }
      } catch (taskError: any) {
        // Log but don't fail the ranking process if task creation fails
        logWarn(
          `Failed to create tasks from ranking recommendations: ${taskError.message}`
        );
      }

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

      const totalDuration = Date.now() - startTime;
      log(
        `  ┌─ LOCATION RANKING COMPLETE ──────────────────────────────────────`
      );
      log(`  │ Ranking ID: ${rankingId}`);
      log(`  │ Location: ${gbpLocationName}`);
      log(`  │ Final Score: ${clientRanking.totalScore.toFixed(2)}`);
      log(
        `  │ Final Rank: #${clientRankResult?.rankPosition} of ${totalInRanking}`
      );
      log(`  │ Total Duration: ${(totalDuration / 1000).toFixed(1)}s`);
      log(`  │ LLM Analysis: Yes`);
      log(
        `  └──────────────────────────────────────────────────────────────────`
      );
    } catch (webhookError: any) {
      logWarn(`LLM webhook failed: ${webhookError.message}`);
      // Complete without LLM analysis
      await updateStatus(
        rankingId,
        "completed",
        "done",
        "Analysis complete (without AI insights)",
        100,
        statusDetail
      );

      const totalDuration = Date.now() - startTime;
      log(
        `  ┌─ LOCATION RANKING COMPLETE (NO LLM) ─────────────────────────────`
      );
      log(`  │ Ranking ID: ${rankingId}`);
      log(`  │ Location: ${gbpLocationName}`);
      log(`  │ Final Score: ${clientRanking.totalScore.toFixed(2)}`);
      log(
        `  │ Final Rank: #${clientRankResult?.rankPosition} of ${totalInRanking}`
      );
      log(`  │ Total Duration: ${(totalDuration / 1000).toFixed(1)}s`);
      log(`  │ LLM Analysis: Failed`);
      log(
        `  └──────────────────────────────────────────────────────────────────`
      );
    }
  } else {
    // No webhook configured, complete without LLM
    logDebug(`  No LLM webhook configured, completing without AI analysis`);
    await updateStatus(
      rankingId,
      "completed",
      "done",
      "Analysis complete",
      100,
      statusDetail
    );

    const totalDuration = Date.now() - startTime;
    log(
      `  ┌─ LOCATION RANKING COMPLETE (NO LLM CONFIG) ────────────────────────`
    );
    log(`  │ Ranking ID: ${rankingId}`);
    log(`  │ Location: ${gbpLocationName}`);
    log(`  │ Final Score: ${clientRanking.totalScore.toFixed(2)}`);
    log(
      `  │ Final Rank: #${clientRankResult?.rankPosition} of ${totalInRanking}`
    );
    log(`  │ Total Duration: ${(totalDuration / 1000).toFixed(1)}s`);
    log(`  │ LLM Analysis: Not configured`);
    log(
      `  └──────────────────────────────────────────────────────────────────`
    );
  }

  // Return results for batch tracking
  return {
    rankingId,
    gbpLocationId,
    gbpLocationName,
    rankScore:
      clientRankResult?.rankingResult.totalScore || clientRanking.totalScore,
    rankPosition: clientRankResult?.rankPosition || 1,
  };
}

// =====================================================================
// API ENDPOINTS
// =====================================================================

/**
 * POST /api/admin/practice-ranking/trigger
 * Start a new batch ranking analysis for multiple locations
 */
router.post("/trigger", async (req: Request, res: Response) => {
  try {
    const { googleAccountId, locations } = req.body;

    // Support both old format (specialty, location) and new format (locations array)
    if (!googleAccountId) {
      return res.status(400).json({
        success: false,
        error: "MISSING_PARAMS",
        message: "googleAccountId is required",
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

    const propertyIds =
      typeof account.google_property_ids === "string"
        ? JSON.parse(account.google_property_ids)
        : account.google_property_ids;

    // Handle new multi-location format
    if (locations && Array.isArray(locations) && locations.length > 0) {
      // Validate each location
      for (const loc of locations) {
        if (
          !loc.gbpAccountId ||
          !loc.gbpLocationId ||
          !loc.gbpLocationName ||
          !loc.specialty ||
          !loc.marketLocation
        ) {
          return res.status(400).json({
            success: false,
            error: "INVALID_LOCATION",
            message:
              "Each location must have gbpAccountId, gbpLocationId, gbpLocationName, specialty, and marketLocation",
          });
        }

        // Verify location exists in account
        const locationExists = propertyIds?.gbp?.some(
          (gbp: GbpLocation) =>
            gbp.locationId === loc.gbpLocationId &&
            gbp.accountId === loc.gbpAccountId
        );

        if (!locationExists) {
          return res.status(400).json({
            success: false,
            error: "LOCATION_NOT_FOUND",
            message: `Location ${loc.gbpLocationId} not found in account`,
          });
        }
      }

      // Generate batch ID
      const batchId = uuidv4();

      log(
        `Starting batch ${batchId} for ${locations.length} locations in account ${googleAccountId}`
      );

      // Create ALL ranking records upfront with "pending" status
      // This ensures the frontend can see all locations immediately when the trigger returns
      const rankingIds: number[] = [];
      for (let i = 0; i < locations.length; i++) {
        const locationInput = locations[i];
        const [result] = await db("practice_rankings")
          .insert({
            google_account_id: googleAccountId,
            domain: account.domain_name,
            specialty: locationInput.specialty,
            location: locationInput.marketLocation,
            gbp_account_id: locationInput.gbpAccountId,
            gbp_location_id: locationInput.gbpLocationId,
            gbp_location_name: locationInput.gbpLocationName,
            batch_id: batchId,
            observed_at: new Date(),
            status: "pending",
            status_detail: JSON.stringify({
              currentStep: "queued",
              message: "Waiting in queue...",
              progress: 0,
              stepsCompleted: [],
              timestamps: { created_at: new Date().toISOString() },
            }),
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning("id");
        rankingIds.push(result.id);
      }

      log(
        `[Batch ${batchId}] Created ${rankingIds.length} ranking records upfront`
      );

      // Start background batch processing (records already created)
      setImmediate(() => {
        processBatchAnalysisWithExistingRecords(
          batchId,
          googleAccountId,
          locations,
          account.domain_name,
          rankingIds
        ).catch((err) => {
          logError(`Background batch process ${batchId}`, err);
        });
      });

      return res.json({
        success: true,
        message: `Batch ranking analysis started for ${locations.length} locations`,
        batchId: batchId,
        totalLocations: locations.length,
        rankingIds: rankingIds,
        locations: locations.map((l: LocationInput) => ({
          gbpLocationId: l.gbpLocationId,
          gbpLocationName: l.gbpLocationName,
          specialty: l.specialty,
          marketLocation: l.marketLocation,
        })),
      });
    }

    // Handle legacy single-location format (backward compatibility)
    const { specialty, location } = req.body;
    if (!specialty || !location) {
      return res.status(400).json({
        success: false,
        error: "MISSING_PARAMS",
        message:
          "Either 'locations' array or 'specialty' and 'location' are required",
      });
    }

    // Use first GBP location for legacy format
    const firstGbp = propertyIds?.gbp?.[0];
    if (!firstGbp) {
      return res.status(400).json({
        success: false,
        error: "NO_GBP",
        message: "Account has no GBP locations configured",
      });
    }

    const legacyLocations: LocationInput[] = [
      {
        gbpAccountId: firstGbp.accountId,
        gbpLocationId: firstGbp.locationId,
        gbpLocationName: firstGbp.displayName,
        specialty: specialty,
        marketLocation: location,
      },
    ];

    const batchId = uuidv4();

    // Start background batch processing
    setImmediate(() => {
      processBatchAnalysis(
        batchId,
        googleAccountId,
        legacyLocations,
        account.domain_name
      ).catch((err) => {
        logError(`Background batch process ${batchId}`, err);
      });
    });

    return res.json({
      success: true,
      message: "Ranking analysis started",
      batchId: batchId,
      totalLocations: 1,
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
 * GET /api/admin/practice-ranking/batch/:batchId/status
 * Get batch analysis status
 */
router.get("/batch/:batchId/status", async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;

    // Check in-memory status first (for active batches)
    const inMemoryStatus = batchStatusMap.get(batchId);

    if (inMemoryStatus) {
      return res.json({
        success: true,
        batchId: inMemoryStatus.batchId,
        status: inMemoryStatus.status,
        totalLocations: inMemoryStatus.totalLocations,
        completedLocations: inMemoryStatus.completedLocations,
        failedLocations: inMemoryStatus.failedLocations,
        currentLocationIndex: inMemoryStatus.currentLocationIndex,
        currentLocationName: inMemoryStatus.currentLocationName,
        rankingIds: inMemoryStatus.rankingIds,
        errors: inMemoryStatus.errors,
        startedAt: inMemoryStatus.startedAt,
        completedAt: inMemoryStatus.completedAt,
        progress: Math.round(
          (inMemoryStatus.completedLocations / inMemoryStatus.totalLocations) *
            100
        ),
      });
    }

    // Fall back to database query
    const rankings = await db("practice_rankings")
      .where({ batch_id: batchId })
      .select(
        "id",
        "gbp_location_id",
        "gbp_location_name",
        "status",
        "rank_score",
        "rank_position",
        "error_message",
        "created_at",
        "updated_at"
      )
      .orderBy("created_at", "asc");

    if (rankings.length === 0) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: `Batch ${batchId} not found`,
      });
    }

    const completed = rankings.filter((r) => r.status === "completed").length;
    const failed = rankings.filter((r) => r.status === "failed").length;
    const pending = rankings.filter(
      (r) => r.status === "pending" || r.status === "processing"
    ).length;

    let batchStatus: "processing" | "completed" | "failed" = "processing";
    if (failed > 0) {
      batchStatus = "failed";
    } else if (pending === 0) {
      batchStatus = "completed";
    }

    return res.json({
      success: true,
      batchId: batchId,
      status: batchStatus,
      totalLocations: rankings.length,
      completedLocations: completed,
      failedLocations: failed,
      pendingLocations: pending,
      rankings: rankings.map((r) => ({
        id: r.id,
        gbpLocationId: r.gbp_location_id,
        gbpLocationName: r.gbp_location_name,
        status: r.status,
        rankScore: r.rank_score,
        rankPosition: r.rank_position,
        errorMessage: r.error_message,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      progress: Math.round((completed / rankings.length) * 100),
    });
  } catch (error: any) {
    logError("GET /batch/:batchId/status", error);
    return res.status(500).json({
      success: false,
      error: "BATCH_STATUS_ERROR",
      message: error.message || "Failed to get batch status",
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
      gbpLocationId: ranking.gbp_location_id,
      gbpLocationName: ranking.gbp_location_name,
      batchId: ranking.batch_id,
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
        gbpAccountId: ranking.gbp_account_id,
        gbpLocationId: ranking.gbp_location_id,
        gbpLocationName: ranking.gbp_location_name,
        batchId: ranking.batch_id,
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
        "gbp_location_id",
        "gbp_location_name",
        "batch_id",
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
        gbpLocationId: r.gbp_location_id,
        gbpLocationName: r.gbp_location_name,
        batchId: r.batch_id,
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
 * List onboarded accounts with their GBP locations for dropdown
 */
router.get("/accounts", async (req: Request, res: Response) => {
  try {
    const accounts = await db("google_accounts")
      .where({ onboarding_completed: true })
      .select("id", "domain_name", "practice_name", "google_property_ids")
      .orderBy("practice_name", "asc");

    return res.json({
      success: true,
      accounts: accounts.map((a) => {
        const propertyIds =
          typeof a.google_property_ids === "string"
            ? JSON.parse(a.google_property_ids)
            : a.google_property_ids;

        // Debug: Log the raw GBP data to understand structure
        const rawGbp = propertyIds?.gbp || [];
        if (rawGbp.length > 0) {
          log(
            `Account ${a.id} (${
              a.domain_name
            }) GBP locations raw structure: ${JSON.stringify(rawGbp[0])}`
          );
        }

        const gbpLocations: Array<{
          accountId: string;
          locationId: string;
          displayName: string;
          address?: string;
        }> = (propertyIds?.gbp || []).map((gbp: any) => ({
          accountId: gbp.accountId,
          locationId: gbp.locationId,
          // Handle both 'displayName' (new format) and 'name' (old format from settings)
          displayName:
            gbp.displayName || gbp.name || gbp.title || "Unknown Location",
          // Extract address from GBP if available for suggested market location
          address: gbp.address || gbp.storefrontAddress?.addressLines?.[0],
        }));

        return {
          id: a.id,
          domain: a.domain_name,
          practiceName: a.practice_name || a.domain_name,
          hasGbp: gbpLocations.length > 0,
          hasGsc: !!propertyIds?.gsc?.siteUrl,
          gbpLocations: gbpLocations,
          gbpCount: gbpLocations.length,
        };
      }),
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
 * DELETE /api/admin/practice-ranking/batch/:batchId
 * Delete all rankings in a batch
 */
router.delete("/batch/:batchId", async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;

    if (!batchId) {
      return res.status(400).json({
        success: false,
        error: "INVALID_BATCH_ID",
        message: "Batch ID is required",
      });
    }

    // Check if batch exists
    const rankings = await db("practice_rankings")
      .where({ batch_id: batchId })
      .select("id", "status");

    if (rankings.length === 0) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: `Batch ${batchId} not found`,
      });
    }

    // Delete all rankings in the batch
    const deletedCount = await db("practice_rankings")
      .where({ batch_id: batchId })
      .del();

    // Clean up in-memory batch status if present
    batchStatusMap.delete(batchId);

    log(`Deleted batch ${batchId} (${deletedCount} rankings)`);

    return res.json({
      success: true,
      message: `Batch deleted successfully`,
      deletedCount: deletedCount,
      batchId: batchId,
    });
  } catch (error: any) {
    logError("DELETE /batch/:batchId", error);
    return res.status(500).json({
      success: false,
      error: "DELETE_BATCH_ERROR",
      message: error.message || "Failed to delete batch",
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
 * Get the latest completed rankings for all locations of a google account (client dashboard)
 * Returns array of rankings, one per gbp_location_id
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

    // Get unique gbp_location_ids for this account
    const locationIds = await db("practice_rankings")
      .where({
        google_account_id: Number(googleAccountId),
        status: "completed",
      })
      .whereNotNull("gbp_location_id")
      .distinct("gbp_location_id")
      .pluck("gbp_location_id");

    if (locationIds.length === 0) {
      // Fall back to legacy: get latest ranking without gbp_location_id
      const legacyRanking = await db("practice_rankings")
        .where({
          google_account_id: Number(googleAccountId),
          status: "completed",
        })
        .whereNull("gbp_location_id")
        .orderBy("created_at", "desc")
        .first();

      if (!legacyRanking) {
        return res.status(404).json({
          success: false,
          error: "NOT_FOUND",
          message: "No completed ranking found for this account",
        });
      }

      // Return legacy single ranking in array format for consistency
      const parse = (field: any) => {
        if (!field) return null;
        return typeof field === "string" ? JSON.parse(field) : field;
      };

      return res.json({
        success: true,
        rankings: [
          {
            id: legacyRanking.id,
            googleAccountId: legacyRanking.google_account_id,
            domain: legacyRanking.domain,
            specialty: legacyRanking.specialty,
            location: legacyRanking.location,
            gbpAccountId: null,
            gbpLocationId: null,
            gbpLocationName: null,
            batchId: null,
            observedAt: legacyRanking.observed_at,
            status: legacyRanking.status,
            rankScore: legacyRanking.rank_score,
            rankPosition: legacyRanking.rank_position,
            totalCompetitors: legacyRanking.total_competitors,
            rankingFactors: parse(legacyRanking.ranking_factors),
            rawData: parse(legacyRanking.raw_data),
            llmAnalysis: parse(legacyRanking.llm_analysis),
            statusDetail: parse(legacyRanking.status_detail),
            errorMessage: legacyRanking.error_message,
            createdAt: legacyRanking.created_at,
            updatedAt: legacyRanking.updated_at,
          },
        ],
      });
    }

    // Get latest ranking AND previous ranking for each location (for trend comparison)
    const rankingsWithPrevious = await Promise.all(
      locationIds.map(async (locationId) => {
        // Get the two most recent completed rankings for this location
        const [current, previous] = await db("practice_rankings")
          .where({
            google_account_id: Number(googleAccountId),
            gbp_location_id: locationId,
            status: "completed",
          })
          .orderBy("created_at", "desc")
          .limit(2);

        return { current, previous: previous || null };
      })
    );

    // Filter out nulls and parse JSON fields
    const parse = (field: any) => {
      if (!field) return null;
      return typeof field === "string" ? JSON.parse(field) : field;
    };

    const validRankings = rankingsWithPrevious
      .filter((r) => r.current !== null && r.current !== undefined)
      .map(({ current: ranking, previous }) => ({
        id: ranking.id,
        googleAccountId: ranking.google_account_id,
        domain: ranking.domain,
        specialty: ranking.specialty,
        location: ranking.location,
        gbpAccountId: ranking.gbp_account_id,
        gbpLocationId: ranking.gbp_location_id,
        gbpLocationName: ranking.gbp_location_name,
        batchId: ranking.batch_id,
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
        // Include previous ranking data for trend comparison
        previousAnalysis: previous
          ? {
              id: previous.id,
              observedAt: previous.observed_at,
              rankScore: previous.rank_score,
              rankPosition: previous.rank_position,
              totalCompetitors: previous.total_competitors,
              rawData: parse(previous.raw_data),
            }
          : null,
      }));

    return res.json({
      success: true,
      rankings: validRankings,
    });
  } catch (error: any) {
    logError("GET /latest", error);
    return res.status(500).json({
      success: false,
      error: "LATEST_ERROR",
      message: error.message || "Failed to get latest rankings",
    });
  }
});

/**
 * GET /api/practice-ranking/tasks
 * Get approved ranking tasks for the Practice Ranking dashboard
 * Query params: practiceRankingId OR (googleAccountId + gbpLocationId)
 * Returns only approved tasks for display in the Action Plans card
 */
router.get("/tasks", async (req: Request, res: Response) => {
  try {
    const { practiceRankingId, googleAccountId, gbpLocationId } = req.query;

    log(
      `[Tasks] Fetching approved ranking tasks with params: ${JSON.stringify(
        req.query
      )}`
    );

    let tasks: any[] = [];

    if (practiceRankingId) {
      // Fetch tasks for specific practice ranking
      tasks = await db("tasks")
        .where({
          agent_type: "RANKING",
          is_approved: true,
        })
        .whereRaw("metadata::jsonb->>'practice_ranking_id' = ?", [
          String(practiceRankingId),
        ])
        .whereNot({ status: "archived" })
        .orderBy("created_at", "asc")
        .select("*");
    } else if (googleAccountId && gbpLocationId) {
      // Find the latest completed ranking for this location
      const latestRanking = await db("practice_rankings")
        .where({
          google_account_id: Number(googleAccountId),
          gbp_location_id: String(gbpLocationId),
          status: "completed",
        })
        .orderBy("created_at", "desc")
        .first();

      if (latestRanking) {
        // Fetch tasks for this ranking
        tasks = await db("tasks")
          .where({
            agent_type: "RANKING",
            is_approved: true,
          })
          .whereRaw("metadata::jsonb->>'practice_ranking_id' = ?", [
            String(latestRanking.id),
          ])
          .whereNot({ status: "archived" })
          .orderBy("created_at", "asc")
          .select("*");
      }
    } else if (googleAccountId) {
      // Fetch all approved ranking tasks for this account (across all locations)
      tasks = await db("tasks")
        .where({
          google_account_id: Number(googleAccountId),
          agent_type: "RANKING",
          is_approved: true,
        })
        .whereNot({ status: "archived" })
        .orderBy("created_at", "asc")
        .select("*");
    } else {
      return res.status(400).json({
        success: false,
        error: "MISSING_PARAMS",
        message:
          "Either practiceRankingId, googleAccountId, or both googleAccountId and gbpLocationId are required",
      });
    }

    // Parse metadata for each task
    const formattedTasks = tasks.map((task) => {
      let metadata = null;
      try {
        metadata =
          typeof task.metadata === "string"
            ? JSON.parse(task.metadata)
            : task.metadata;
      } catch (e) {
        // Ignore JSON parse errors
      }

      return {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        category: task.category,
        agentType: task.agent_type,
        isApproved: task.is_approved,
        dueDate: task.due_date,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
        completedAt: task.completed_at,
        metadata: {
          practiceRankingId: metadata?.practice_ranking_id || null,
          gbpLocationId: metadata?.gbp_location_id || null,
          gbpLocationName: metadata?.gbp_location_name || null,
          priority: metadata?.priority || null,
          impact: metadata?.impact || null,
          effort: metadata?.effort || null,
          timeline: metadata?.timeline || null,
        },
      };
    });

    log(`[Tasks] Found ${formattedTasks.length} approved ranking tasks`);

    return res.json({
      success: true,
      tasks: formattedTasks,
      total: formattedTasks.length,
    });
  } catch (error: any) {
    logError("GET /tasks", error);
    return res.status(500).json({
      success: false,
      error: "TASKS_ERROR",
      message: error.message || "Failed to fetch ranking tasks",
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

    // Get the ranking record to access context for task creation
    const ranking = await db("practice_rankings")
      .where({ id: practice_ranking_id })
      .first();

    if (!ranking) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: `Ranking ${practice_ranking_id} not found`,
      });
    }

    // ========== CREATE TASKS FROM TOP RECOMMENDATIONS ==========
    // Archive old tasks for this location before creating new ones
    try {
      // Find previous ranking IDs for this location (excluding current)
      const previousRankings = await db("practice_rankings")
        .where({
          google_account_id: ranking.google_account_id,
          gbp_location_id: ranking.gbp_location_id,
        })
        .whereNot({ id: practice_ranking_id })
        .select("id");

      const previousRankingIds = previousRankings.map((r: any) => r.id);

      if (previousRankingIds.length > 0) {
        // Archive tasks from previous rankings for this location
        const archivedCount = await db("tasks")
          .where({ agent_type: "RANKING" })
          .whereRaw("metadata::jsonb->>'practice_ranking_id' IN (?)", [
            previousRankingIds.map(String).join(","),
          ])
          .whereNot({ status: "archived" })
          .update({
            status: "archived",
            updated_at: new Date(),
          });

        if (archivedCount > 0) {
          logDebug(
            `  [Webhook] Archived ${archivedCount} tasks from previous rankings`
          );
        }
      }

      // Extract top_recommendations from LLM analysis
      const topRecommendations = llmAnalysis.top_recommendations || [];
      logDebug(
        `  [Webhook] Found ${topRecommendations.length} top recommendations to create as tasks`
      );

      // Create task records for each recommendation
      if (topRecommendations.length > 0) {
        const tasksToInsert = topRecommendations.map((item: any) => ({
          domain_name: ranking.domain,
          google_account_id: ranking.google_account_id,
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
          due_date: null,
          metadata: JSON.stringify({
            practice_ranking_id: practice_ranking_id,
            gbp_location_id: ranking.gbp_location_id,
            gbp_location_name: ranking.gbp_location_name,
            priority: item.priority || null,
            impact: item.impact || null,
            effort: item.effort || null,
            timeline: item.timeline || null,
          }),
          created_at: new Date(),
          updated_at: new Date(),
        }));

        await db("tasks").insert(tasksToInsert);
        logDebug(
          `  [Webhook] Created ${tasksToInsert.length} pending tasks from ranking recommendations`
        );
      }
    } catch (taskError: any) {
      // Log but don't fail the webhook if task creation fails
      logWarn(
        `[Webhook] Failed to create tasks from ranking recommendations: ${taskError.message}`
      );
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
