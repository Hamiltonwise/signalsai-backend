/**
 * AgentsV2 - Multi-Client Agent Processing System
 *
 * Single daily endpoint that processes all clients:
 * - Proofline agent (daily): Always runs with last 2 days + yesterday data
 * - Summary agent (monthly): Runs when conditions are met
 * - Opportunity agent (monthly): Runs after Summary, uses Summary output
 *
 * Features:
 * - Multi-client support (processes all google_accounts)
 * - Sequential processing to avoid API rate limits
 * - Comprehensive logging to src/logs/agent-run.log
 * - Duplicate prevention and intelligent scheduling
 * - Stores raw data and agent outputs to database
 */

import express, { Request, Response } from "express";
import { db } from "../database/connection";
import {
  createOAuth2ClientForAccount,
  getValidOAuth2Client,
} from "../auth/oauth2Helper";
import {
  fetchAllServiceData,
  GooglePropertyIds,
  fetchGBPDataForRange,
} from "../services/dataAggregator";
import { aggregatePmsData } from "../utils/pmsAggregator";
import {
  createNotification,
  notifyAdmins,
  notifyAdminsMonthlyAgentComplete,
} from "../utils/notificationHelper";
import {
  processLocationRanking,
  MAX_RETRIES,
  RETRY_DELAY_MS,
} from "../services/rankingService";
import {
  updateAutomationStatus,
  completeStep,
  completeAutomation,
  failAutomation,
  AutomationSummary,
  MonthlyAgentKey,
} from "../utils/pmsAutomationStatus";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

// =====================================================================
// CONFIGURATION
// =====================================================================

const LOG_DIR = path.join(__dirname, "../logs");
const LOG_FILE = path.join(LOG_DIR, "agent-run.log");

// Agent webhook URLs from environment variables
const PROOFLINE_WEBHOOK = process.env.PROOFLINE_AGENT_WEBHOOK || "";
const SUMMARY_WEBHOOK = process.env.SUMMARY_AGENT_WEBHOOK || "";
const REFERRAL_ENGINE_WEBHOOK = process.env.REFERRAL_ENGINE_AGENT_WEBHOOK || "";
const OPPORTUNITY_WEBHOOK = process.env.OPPORTUNITY_AGENT_WEBHOOK || "";
const CRO_OPTIMIZER_WEBHOOK = process.env.CRO_OPTIMIZER_AGENT_WEBHOOK || "";
const COPY_COMPANION_WEBHOOK = process.env.COPY_COMPANION_AGENT_WEBHOOK || "";
const GUARDIAN_AGENT_WEBHOOK = process.env.GUARDIAN_AGENT_WEBHOOK || "";
const GOVERNANCE_AGENT_WEBHOOK = process.env.GOVERNANCE_AGENT_WEBHOOK || "";
const IDENTIFIER_AGENT_WEBHOOK = process.env.IDENTIFIER_AGENT_WEBHOOK || "";

// PMS data availability flag (always true for now as placeholder)
const MONTH_PMS_DATA_AVAILABLE = true;

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// =====================================================================
// LOGGING UTILITIES
// =====================================================================

function log(message: string): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  try {
    fs.appendFileSync(LOG_FILE, logMessage);
    console.log(message);
  } catch (error) {
    console.error(`Failed to write to log file: ${error}`);
  }
}

function logError(operation: string, error: any): void {
  const errorMessage = `ERROR in ${operation}: ${error.message || error}`;
  const stackTrace = error.stack ? `\nStack: ${error.stack}` : "";
  log(`${errorMessage}${stackTrace}`);
}

/**
 * Delay execution for specified milliseconds
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =====================================================================
// OUTPUT VALIDATION
// =====================================================================

/**
 * Validate agent output is not empty
 * Returns true if output is valid, false if empty/invalid
 */
function isValidAgentOutput(output: any, agentType: string): boolean {
  // Null or undefined
  if (output === null || output === undefined) {
    log(`  [VALIDATION] ${agentType} output is null/undefined`);
    return false;
  }

  // Empty string
  if (typeof output === "string") {
    const trimmed = output.trim();
    if (trimmed === "" || trimmed === "{}") {
      log(`  [VALIDATION] ${agentType} output is empty string`);
      return false;
    }
  }

  // Empty object
  if (typeof output === "object") {
    const keys = Object.keys(output);
    if (keys.length === 0) {
      log(`  [VALIDATION] ${agentType} output is empty object`);
      return false;
    }

    // Check if all values are empty
    const hasContent = keys.some((key) => {
      const value = output[key];
      if (value === null || value === undefined) return false;
      if (typeof value === "string" && value.trim() === "") return false;
      if (typeof value === "object" && Object.keys(value).length === 0)
        return false;
      return true;
    });

    if (!hasContent) {
      log(`  [VALIDATION] ${agentType} output has no valid content`);
      return false;
    }
  }

  log(`  [VALIDATION] ✓ ${agentType} output is valid`);
  return true;
}

/**
 * Log agent output for debugging
 */
function logAgentOutput(agentType: string, output: any): void {
  const outputStr = JSON.stringify(output, null, 2);
  const preview =
    outputStr.length > 500
      ? outputStr.substring(0, 500) + "... (truncated)"
      : outputStr;
  log(`  [OUTPUT] ${agentType} output preview:\n${preview}`);
}

// =====================================================================
// DATE HELPERS
// =====================================================================

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

/**
 * Get yesterday and day before yesterday as separate single days
 */
function getDailyDates(referenceDate?: string): {
  yesterday: string;
  dayBeforeYesterday: string;
} {
  const base = referenceDate ? new Date(referenceDate) : new Date();
  const yesterday = new Date(base);
  yesterday.setDate(yesterday.getDate() - 1);
  const dayBeforeYesterday = new Date(base);
  dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);

  return {
    yesterday: formatDate(yesterday),
    dayBeforeYesterday: formatDate(dayBeforeYesterday),
  };
}

/**
 * Get previous month date range
 */
function getPreviousMonthRange(referenceDate?: string): {
  startDate: string;
  endDate: string;
} {
  const now = referenceDate ? new Date(referenceDate) : new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);

  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
  };
}

/**
 * Check if we should run monthly agents
 * Conditions: Today is >= 1st of month AND PMS data is available
 */
function shouldRunMonthlyAgents(referenceDate?: string): boolean {
  const now = referenceDate ? new Date(referenceDate) : new Date();
  const dayOfMonth = now.getDate();

  // Must be 1st or later in the month
  if (dayOfMonth < 1) return false;

  // Check PMS data availability flag
  if (!MONTH_PMS_DATA_AVAILABLE) return false;

  return true;
}

/**
 * Get current month date range (1st of month to today)
 */
function getCurrentMonthRange(): {
  startDate: string;
  endDate: string;
} {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = now;

  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
  };
}

// =====================================================================
// AGENT WEBHOOK CALLS
// =====================================================================

/**
 * Call an agent webhook with payload
 */
async function callAgentWebhook(
  webhookUrl: string,
  payload: any,
  agentName: string
): Promise<any> {
  if (!webhookUrl) {
    throw new Error(`No webhook URL configured for ${agentName}`);
  }

  log(`  → Calling ${agentName} webhook: ${webhookUrl}`);

  try {
    const response = await axios.post(webhookUrl, payload, {
      timeout: 600000, // 10 minutes timeout
      headers: {
        "Content-Type": "application/json",
      },
    });

    log(`  ✓ ${agentName} webhook responded successfully`);
    return response.data;
  } catch (error: any) {
    log(`  ✗ ${agentName} webhook failed: ${error?.message || String(error)}`);
    throw error;
  }
}

/**
 * Call Identifier Agent to determine specialty and market location from GBP profile
 */
async function identifyLocationMeta(
  gbpData: any,
  domain: string
): Promise<{ specialty: string; marketLocation: string }> {
  log(`  [IDENTIFIER] Identifying specialty and market for ${domain}`);

  if (!IDENTIFIER_AGENT_WEBHOOK) {
    log(
      `  [IDENTIFIER] ⚠ IDENTIFIER_AGENT_WEBHOOK not configured, using fallbacks`
    );
    return getFallbackMeta(gbpData);
  }

  try {
    const payload = {
      domain,
      gbp_profile: gbpData.profile || {},
      // Include full storefront address fields for better location identification
      storefront_address: gbpData.profile?.storefrontAddress || {},
      address: {
        locality: gbpData.profile?.storefrontAddress?.locality || "",
        administrativeArea:
          gbpData.profile?.storefrontAddress?.administrativeArea || "",
        postalCode: gbpData.profile?.storefrontAddress?.postalCode || "",
        addressLines: gbpData.profile?.storefrontAddress?.addressLines || [],
      },
    };

    const response = await axios.post(IDENTIFIER_AGENT_WEBHOOK, payload, {
      timeout: 60000,
      headers: { "Content-Type": "application/json" },
    });

    let data = response.data;
    if (Array.isArray(data)) data = data[0] || {};

    const specialty = data.specialty || "orthodontist";
    const marketLocation = data.marketLocation || getFallbackMarket(gbpData);

    log(`  [IDENTIFIER] ✓ Identified: ${specialty} in ${marketLocation}`);

    return { specialty, marketLocation };
  } catch (error: any) {
    log(`  [IDENTIFIER] ✗ Webhook failed: ${error.message}. Using fallbacks.`);
    return getFallbackMeta(gbpData);
  }
}

/**
 * Fallback logic for location metadata
 */
function getFallbackMeta(gbpData: any): {
  specialty: string;
  marketLocation: string;
} {
  return {
    specialty: "orthodontist",
    marketLocation: getFallbackMarket(gbpData),
  };
}

/**
 * Extract city, state from GBP profile storefront address
 */
function getFallbackMarket(gbpData: any): string {
  const addr = gbpData.profile?.storefrontAddress;
  if (addr && addr.locality && addr.administrativeArea) {
    return `${addr.locality}, ${addr.administrativeArea}`;
  }
  return "Unknown, US";
}

// =====================================================================
// PAYLOAD BUILDERS
// =====================================================================

/**
 * Build payload for Proofline daily agent
 */
function buildProoflinePayload(params: {
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

/**
 * Build payload for Summary monthly agent
 * Includes GA4, GBP, GSC, PMS, and Clarity data
 */
function buildSummaryPayload(params: {
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
      clarity: params.clarityData || null,
    },
  };
}

/**
 * Build payload for Opportunity monthly agent
 * Only passes the Summary agent's output, nothing else
 */
function buildOpportunityPayload(params: {
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

/**
 * Build payload for Referral Analysis Engine agent
 * Includes GA4, GBP, GSC, PMS, and Clarity data (same as Summary agent)
 */
function buildReferralEnginePayload(params: {
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
      ...params.monthData,
      pms: params.pmsData || null,
      clarity: params.clarityData || null,
    },
  };
}

/**
 * Build payload for CRO Optimizer monthly agent
 * Only passes the Summary agent's output, nothing else
 */
function buildCroOptimizerPayload(params: {
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

/**
 * Build payload for Guardian/Governance agents
 * Includes historical PASS and REJECT recommendations for context
 */
function buildGuardianGovernancePayload(
  agentUnderTest: string,
  outputs: any[],
  passedRecommendations?: any[],
  rejectedRecommendations?: any[]
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

/**
 * Parse and save recommendations from Guardian and Governance agent outputs
 * to the agent_recommendations table for admin tracking
 * Failsafe: Will not throw errors, only logs warnings
 */
async function saveRecommendationsFromAgents(
  guardianResultId: number,
  governanceResultId: number,
  guardianResults: any[],
  governanceResults: any[]
): Promise<void> {
  const recommendations: any[] = [];

  log(`[GUARDIAN-GOV] Parsing recommendations for database storage...`);

  // ============================================================
  // Process Guardian recommendations
  // ============================================================
  try {
    for (const result of guardianResults) {
      const agentUnderTest = result.agent_under_test;

      if (!result.recommendations || !Array.isArray(result.recommendations)) {
        log(
          `  [WARNING] No recommendations array for guardian/${agentUnderTest}`
        );
        continue;
      }

      for (const rec of result.recommendations) {
        // Guardian output structure: recommendations is array of objects,
        // each object has a nested 'recommendations' array
        const nestedRecs = Array.isArray(rec.recommendations)
          ? rec.recommendations
          : [];

        for (const item of nestedRecs) {
          // Skip if essential fields are missing
          if (!item.title) {
            log(`  [WARNING] Skipping guardian recommendation without title`);
            continue;
          }

          recommendations.push({
            agent_result_id: guardianResultId,
            source_agent_type: "guardian",
            agent_under_test: agentUnderTest,
            title: item.title,
            explanation: item.explanation || null,
            type: item.type || null,
            category: item.category || null,
            urgency: item.urgency || null,
            severity: item.severity || rec.severity || 1,
            verdict: rec.verdict || null,
            confidence: rec.confidence || null,
            status: null,
            evidence_links: JSON.stringify(item.evidence_links || []),
            rule_reference:
              item.rule_reference || rec.citations?.join("; ") || null,
            suggested_action: item.suggested_action || null,
            escalation_required: item.escalation_required || false,
            observed_at: rec.observed_at
              ? new Date(rec.observed_at)
              : new Date(),
            created_at: new Date(),
            updated_at: new Date(),
          });
        }
      }
    }

    log(
      `  [GUARDIAN-GOV] Parsed ${recommendations.length} Guardian recommendation(s)`
    );
  } catch (error: any) {
    logError("Parse Guardian recommendations", error);
    log(`  [WARNING] Guardian parsing failed, continuing with Governance...`);
  }

  // ============================================================
  // Process Governance recommendations
  // ============================================================
  try {
    for (const result of governanceResults) {
      const agentUnderTest = result.agent_under_test;

      if (!result.recommendations || !Array.isArray(result.recommendations)) {
        log(
          `  [WARNING] No recommendations array for governance/${agentUnderTest}`
        );
        continue;
      }

      for (const rec of result.recommendations) {
        // Governance output structure: similar to Guardian
        const nestedRecs = Array.isArray(rec.recommendations)
          ? rec.recommendations
          : [];

        for (const item of nestedRecs) {
          if (!item.title) {
            log(`  [WARNING] Skipping governance recommendation without title`);
            continue;
          }

          recommendations.push({
            agent_result_id: governanceResultId,
            source_agent_type: "governance_sentinel",
            agent_under_test: agentUnderTest,
            title: item.title,
            explanation: item.explanation || null,
            type: item.type || null,
            category: item.category || null,
            urgency: item.urgency || null,
            severity: item.severity || rec.severity || 1,
            verdict: rec.verdict || null,
            confidence: rec.confidence || null,
            status: null,
            evidence_links: JSON.stringify(item.evidence_links || []),
            rule_reference:
              item.rule_reference || rec.citations?.join("; ") || null,
            suggested_action: item.suggested_action || null,
            escalation_required: item.escalation_required || false,
            observed_at: rec.observed_at
              ? new Date(rec.observed_at)
              : new Date(),
            created_at: new Date(),
            updated_at: new Date(),
          });
        }
      }
    }

    log(
      `  [GUARDIAN-GOV] Parsed ${
        recommendations.length -
        guardianResults.reduce(
          (acc, r) =>
            acc +
            (r.recommendations?.reduce(
              (sum: number, rec: any) =>
                sum +
                (Array.isArray(rec.recommendations)
                  ? rec.recommendations.length
                  : 0),
              0
            ) || 0),
          0
        )
      } Governance recommendation(s)`
    );
  } catch (error: any) {
    logError("Parse Governance recommendations", error);
    log(`  [WARNING] Governance parsing failed`);
  }

  // ============================================================
  // Bulk insert all recommendations
  // ============================================================
  if (recommendations.length > 0) {
    try {
      await db("agent_recommendations").insert(recommendations);
      log(
        `[GUARDIAN-GOV] ✓ Saved ${recommendations.length} total recommendation(s) to database`
      );
    } catch (error: any) {
      logError("saveRecommendationsFromAgents - Database Insert", error);
      // Don't fail the entire process if recommendation saving fails
      log(
        `[GUARDIAN-GOV] ⚠ Failed to save recommendations, but agent run succeeded`
      );
    }
  } else {
    log(`[GUARDIAN-GOV] No recommendations to save`);
  }
}

// =====================================================================
// CLIENT PROCESSING
// =====================================================================

/**
 * Process daily agent (Proofline) for a single client
 * Returns output in memory without saving to DB
 */
async function processDailyAgent(
  account: any,
  oauth2Client: any,
  dates: ReturnType<typeof getDailyDates>
): Promise<{
  success: boolean;
  output?: any;
  payload?: any;
  rawData?: any;
  error?: string;
}> {
  const { id: googleAccountId, domain_name: domain } = account;

  log(`  [DAILY] Processing Proofline agent for ${domain}`);

  try {
    // Parse property IDs
    const propertyIds: GooglePropertyIds =
      typeof account.google_property_ids === "string"
        ? JSON.parse(account.google_property_ids)
        : account.google_property_ids;

    // Fetch data for day before yesterday (single day)
    log(
      `  [DAILY] Fetching data for ${dates.dayBeforeYesterday} (day before yesterday)`
    );
    const dayBeforeYesterdayData = await fetchAllServiceData(
      oauth2Client,
      googleAccountId,
      domain,
      propertyIds,
      dates.dayBeforeYesterday,
      dates.dayBeforeYesterday
    );

    // Fetch data for yesterday (single day)
    log(`  [DAILY] Fetching data for ${dates.yesterday} (yesterday)`);
    const yesterdayData = await fetchAllServiceData(
      oauth2Client,
      googleAccountId,
      domain,
      propertyIds,
      dates.yesterday,
      dates.yesterday
    );

    // Prepare raw data for potential DB storage
    const rawData = {
      google_account_id: googleAccountId,
      domain,
      date_start: dates.dayBeforeYesterday,
      date_end: dates.yesterday,
      run_type: "daily",
      ga4_data: {
        yesterday: yesterdayData.ga4Data,
        dayBeforeYesterday: dayBeforeYesterdayData.ga4Data,
      },
      gbp_data: {
        yesterday: yesterdayData.gbpData,
        dayBeforeYesterday: dayBeforeYesterdayData.gbpData,
      },
      gsc_data: {
        yesterday: yesterdayData.gscData,
        dayBeforeYesterday: dayBeforeYesterdayData.gscData,
      },
      created_at: new Date(),
      updated_at: new Date(),
    };

    // Build payload and call Proofline agent
    const payload = buildProoflinePayload({
      domain,
      googleAccountId,
      dates,
      dayBeforeYesterdayData,
      yesterdayData,
    });

    log(`  [DAILY] Calling Proofline agent webhook`);
    const agentOutput = await callAgentWebhook(
      PROOFLINE_WEBHOOK,
      payload,
      "Proofline"
    );

    // Log and validate output
    logAgentOutput("Proofline", agentOutput);
    const isValid = isValidAgentOutput(agentOutput, "Proofline");

    if (!isValid) {
      return {
        success: false,
        error: "Agent returned empty or invalid output",
      };
    }

    log(`  [DAILY] ✓ Proofline completed successfully`);
    return {
      success: true,
      output: agentOutput,
      payload,
      rawData,
    };
  } catch (error: any) {
    logError("processDailyAgent", error);
    return { success: false, error: error?.message || String(error) };
  }
}

/**
 * Process monthly agents (Summary + Referral Engine + Opportunity + CRO Optimizer) for a single client
 * Returns outputs in memory without saving to DB
 */
async function processMonthlyAgents(
  account: any,
  oauth2Client: any,
  monthRange: ReturnType<typeof getPreviousMonthRange>
): Promise<{
  success: boolean;
  summaryOutput?: any;
  referralEngineOutput?: any;
  opportunityOutput?: any;
  croOptimizerOutput?: any;
  summaryPayload?: any;
  referralEnginePayload?: any;
  opportunityPayload?: any;
  croOptimizerPayload?: any;
  rawData?: any;
  skipped?: boolean;
  error?: string;
}> {
  const { id: googleAccountId, domain_name: domain } = account;
  const { startDate, endDate } = monthRange;

  log(
    `  [MONTHLY] Processing Summary + Referral Engine + Opportunity + CRO Optimizer for ${domain} (${startDate} to ${endDate})`
  );

  try {
    // Parse property IDs
    const propertyIds: GooglePropertyIds =
      typeof account.google_property_ids === "string"
        ? JSON.parse(account.google_property_ids)
        : account.google_property_ids;

    // Fetch month data (GA4, GBP, GSC)
    log(`  [MONTHLY] Fetching GA4/GBP/GSC data for ${startDate} to ${endDate}`);
    const monthData = await fetchAllServiceData(
      oauth2Client,
      googleAccountId,
      domain,
      propertyIds,
      startDate,
      endDate
    );

    // Fetch aggregated PMS data across all approved submissions
    log(`  [MONTHLY] Fetching aggregated PMS data for ${domain}`);
    let pmsData = null;
    try {
      const aggregated = await aggregatePmsData(domain);

      if (aggregated.months.length > 0) {
        // Use aggregated data structure for Summary agent
        pmsData = {
          monthly_rollup: aggregated.months.map((month) => ({
            month: month.month,
            self_referrals: month.selfReferrals,
            doctor_referrals: month.doctorReferrals,
            total_referrals: month.totalReferrals,
            production_total: month.productionTotal,
            sources: month.sources,
          })),
          sources_summary: aggregated.sources,
          totals: aggregated.totals,
          patient_records: aggregated.patientRecords,
        };
        log(
          `  [MONTHLY] ✓ Aggregated PMS data found (${aggregated.months.length} months, ${aggregated.sources.length} sources, ${aggregated.patientRecords.length} patient records)`
        );
      } else {
        log(`  [MONTHLY] ⚠ No approved PMS data found`);
      }
    } catch (pmsError: any) {
      log(
        `  [MONTHLY] ⚠ Error fetching aggregated PMS data: ${pmsError.message}`
      );
    }

    // Prepare raw data for potential DB storage
    const rawData = {
      google_account_id: googleAccountId,
      domain,
      date_start: startDate,
      date_end: endDate,
      run_type: "monthly",
      ga4_data: monthData.ga4Data,
      gbp_data: monthData.gbpData,
      gsc_data: monthData.gscData,
      created_at: new Date(),
      updated_at: new Date(),
    };

    // === STEP 1: Run Summary Agent ===
    log(`  [MONTHLY] Calling Summary agent webhook`);
    const summaryPayload = buildSummaryPayload({
      domain,
      googleAccountId,
      startDate,
      endDate,
      monthData,
      pmsData,
      clarityData: monthData.clarityData,
    });

    const summaryOutput = await callAgentWebhook(
      SUMMARY_WEBHOOK,
      summaryPayload,
      "Summary"
    );

    // Log and validate Summary output
    logAgentOutput("Summary", summaryOutput);
    const summaryValid = isValidAgentOutput(summaryOutput, "Summary");

    if (!summaryValid) {
      return {
        success: false,
        error: "Summary agent returned empty or invalid output",
      };
    }

    log(`  [MONTHLY] ✓ Summary completed successfully`);

    // === STEP 2: Run Referral Analysis Engine (uses same raw data as Summary) ===
    log(`  [MONTHLY] Calling Referral Engine agent webhook`);
    const referralEnginePayload = buildReferralEnginePayload({
      domain,
      googleAccountId,
      startDate,
      endDate,
      monthData,
      pmsData,
      clarityData,
    });

    const referralEngineOutput = await callAgentWebhook(
      REFERRAL_ENGINE_WEBHOOK,
      referralEnginePayload,
      "Referral Engine"
    );

    // Log and validate Referral Engine output
    logAgentOutput("Referral Engine", referralEngineOutput);
    const referralEngineValid = isValidAgentOutput(
      referralEngineOutput,
      "Referral Engine"
    );

    if (!referralEngineValid) {
      return {
        success: false,
        error: "Referral Engine agent returned empty or invalid output",
      };
    }

    log(`  [MONTHLY] ✓ Referral Engine completed successfully`);

    // === STEP 3: Run Opportunity Agent (only uses Summary output) ===
    log(`  [MONTHLY] Calling Opportunity agent webhook`);
    const opportunityPayload = buildOpportunityPayload({
      domain,
      googleAccountId,
      startDate,
      endDate,
      summaryOutput,
    });

    const opportunityOutput = await callAgentWebhook(
      OPPORTUNITY_WEBHOOK,
      opportunityPayload,
      "Opportunity"
    );

    // Log and validate Opportunity output
    logAgentOutput("Opportunity", opportunityOutput);
    const opportunityValid = isValidAgentOutput(
      opportunityOutput,
      "Opportunity"
    );

    if (!opportunityValid) {
      return {
        success: false,
        error: "Opportunity agent returned empty or invalid output",
      };
    }

    log(`  [MONTHLY] ✓ Opportunity completed successfully`);

    // === STEP 4: Run CRO Optimizer Agent with retry logic ===
    log(`  [MONTHLY] Calling CRO Optimizer agent webhook (max 3 attempts)`);

    let croOptimizerOutput: any = null;
    let croOptimizerPayload: any = null;
    let croAttempt = 0;
    const MAX_CRO_ATTEMPTS = 3;

    for (croAttempt = 1; croAttempt <= MAX_CRO_ATTEMPTS; croAttempt++) {
      if (croAttempt > 1) {
        log(
          `  [MONTHLY] 🔄 CRO Optimizer retry attempt ${croAttempt}/${MAX_CRO_ATTEMPTS}`
        );
        log(`  [MONTHLY] Waiting 30 seconds before retry...`);
        await delay(30000);
      }

      try {
        croOptimizerPayload = buildCroOptimizerPayload({
          domain,
          googleAccountId,
          startDate,
          endDate,
          summaryOutput,
        });

        croOptimizerOutput = await callAgentWebhook(
          CRO_OPTIMIZER_WEBHOOK,
          croOptimizerPayload,
          "CRO Optimizer"
        );

        // Log and validate CRO Optimizer output
        logAgentOutput("CRO Optimizer", croOptimizerOutput);
        const croValid = isValidAgentOutput(
          croOptimizerOutput,
          "CRO Optimizer"
        );

        if (!croValid) {
          throw new Error(
            "CRO Optimizer agent returned empty or invalid output"
          );
        }

        log(
          `  [MONTHLY] ✓ CRO Optimizer completed successfully on attempt ${croAttempt}`
        );
        break; // Success, exit retry loop
      } catch (croError: any) {
        log(
          `  [MONTHLY] ⚠ CRO Optimizer attempt ${croAttempt} failed: ${croError.message}`
        );

        if (croAttempt === MAX_CRO_ATTEMPTS) {
          // All retries exhausted, fail the entire monthly run
          return {
            success: false,
            error: `CRO Optimizer failed after ${MAX_CRO_ATTEMPTS} attempts: ${croError.message}`,
          };
        }
      }
    }

    // === STEP 5: Create tasks from action items ===
    try {
      const actionItems = opportunityOutput[0]?.opportunities || [];

      console.log(opportunityOutput[0].opportunities);
      if (Array.isArray(actionItems) && actionItems.length > 0) {
        log(
          `  [MONTHLY] Creating ${actionItems.length} task(s) from action items`
        );

        for (const item of actionItems) {
          // Use type from action item, default to USER if not ALLORO (Opportunity agent outputs USER tasks)
          const type =
            item.type?.toUpperCase() === "ALLORO" ? "ALLORO" : "USER";

          const taskData = {
            domain_name: domain,
            google_account_id: googleAccountId,
            title: item.title || item.name || "Untitled Task",
            description:
              item.explanation || item.description || item.details || null,
            category: type,
            agent_type: "OPPORTUNITY",
            status: "pending",
            is_approved: false,
            created_by_admin: true,
            due_date:
              item.due_date || item.dueDate
                ? new Date(item.due_date || item.dueDate)
                : null,
            metadata: JSON.stringify({
              agent_category: item.category || null,
              urgency: item.urgency || null,
              ...(item.metadata || {}),
            }),
            created_at: new Date(),
            updated_at: new Date(),
          };

          try {
            const [result] = await db("tasks").insert(taskData).returning("id");
            const taskId = result.id;
            log(
              `    ✓ Created ${type} task (ID: ${taskId}): ${taskData.title}`
            );
          } catch (taskError: any) {
            log(
              `    ⚠ Failed to create task "${taskData.title}": ${taskError.message}`
            );
          }
        }

        log(`  [MONTHLY] ✓ Task creation completed`);
      } else {
        log(`  [MONTHLY] No action items found in opportunity output`);
      }
    } catch (taskCreationError: any) {
      // Don't fail the entire operation if task creation fails
      log(
        `  [MONTHLY] ⚠ Error creating Opportunity tasks: ${taskCreationError.message}`
      );
    }

    // === STEP 6: Create tasks from CRO Optimizer action items ===
    try {
      const croActionItems = croOptimizerOutput[0]?.opportunities || [];

      if (Array.isArray(croActionItems) && croActionItems.length > 0) {
        log(
          `  [MONTHLY] Creating ${croActionItems.length} CRO Optimizer task(s) from action items`
        );

        for (const item of croActionItems) {
          // Use type from action item, default to ALLORO if not USER (CRO Optimizer outputs ALLORO tasks)
          const type = item.type?.toUpperCase() === "USER" ? "USER" : "ALLORO";

          const taskData = {
            domain_name: domain,
            google_account_id: googleAccountId,
            title: item.title || item.name || "Untitled Task",
            description:
              item.explanation || item.description || item.details || null,
            category: type,
            agent_type: "CRO_OPTIMIZER",
            status: "pending",
            is_approved: false,
            created_by_admin: true,
            due_date:
              item.due_date || item.dueDate
                ? new Date(item.due_date || item.dueDate)
                : null,
            metadata: JSON.stringify({
              agent_category: item.category || null,
              urgency: item.urgency || null,
              ...(item.metadata || {}),
            }),
            created_at: new Date(),
            updated_at: new Date(),
          };

          try {
            const [result] = await db("tasks").insert(taskData).returning("id");
            const taskId = result.id;
            log(
              `    ✓ Created ${type} task (ID: ${taskId}): ${taskData.title}`
            );
          } catch (taskError: any) {
            log(
              `    ⚠ Failed to create task "${taskData.title}": ${taskError.message}`
            );
          }
        }

        log(`  [MONTHLY] ✓ CRO Optimizer task creation completed`);
      } else {
        log(`  [MONTHLY] No CRO Optimizer action items found in output`);
      }
    } catch (taskCreationError: any) {
      // Don't fail the entire operation if task creation fails
      log(
        `  [MONTHLY] ⚠ Error creating CRO Optimizer tasks: ${taskCreationError.message}`
      );
    }

    // === STEP 7: Create tasks from Referral Engine action items ===
    try {
      // Referral Engine output may be wrapped in array, handle both cases
      const referralOutput = Array.isArray(referralEngineOutput)
        ? referralEngineOutput[0]
        : referralEngineOutput;

      // ALLORO tasks from alloro_automation_opportunities (internal/agency tasks)
      const alloroItems = referralOutput?.alloro_automation_opportunities || [];

      // USER tasks from practice_action_plan (client tasks)
      const userItems = referralOutput?.practice_action_plan || [];

      const totalReferralTasks = alloroItems.length + userItems.length;

      if (totalReferralTasks > 0) {
        log(
          `  [MONTHLY] Creating ${totalReferralTasks} Referral Engine task(s) (${alloroItems.length} ALLORO, ${userItems.length} USER)`
        );

        // Create ALLORO tasks from alloro_automation_opportunities
        for (const item of alloroItems) {
          // Handle both string items and object items
          const isStringItem = typeof item === "string";
          const fullText = isStringItem
            ? item
            : item.description ||
              item.rationale ||
              item.explanation ||
              item.details ||
              item.title ||
              "";
          const titleText = isStringItem
            ? item.length > 80
              ? item.substring(0, 80) + "..."
              : item
            : item.title ||
              item.opportunity ||
              item.name ||
              (fullText.length > 80
                ? fullText.substring(0, 80) + "..."
                : fullText) ||
              "Untitled Referral Engine Task";

          const taskData = {
            domain_name: domain,
            google_account_id: googleAccountId,
            title: titleText,
            description: fullText || null,
            category: "ALLORO",
            agent_type: "REFERRAL_ENGINE_ANALYSIS",
            status: "pending",
            is_approved: false,
            created_by_admin: true,
            due_date: isStringItem
              ? null
              : item.due_date || item.dueDate
              ? new Date(item.due_date || item.dueDate)
              : null,
            metadata: JSON.stringify({
              source_field: "alloro_automation_opportunities",
              priority: isStringItem ? null : item.priority || null,
              impact: isStringItem ? null : item.impact || null,
              effort: isStringItem ? null : item.effort || null,
              category: isStringItem ? null : item.category || null,
              ...(isStringItem ? {} : item.metadata || {}),
            }),
            created_at: new Date(),
            updated_at: new Date(),
          };

          try {
            const [result] = await db("tasks").insert(taskData).returning("id");
            const taskId = result.id;
            log(`    ✓ Created ALLORO task (ID: ${taskId}): ${taskData.title}`);
          } catch (taskError: any) {
            log(
              `    ⚠ Failed to create ALLORO task "${taskData.title}": ${taskError.message}`
            );
          }
        }

        // Create USER tasks from practice_action_plan
        for (const item of userItems) {
          // Handle both string items and object items
          const isStringItem = typeof item === "string";
          const fullText = isStringItem
            ? item
            : item.description ||
              item.rationale ||
              item.explanation ||
              item.details ||
              item.title ||
              "";
          const titleText = isStringItem
            ? item.length > 80
              ? item.substring(0, 80) + "..."
              : item
            : item.title ||
              item.action ||
              item.name ||
              (fullText.length > 80
                ? fullText.substring(0, 80) + "..."
                : fullText) ||
              "Untitled Practice Action";

          const taskData = {
            domain_name: domain,
            google_account_id: googleAccountId,
            title: titleText,
            description: fullText || null,
            category: "USER",
            agent_type: "REFERRAL_ENGINE_ANALYSIS",
            status: "pending",
            is_approved: false,
            created_by_admin: true,
            due_date: isStringItem
              ? null
              : item.due_date || item.dueDate
              ? new Date(item.due_date || item.dueDate)
              : null,
            metadata: JSON.stringify({
              source_field: "practice_action_plan",
              priority: isStringItem ? null : item.priority || null,
              impact: isStringItem ? null : item.impact || null,
              effort: isStringItem ? null : item.effort || null,
              category: isStringItem ? null : item.category || null,
              owner: isStringItem ? null : item.owner || null,
              ...(isStringItem ? {} : item.metadata || {}),
            }),
            created_at: new Date(),
            updated_at: new Date(),
          };

          try {
            const [result] = await db("tasks").insert(taskData).returning("id");
            const taskId = result.id;
            log(`    ✓ Created USER task (ID: ${taskId}): ${taskData.title}`);
          } catch (taskError: any) {
            log(
              `    ⚠ Failed to create USER task "${taskData.title}": ${taskError.message}`
            );
          }
        }

        log(`  [MONTHLY] ✓ Referral Engine task creation completed`);
      } else {
        log(`  [MONTHLY] No Referral Engine action items found in output`);
      }
    } catch (taskCreationError: any) {
      // Don't fail the entire operation if task creation fails
      log(
        `  [MONTHLY] ⚠ Error creating Referral Engine tasks: ${taskCreationError.message}`
      );
    }

    return {
      success: true,
      summaryOutput,
      referralEngineOutput,
      opportunityOutput,
      croOptimizerOutput,
      summaryPayload,
      referralEnginePayload,
      opportunityPayload,
      croOptimizerPayload,
      rawData,
    };
  } catch (error: any) {
    logError("processMonthlyAgents", error);
    return { success: false, error: error?.message || String(error) };
  }
}

// =====================================================================
// GBP COPY OPTIMIZER FUNCTIONS
// =====================================================================

/**
 * Build payload for Copy Companion agent from GBP data
 */
function buildCopyCompanionPayload(
  gbpData: any,
  domain: string,
  googleAccountId: number
): any {
  log(`  [GBP-OPTIMIZER] Building Copy Companion payload for ${domain}`);

  const textSources = [];

  for (const location of gbpData.locations) {
    const locationName = location.meta?.businessName || "Unknown Location";
    log(`    → Processing location: ${locationName}`);

    const profile = location.gbp_profile;
    const posts = location.gbp_posts;

    // Add profile fields
    if (profile?.description) {
      textSources.push({
        field: "business_description",
        text: profile.description,
      });
      log(
        `      ✓ Added business_description (${profile.description.length} chars)`
      );
    }

    if (profile?.profile?.description) {
      textSources.push({
        field: "bio",
        text: profile.profile.description,
      });
      log(`      ✓ Added bio (${profile.profile.description.length} chars)`);
    }

    if (profile?.callToAction?.actionType) {
      const ctaText = `${profile.callToAction.actionType}: ${
        profile.callToAction.url || ""
      }`;
      textSources.push({
        field: "cta",
        text: ctaText,
      });
      log(`      ✓ Added CTA: ${profile.callToAction.actionType}`);
    }

    // Add posts
    log(`      → Processing ${posts.length} posts`);
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
    log(`      ✓ Added ${posts.length} posts`);
  }

  log(
    `  [GBP-OPTIMIZER] ✓ Built payload with ${textSources.length} text sources`
  );

  return {
    additional_data: {
      text_sources: textSources,
    },
    domain: domain,
    googleAccountId: googleAccountId,
  };
}

/**
 * Process GBP Optimizer agent for a single client
 */
async function processGBPOptimizerAgent(
  account: any,
  oauth2Client: any,
  monthRange: { startDate: string; endDate: string }
): Promise<{
  success: boolean;
  output?: any;
  payload?: any;
  rawData?: any;
  error?: string;
}> {
  const { id: googleAccountId, domain_name: domain } = account;

  log(`\n  [GBP-OPTIMIZER] Starting processing for ${domain}`);
  log(
    `  [GBP-OPTIMIZER] Date range: ${monthRange.startDate} to ${monthRange.endDate}`
  );

  try {
    // Import getGBPTextSources
    const { getGBPTextSources } = require("./gbp");

    log(`  [GBP-OPTIMIZER] Fetching GBP text sources...`);
    const gbpData = await getGBPTextSources(
      oauth2Client,
      googleAccountId,
      monthRange.startDate,
      monthRange.endDate
    );

    if (!gbpData.locations || gbpData.locations.length === 0) {
      log(`  [GBP-OPTIMIZER] ⚠ No GBP locations found`);
      return {
        success: false,
        error: "No GBP locations found for this account",
      };
    }

    log(`  [GBP-OPTIMIZER] ✓ Found ${gbpData.locations.length} location(s)`);

    // Log location details
    gbpData.locations.forEach((loc: any, idx: number) => {
      log(
        `    [${idx + 1}] ${loc.meta?.businessName || "Unknown"}: ${
          loc.gbp_posts.length
        } posts`
      );
    });

    // Transform to Copy Companion format
    const payload = buildCopyCompanionPayload(gbpData, domain, googleAccountId);

    log(`  [GBP-OPTIMIZER] Calling Copy Companion agent...`);
    log(`  [GBP-OPTIMIZER] Webhook: ${COPY_COMPANION_WEBHOOK}`);
    log(
      `  [GBP-OPTIMIZER] Sending ${payload.additional_data.text_sources.length} text sources`
    );

    const agentOutput = await callAgentWebhook(
      COPY_COMPANION_WEBHOOK,
      payload,
      "Copy Companion"
    );

    // Log and validate output
    logAgentOutput("Copy Companion", agentOutput);
    const isValid = isValidAgentOutput(agentOutput, "Copy Companion");

    if (!isValid) {
      log(`  [GBP-OPTIMIZER] ✗ Agent returned invalid output`);
      return {
        success: false,
        error: "Agent returned empty or invalid output",
      };
    }

    // Count recommendations
    const recommendations = agentOutput[0] || {};
    const recCount = Object.keys(recommendations).length;
    log(`  [GBP-OPTIMIZER] ✓ Received ${recCount} recommendation(s)`);

    log(`  [GBP-OPTIMIZER] ✓ Copy Companion completed successfully`);

    return {
      success: true,
      output: agentOutput,
      payload,
      rawData: gbpData,
    };
  } catch (error: any) {
    logError("processGBPOptimizerAgent", error);
    log(`  [GBP-OPTIMIZER] ✗ Failed: ${error?.message || String(error)}`);
    return { success: false, error: error?.message || String(error) };
  }
}

/**
 * Create tasks from Copy Companion recommendations
 */
async function createTasksFromCopyRecommendations(
  agentOutput: any,
  googleAccountId: number,
  domain: string
): Promise<void> {
  log(`\n  [GBP-OPTIMIZER] Creating tasks from recommendations...`);

  try {
    // Copy Companion returns an array directly, not nested in [0]
    const recommendations = Array.isArray(agentOutput) ? agentOutput : [];

    if (recommendations.length === 0) {
      log(`  [GBP-OPTIMIZER] No recommendations found in output`);
      return;
    }

    log(
      `  [GBP-OPTIMIZER] Found ${recommendations.length} total recommendation(s)`
    );

    let createdCount = 0;
    let skippedCount = 0;
    let taskIndex = 0;

    for (const item of recommendations) {
      const verdict = item.verdict || "UNKNOWN";
      const lineage = item.lineage || "unknown";
      const confidence = item.confidence || 0;

      log(
        `    [${lineage}] Verdict: ${verdict}, Confidence: ${(
          confidence * 100
        ).toFixed(0)}%`
      );

      // Only create tasks for recommendations that need action
      if (!["CONFIRMED", "PENDING_REVIEW"].includes(verdict)) {
        log(`      → Skipping (verdict: ${verdict})`);
        skippedCount++;
        continue;
      }

      taskIndex++;

      const taskData = {
        domain_name: domain,
        google_account_id: googleAccountId,
        title: `Update GBP Post ${taskIndex}`,
        description: `
**Current Text:**
${item.source_text || "N/A"}

**Recommended Text:**
${item.recommendation || "N/A"}

**Confidence:** ${(confidence * 100).toFixed(0)}%

**Notes:**
${item.notes || "No additional notes"}

${
  item.alerts && item.alerts.length > 0
    ? `**Alerts:**\n${item.alerts.join("\n")}`
    : ""
}
        `.trim(),
        category: "USER",
        agent_type: "GBP_OPTIMIZATION",
        status: "pending",
        is_approved: false,
        created_by_admin: true,
        due_date: null,
        metadata: JSON.stringify({
          agent_slug: item.agent_slug,
          agent_name: item.agent_name,
          lineage: lineage,
          confidence: confidence,
          verdict: verdict,
          citations: item.citations || [],
          freshness: item.freshness,
          source_text: item.source_text,
          recommendation: item.recommendation,
        }),
        created_at: new Date(),
        updated_at: new Date(),
      };

      try {
        const [result] = await db("tasks").insert(taskData).returning("id");
        const taskId = result.id;
        log(`      ✓ Created task (ID: ${taskId}): ${taskData.title}`);
        createdCount++;
      } catch (taskError: any) {
        log(`      ✗ Failed to create task: ${taskError.message}`);
      }
    }

    log(`  [GBP-OPTIMIZER] ✓ Task creation completed`);
    log(`    - Created: ${createdCount}`);
    log(`    - Skipped: ${skippedCount}`);
    log(`    - Total: ${recommendations.length}`);
  } catch (error: any) {
    logError("createTasksFromCopyRecommendations", error);
    log(`  [GBP-OPTIMIZER] ⚠ Error creating tasks: ${error.message}`);
  }
}

/**
 * Process a single client account with retry mechanism
 * Retries up to 3 times if agent outputs are invalid
 * Only saves to database after ALL validations pass
 */
async function processClient(
  account: any,
  referenceDate?: string
): Promise<{
  success: boolean;
  daily?: any;
  monthly?: any;
  error?: string;
  attempts?: number;
}> {
  const { id: googleAccountId, domain_name: domain } = account;
  const MAX_ATTEMPTS = 3;

  log(`\n[${"=".repeat(60)}]`);
  log(`[CLIENT] Processing: ${domain} (Account ID: ${googleAccountId})`);
  log(`[${"=".repeat(60)}]`);

  // Try up to MAX_ATTEMPTS times
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      log(
        `\n[CLIENT] 🔄 RETRY ATTEMPT ${attempt}/${MAX_ATTEMPTS} for ${domain}`
      );
      log(`[CLIENT] Waiting 30 seconds before retry...`);
      await delay(30000); // Wait 30 seconds between retries
    }

    try {
      // Get valid OAuth2 client (handles refresh automatically if needed)
      log(`[CLIENT] Getting valid OAuth2 client`);
      const oauth2Client = await getValidOAuth2Client(googleAccountId);

      // Get date ranges
      const dailyDates = getDailyDates(referenceDate);
      const monthRange = getPreviousMonthRange(referenceDate);

      // === STEP 1: Always run daily agent (collect in memory) ===
      log(`[CLIENT] Running daily agent (attempt ${attempt}/${MAX_ATTEMPTS})`);
      const dailyResult = await processDailyAgent(
        account,
        oauth2Client,
        dailyDates
      );

      if (!dailyResult.success) {
        log(`[CLIENT] ⚠ Daily agent failed: ${dailyResult.error}`);
        if (attempt < MAX_ATTEMPTS) {
          continue; // Retry
        }
        throw new Error(
          `Daily agent failed after ${MAX_ATTEMPTS} attempts: ${dailyResult.error}`
        );
      }

      // === STEP 2: Conditionally run monthly agents (collect in memory) ===
      let monthlyResult: any = { skipped: true, reason: "conditions_not_met" };

      if (shouldRunMonthlyAgents(referenceDate)) {
        // Check for duplicate before running
        const existingSummary = await db("agent_results")
          .where({
            google_account_id: googleAccountId,
            domain,
            agent_type: "summary",
            date_start: monthRange.startDate,
            date_end: monthRange.endDate,
          })
          .whereIn("status", ["success", "pending"])
          .first();

        if (existingSummary) {
          log(`[CLIENT] Monthly agents already completed - skipping`);
          monthlyResult = { skipped: true, reason: "already_exists" };
        } else {
          log(
            `[CLIENT] Running monthly agents (attempt ${attempt}/${MAX_ATTEMPTS})`
          );
          monthlyResult = await processMonthlyAgents(
            account,
            oauth2Client,
            monthRange
          );

          if (!monthlyResult.success && !monthlyResult.skipped) {
            log(`[CLIENT] ⚠ Monthly agents failed: ${monthlyResult.error}`);
            if (attempt < MAX_ATTEMPTS) {
              continue; // Retry
            }
            throw new Error(
              `Monthly agents failed after ${MAX_ATTEMPTS} attempts: ${monthlyResult.error}`
            );
          }
        }
      } else {
        log(`[CLIENT] Monthly conditions not met - skipping monthly agents`);
      }

      // === STEP 3: ALL VALIDATIONS PASSED - Save to database ===
      log(`[CLIENT] ✓ All agent outputs validated successfully`);
      log(`[CLIENT] Persisting results to database...`);

      // Check for duplicate daily result before inserting
      const existingDaily = await db("agent_results")
        .where({
          google_account_id: googleAccountId,
          domain,
          agent_type: "proofline",
          date_start: dailyDates.dayBeforeYesterday,
          date_end: dailyDates.yesterday,
        })
        .whereIn("status", ["success", "pending"])
        .first();

      if (!existingDaily) {
        // Save daily raw data
        await db("google_data_store").insert(dailyResult.rawData);

        // Save daily agent result
        const [dailyResultId] = await db("agent_results")
          .insert({
            google_account_id: googleAccountId,
            domain,
            agent_type: "proofline",
            date_start: dailyDates.dayBeforeYesterday,
            date_end: dailyDates.yesterday,
            agent_input: JSON.stringify(dailyResult.payload),
            agent_output: JSON.stringify(dailyResult.output),
            status: "success",
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning("id");

        log(`[CLIENT] ✓ Daily result saved (ID: ${dailyResultId})`);
      } else {
        log(`[CLIENT] ℹ Daily result already exists (ID: ${existingDaily.id})`);
      }

      // Save monthly results if they were run
      if (!monthlyResult.skipped && monthlyResult.success) {
        // Save monthly raw data
        await db("google_data_store").insert(monthlyResult.rawData);

        // Save Summary result
        const [summaryId] = await db("agent_results")
          .insert({
            google_account_id: googleAccountId,
            domain,
            agent_type: "summary",
            date_start: monthRange.startDate,
            date_end: monthRange.endDate,
            agent_input: JSON.stringify(monthlyResult.summaryPayload),
            agent_output: JSON.stringify(monthlyResult.summaryOutput),
            status: "success",
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning("id");

        log(`[CLIENT] ✓ Summary result saved (ID: ${summaryId})`);

        // Save Opportunity result
        const [opportunityId] = await db("agent_results")
          .insert({
            google_account_id: googleAccountId,
            domain,
            agent_type: "opportunity",
            date_start: monthRange.startDate,
            date_end: monthRange.endDate,
            agent_input: JSON.stringify(monthlyResult.opportunityPayload),
            agent_output: JSON.stringify(monthlyResult.opportunityOutput),
            status: "success",
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning("id");

        log(`[CLIENT] ✓ Opportunity result saved (ID: ${opportunityId})`);

        // Save Referral Engine result
        const [referralEngineId] = await db("agent_results")
          .insert({
            google_account_id: googleAccountId,
            domain,
            agent_type: "referral_engine",
            date_start: monthRange.startDate,
            date_end: monthRange.endDate,
            agent_input: JSON.stringify(monthlyResult.referralEnginePayload),
            agent_output: JSON.stringify(monthlyResult.referralEngineOutput),
            status: "success",
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning("id");

        log(
          `[CLIENT] ✓ Referral Engine result saved (ID: ${referralEngineId})`
        );

        // Save CRO Optimizer result
        const [croOptimizerId] = await db("agent_results")
          .insert({
            google_account_id: googleAccountId,
            domain,
            agent_type: "cro_optimizer",
            date_start: monthRange.startDate,
            date_end: monthRange.endDate,
            agent_input: JSON.stringify(monthlyResult.croOptimizerPayload),
            agent_output: JSON.stringify(monthlyResult.croOptimizerOutput),
            status: "success",
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning("id");

        log(`[CLIENT] ✓ CRO Optimizer result saved (ID: ${croOptimizerId})`);
      }

      log(
        `[CLIENT] ✓ ${domain} processing completed successfully on attempt ${attempt}`
      );

      return {
        success: true,
        daily: dailyResult,
        monthly: monthlyResult,
        attempts: attempt,
      };
    } catch (error: any) {
      logError(`processClient - ${domain} (attempt ${attempt})`, error);

      // If this was the last attempt, save error to database
      if (attempt === MAX_ATTEMPTS) {
        try {
          await db("agent_results").insert({
            google_account_id: googleAccountId,
            domain,
            agent_type: "proofline",
            date_start: getDailyDates(referenceDate).dayBeforeYesterday,
            date_end: getDailyDates(referenceDate).yesterday,
            agent_input: null,
            agent_output: null,
            status: "error",
            error_message: `Failed after ${MAX_ATTEMPTS} attempts: ${
              error?.message || String(error)
            }`,
            created_at: new Date(),
            updated_at: new Date(),
          });
        } catch (dbError) {
          logError("Save error result to DB", dbError);
        }

        return {
          success: false,
          error: `Failed after ${MAX_ATTEMPTS} attempts: ${
            error?.message || String(error)
          }`,
          attempts: MAX_ATTEMPTS,
        };
      }

      // Not the last attempt, will retry
      log(`[CLIENT] ⚠ Attempt ${attempt} failed, will retry...`);
    }
  }

  // Should never reach here, but just in case
  return {
    success: false,
    error: `Failed after ${MAX_ATTEMPTS} attempts`,
    attempts: MAX_ATTEMPTS,
  };
}

// =====================================================================
// MAIN ENDPOINTS
// =====================================================================

/**
 * POST /api/agents/proofline-run
 *
 * Daily proofline agent endpoint
 * - Runs only Proofline agent for all clients
 * - Should be triggered by daily cron job
 *
 * Body: { referenceDate?: "YYYY-MM-DD" } (optional, for testing)
 */
router.post("/proofline-run", async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { referenceDate } = req.body || {};

  log("\n" + "=".repeat(70));
  log("POST /api/agents/proofline-run - STARTING");
  log("=".repeat(70));
  if (referenceDate) log(`Reference Date: ${referenceDate}`);
  log(`Timestamp: ${new Date().toISOString()}`);

  try {
    // Fetch all onboarded Google accounts
    log("\n[SETUP] Fetching all onboarded Google accounts...");
    const accounts = await db("google_accounts")
      .where("onboarding_completed", true)
      .select("*");

    if (!accounts || accounts.length === 0) {
      log("[SETUP] No onboarded accounts found");
      return res.json({
        success: true,
        message: "No accounts to process",
        processed: 0,
        results: [],
      });
    }

    log(`[SETUP] Found ${accounts.length} account(s) to process`);

    // Process each client sequentially
    const results: any[] = [];

    for (const account of accounts) {
      const { id: googleAccountId, domain_name: domain } = account;

      log(`\n[${"=".repeat(60)}]`);
      log(`[CLIENT] Processing Proofline: ${domain} (ID: ${googleAccountId})`);
      log(`[${"=".repeat(60)}]`);

      try {
        // Get valid OAuth2 client
        log(`[CLIENT] Getting valid OAuth2 client`);
        const oauth2Client = await getValidOAuth2Client(googleAccountId);

        // Get date range
        const dailyDates = getDailyDates(referenceDate);

        // Run proofline agent
        log(`[CLIENT] Running Proofline agent`);
        const dailyResult = await processDailyAgent(
          account,
          oauth2Client,
          dailyDates
        );

        if (!dailyResult.success) {
          throw new Error(dailyResult.error || "Proofline agent failed");
        }

        // Save raw data
        await db("google_data_store").insert(dailyResult.rawData);

        // Save agent result
        const [result] = await db("agent_results")
          .insert({
            google_account_id: googleAccountId,
            domain,
            agent_type: "proofline",
            date_start: dailyDates.dayBeforeYesterday,
            date_end: dailyDates.yesterday,
            agent_input: JSON.stringify(dailyResult.payload),
            agent_output: JSON.stringify(dailyResult.output),
            status: "success",
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning("id");

        const resultId = result.id;
        log(`[CLIENT] ✓ Proofline result saved (ID: ${resultId})`);

        results.push({
          googleAccountId,
          domain,
          success: true,
        });

        log(`[CLIENT] ✓ ${domain} completed successfully`);
      } catch (error: any) {
        logError(`Proofline for ${domain}`, error);
        results.push({
          googleAccountId,
          domain,
          success: false,
          error: error?.message || String(error),
        });
      }
    }

    const duration = Date.now() - startTime;
    const successfulClients = results.filter((r) => r.success).length;

    log("\n" + "=".repeat(70));
    log(`[COMPLETE] ✓ Proofline run completed`);
    log(`  - Total clients: ${accounts.length}`);
    log(`  - Successful: ${successfulClients}`);
    log(`  - Failed: ${accounts.length - successfulClients}`);
    log(`  - Duration: ${duration}ms (${(duration / 1000).toFixed(1)}s)`);
    log("=".repeat(70) + "\n");

    return res.json({
      success: true,
      message: `Processed ${accounts.length} account(s)`,
      processed: accounts.length,
      successful: successfulClients,
      duration: `${duration}ms`,
      results,
    });
  } catch (error: any) {
    logError("proofline-run", error);
    const duration = Date.now() - startTime;
    log(`\n[FAILED] ❌ Proofline run failed after ${duration}ms`);
    log("=".repeat(70) + "\n");

    return res.status(500).json({
      success: false,
      error: "PROOFLINE_RUN_ERROR",
      message: error?.message || "Failed to run proofline agent",
      duration: `${duration}ms`,
    });
  }
});

/**
 * POST /api/agents/monthly-agents-run
 *
 * Monthly agents endpoint (Summary + Opportunity)
 * - Runs for a specific account when triggered by PMS client approval
 * - Includes PMS and Clarity data in Summary agent
 * - Creates tasks from Opportunity agent action items
 * - Updates automation_status_detail in pms_jobs for progress tracking
 *
 * Body: { googleAccountId: number, domain: string, force?: boolean, pmsJobId?: number }
 */
router.post("/monthly-agents-run", async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { googleAccountId, domain, force = false, pmsJobId } = req.body;

  log("\n" + "=".repeat(70));
  log("POST /api/agents/monthly-agents-run - STARTING");
  log("=".repeat(70));
  log(`Account ID: ${googleAccountId}`);
  log(`Domain: ${domain}`);
  log(`Force run: ${force}`);
  log(`PMS Job ID: ${pmsJobId || "N/A"}`);
  log(`Timestamp: ${new Date().toISOString()}`);

  // Helper to update PMS automation status if pmsJobId is provided
  const updatePmsStatus = async (
    subStep: MonthlyAgentKey,
    customMessage?: string,
    agentCompleted?: MonthlyAgentKey
  ) => {
    if (pmsJobId) {
      await updateAutomationStatus(pmsJobId, {
        step: "monthly_agents",
        stepStatus: "processing",
        subStep,
        customMessage,
        agentCompleted,
      });
    }
  };

  try {
    // Validate input
    if (!googleAccountId || !domain) {
      return res.status(400).json({
        success: false,
        error: "MISSING_PARAMETERS",
        message: "googleAccountId and domain are required",
      });
    }

    // Fetch account
    log(`\n[SETUP] Fetching account ${googleAccountId}...`);
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

    log(`[SETUP] Account found: ${account.domain_name}`);

    // Get month range
    const monthRange = getPreviousMonthRange();
    log(
      `[SETUP] Month range: ${monthRange.startDate} to ${monthRange.endDate}`
    );

    // Removed duplicate check - always run monthly agents when called
    log(`[SETUP] Proceeding with monthly agents run`);

    // Get valid OAuth2 client
    log(`[CLIENT] Getting valid OAuth2 client`);
    const oauth2Client = await getValidOAuth2Client(googleAccountId);

    // Update status: data fetching
    await updatePmsStatus(
      "data_fetch",
      "Fetching GA4, GBP, GSC, PMS, and Clarity data..."
    );

    // Run monthly agents
    log(`[CLIENT] Running monthly agents (Summary + Opportunity)`);
    const monthlyResult = await processMonthlyAgents(
      account,
      oauth2Client,
      monthRange
    );

    if (!monthlyResult.success) {
      // Update PMS status on failure
      if (pmsJobId) {
        await failAutomation(
          pmsJobId,
          "monthly_agents",
          monthlyResult.error || "Monthly agents failed"
        );
      }
      throw new Error(monthlyResult.error || "Monthly agents failed");
    }

    // Save results
    log(`[CLIENT] Saving results to database...`);

    // Update status: Summary agent completed, starting Referral Engine
    await updatePmsStatus(
      "summary_agent",
      "Summary Agent completed",
      "summary_agent"
    );

    // Save raw data
    await db("google_data_store").insert(monthlyResult.rawData);

    // Save Summary result
    const [summaryResult] = await db("agent_results")
      .insert({
        google_account_id: googleAccountId,
        domain,
        agent_type: "summary",
        date_start: monthRange.startDate,
        date_end: monthRange.endDate,
        agent_input: JSON.stringify(monthlyResult.summaryPayload),
        agent_output: JSON.stringify(monthlyResult.summaryOutput),
        status: "success",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("id");

    const summaryId = summaryResult.id;
    log(`[CLIENT] ✓ Summary result saved (ID: ${summaryId})`);

    // Update status: Referral Engine completed
    await updatePmsStatus(
      "referral_engine",
      "Referral Engine Agent completed",
      "referral_engine"
    );

    // Save Opportunity result
    const [opportunityResult] = await db("agent_results")
      .insert({
        google_account_id: googleAccountId,
        domain,
        agent_type: "opportunity",
        date_start: monthRange.startDate,
        date_end: monthRange.endDate,
        agent_input: JSON.stringify(monthlyResult.opportunityPayload),
        agent_output: JSON.stringify(monthlyResult.opportunityOutput),
        status: "success",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("id");

    const opportunityId = opportunityResult.id;
    log(`[CLIENT] ✓ Opportunity result saved (ID: ${opportunityId})`);

    // Update status: Opportunity agent completed
    await updatePmsStatus(
      "opportunity_agent",
      "Opportunity Agent completed",
      "opportunity_agent"
    );

    // Save Referral Engine result
    const [referralEngineResult] = await db("agent_results")
      .insert({
        google_account_id: googleAccountId,
        domain,
        agent_type: "referral_engine",
        date_start: monthRange.startDate,
        date_end: monthRange.endDate,
        agent_input: JSON.stringify(monthlyResult.referralEnginePayload),
        agent_output: JSON.stringify(monthlyResult.referralEngineOutput),
        status: "success",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("id");

    const referralEngineId = referralEngineResult.id;
    log(`[CLIENT] ✓ Referral Engine result saved (ID: ${referralEngineId})`);

    // Update status: CRO Optimizer completed
    await updatePmsStatus(
      "cro_optimizer",
      "CRO Optimizer Agent completed",
      "cro_optimizer"
    );

    // Save CRO Optimizer result
    const [croOptimizerResult] = await db("agent_results")
      .insert({
        google_account_id: googleAccountId,
        domain,
        agent_type: "cro_optimizer",
        date_start: monthRange.startDate,
        date_end: monthRange.endDate,
        agent_input: JSON.stringify(monthlyResult.croOptimizerPayload),
        agent_output: JSON.stringify(monthlyResult.croOptimizerOutput),
        status: "success",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("id");

    const croOptimizerId = croOptimizerResult.id;
    log(`[CLIENT] ✓ CRO Optimizer result saved (ID: ${croOptimizerId})`);

    // Update status: Task creation
    if (pmsJobId) {
      await updateAutomationStatus(pmsJobId, {
        step: "task_creation",
        stepStatus: "processing",
        customMessage: "Creating tasks from agent recommendations...",
      });
    }

    // Create notification for completed monthly agents (also sends user email)
    try {
      await createNotification(
        domain,
        "Monthly Insights Ready",
        "Your monthly summary and opportunities are now available for review",
        "agent",
        {
          summaryId,
          referralEngineId,
          opportunityId,
          croOptimizerId,
          dateRange: `${monthRange.startDate} to ${monthRange.endDate}`,
        }
      );
      log(`[CLIENT] ✓ Notification created for completed monthly agents`);
    } catch (notificationError: any) {
      log(
        `[CLIENT] ⚠ Failed to create notification: ${notificationError.message}`
      );
      // Don't fail the entire operation if notification creation fails
    }

    const duration = Date.now() - startTime;

    // Count tasks created from database for this domain created during this run
    const tasksCreated = {
      user: 0,
      alloro: 0,
      total: 0,
    };

    try {
      const recentTasks = await db("tasks")
        .where("domain_name", domain)
        .where("created_at", ">=", new Date(startTime))
        .select("category");

      tasksCreated.total = recentTasks.length;
      tasksCreated.user = recentTasks.filter(
        (t: any) => t.category === "USER"
      ).length;
      tasksCreated.alloro = recentTasks.filter(
        (t: any) => t.category === "ALLORO"
      ).length;
    } catch (e) {
      log(`[CLIENT] Could not count tasks: ${e}`);
    }

    // Send admin email notification about monthly agent completion (after tasksCreated is populated)
    try {
      await notifyAdminsMonthlyAgentComplete(
        domain,
        { summaryId, referralEngineId, opportunityId, croOptimizerId },
        tasksCreated
      );
      log(`[CLIENT] ✓ Admin email sent for monthly agents completion`);
    } catch (adminEmailError: any) {
      log(`[CLIENT] ⚠ Failed to send admin email: ${adminEmailError.message}`);
      // Don't fail the entire operation if admin email fails
    }

    // Complete the PMS automation status
    if (pmsJobId) {
      const automationSummary: AutomationSummary = {
        tasksCreated,
        agentResults: {
          summary: { success: true, resultId: summaryId },
          referral_engine: { success: true, resultId: referralEngineId },
          opportunity: { success: true, resultId: opportunityId },
          cro_optimizer: { success: true, resultId: croOptimizerId },
        },
        duration: `${(duration / 1000).toFixed(1)}s`,
      };

      await completeAutomation(pmsJobId, automationSummary);
      log(`[CLIENT] ✓ PMS automation status marked as complete`);
    }

    log("\n" + "=".repeat(70));
    log(`[COMPLETE] ✓ Monthly agents completed successfully`);
    log(`  - Summary ID: ${summaryId}`);
    log(`  - Referral Engine ID: ${referralEngineId}`);
    log(`  - Opportunity ID: ${opportunityId}`);
    log(`  - CRO Optimizer ID: ${croOptimizerId}`);
    log(
      `  - Tasks created: ${tasksCreated.total} (${tasksCreated.user} USER, ${tasksCreated.alloro} ALLORO)`
    );
    log(`  - Duration: ${duration}ms (${(duration / 1000).toFixed(1)}s)`);
    log("=".repeat(70) + "\n");

    return res.json({
      success: true,
      message: "Monthly agents completed successfully",
      summaryId,
      referralEngineId,
      opportunityId,
      croOptimizerId,
      duration: `${duration}ms`,
    });
  } catch (error: any) {
    logError("monthly-agents-run", error);
    const duration = Date.now() - startTime;
    log(`\n[FAILED] ❌ Monthly agents failed after ${duration}ms`);
    log("=".repeat(70) + "\n");

    // Mark PMS automation as failed
    if (pmsJobId) {
      await failAutomation(
        pmsJobId,
        "monthly_agents",
        error?.message || "Monthly agents failed"
      );
    }

    return res.status(500).json({
      success: false,
      error: "MONTHLY_AGENTS_ERROR",
      message: error?.message || "Failed to run monthly agents",
      duration: `${duration}ms`,
    });
  }
});

/**
 * POST /api/agents/monthly-agents-run-test
 *
 * Test endpoint for monthly agents
 * - Runs all monthly agents (Summary, Referral Engine, Opportunity, CRO Optimizer)
 * - Does NOT persist any data to database
 * - Does NOT send emails
 * - Returns all agent inputs/outputs and preview of tasks that would be created
 *
 * Body: { googleAccountId, domain, startDate?, endDate? }
 * Response: { agents: {...}, tasksToBeCreated: {...}, duration }
 */
router.post("/monthly-agents-run-test", async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { googleAccountId, domain } = req.body;

  log("\n" + "=".repeat(70));
  log("POST /api/agents/monthly-agents-run-test - STARTING");
  log("=".repeat(70));
  log(`[TEST MODE] Account ID: ${googleAccountId}`);
  log(`[TEST MODE] Domain: ${domain}`);
  log(`[TEST MODE] Timestamp: ${new Date().toISOString()}`);

  try {
    // Validate input
    if (!googleAccountId || !domain) {
      return res.status(400).json({
        success: false,
        error: "MISSING_PARAMETERS",
        message: "googleAccountId and domain are required",
      });
    }

    // Fetch account
    log(`\n[TEST-SETUP] Fetching account ${googleAccountId}...`);
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

    // Get OAuth2 client
    log(`[TEST-SETUP] Setting up OAuth2 client...`);
    let oauth2Client;
    try {
      oauth2Client = await getValidOAuth2Client(googleAccountId);
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: "OAUTH_ERROR",
        message: error.message,
      });
    }

    // Run agents via processMonthlyAgents
    log(`[TEST-AGENTS] Running all monthly agents...`);
    const monthlyResult = await processMonthlyAgents(
      oauth2Client,
      googleAccountId,
      domain,
      account,
      req.body.startDate,
      req.body.endDate
    );

    if (!monthlyResult.success) {
      return res.status(500).json({
        success: false,
        error: "AGENTS_ERROR",
        message: monthlyResult.error || "Failed to run agents",
      });
    }

    // Simulate task creation without persisting
    log(`[TEST-TASKS] Simulating task creation...`);
    const tasksToBeCreated = simulateTaskCreation({
      opportunityOutput: monthlyResult.opportunityOutput,
      croOptimizerOutput: monthlyResult.croOptimizerOutput,
      referralEngineOutput: monthlyResult.referralEngineOutput,
    });

    const duration = Date.now() - startTime;

    log("\n" + "=".repeat(70));
    log(`[TEST-COMPLETE] ✓ Test run completed successfully`);
    log(
      `  - Opportunity tasks: ${tasksToBeCreated.from_opportunity.length}`
    );
    log(`  - CRO Optimizer tasks: ${tasksToBeCreated.from_cro_optimizer.length}`);
    log(
      `  - Referral Engine tasks: ${tasksToBeCreated.from_referral_engine.alloro.length} ALLORO, ${tasksToBeCreated.from_referral_engine.user.length} USER`
    );
    log(`  - Duration: ${duration}ms (${(duration / 1000).toFixed(1)}s)`);
    log("=".repeat(70) + "\n");

    return res.json({
      success: true,
      duration: `${duration}ms`,
      agents: {
        summary: {
          input: monthlyResult.summaryPayload,
          output: monthlyResult.summaryOutput,
        },
        opportunity: {
          input: monthlyResult.opportunityPayload,
          output: monthlyResult.opportunityOutput,
        },
        referral_engine: {
          input: monthlyResult.referralEnginePayload,
          output: monthlyResult.referralEngineOutput,
        },
        cro_optimizer: {
          input: monthlyResult.croOptimizerPayload,
          output: monthlyResult.croOptimizerOutput,
        },
      },
      tasksToBeCreated,
    });
  } catch (error: any) {
    logError("monthly-agents-run-test", error);
    const duration = Date.now() - startTime;
    log(`\n[TEST-FAILED] ❌ Test run failed after ${duration}ms`);
    log("=".repeat(70) + "\n");

    return res.status(500).json({
      success: false,
      error: "TEST_RUN_ERROR",
      message: error?.message || "Test run failed",
      duration: `${duration}ms`,
    });
  }
});

/**
 * Helper function to simulate task creation without persisting to database
 */
function simulateTaskCreation(agentOutputs: {
  opportunityOutput: any;
  croOptimizerOutput: any;
  referralEngineOutput: any;
}): {
  from_opportunity: any[];
  from_cro_optimizer: any[];
  from_referral_engine: { alloro: any[]; user: any[] };
  summary: { total_tasks: number; user_tasks: number; alloro_tasks: number };
} {
  const result = {
    from_opportunity: [] as any[],
    from_cro_optimizer: [] as any[],
    from_referral_engine: { alloro: [] as any[], user: [] as any[] },
    summary: { total_tasks: 0, user_tasks: 0, alloro_tasks: 0 },
  };

  try {
    // Simulate Opportunity tasks
    const opportunityItems = agentOutputs.opportunityOutput?.[0]?.opportunities || [];
    if (Array.isArray(opportunityItems)) {
      for (const item of opportunityItems) {
        const type =
          item.type?.toUpperCase() === "ALLORO" ? "ALLORO" : "USER";
        result.from_opportunity.push({
          title: item.title || item.name || "Untitled Task",
          description:
            item.explanation || item.description || item.details || null,
          category: type,
          agent_type: "OPPORTUNITY",
          urgency: item.urgency || null,
          due_date: item.due_date || item.dueDate || null,
          metadata: item.metadata || {},
        });
        result.summary[type === "USER" ? "user_tasks" : "alloro_tasks"]++;
      }
    }
  } catch (e) {
    log(`[TEST-TASKS] ⚠ Error simulating Opportunity tasks: ${e}`);
  }

  try {
    // Simulate CRO Optimizer tasks
    const croItems = agentOutputs.croOptimizerOutput?.[0]?.opportunities || [];
    if (Array.isArray(croItems)) {
      for (const item of croItems) {
        const type = item.type?.toUpperCase() === "USER" ? "USER" : "ALLORO";
        result.from_cro_optimizer.push({
          title: item.title || item.name || "Untitled Task",
          description:
            item.explanation || item.description || item.details || null,
          category: type,
          agent_type: "CRO_OPTIMIZER",
          urgency: item.urgency || null,
          due_date: item.due_date || item.dueDate || null,
          metadata: item.metadata || {},
        });
        result.summary[type === "USER" ? "user_tasks" : "alloro_tasks"]++;
      }
    }
  } catch (e) {
    log(`[TEST-TASKS] ⚠ Error simulating CRO Optimizer tasks: ${e}`);
  }

  try {
    // Simulate Referral Engine tasks
    const referralOutput = Array.isArray(agentOutputs.referralEngineOutput)
      ? agentOutputs.referralEngineOutput[0]
      : agentOutputs.referralEngineOutput;

    const alloroItems = referralOutput?.alloro_automation_opportunities || [];
    const userItems = referralOutput?.practice_action_plan || [];

    // Process ALLORO tasks
    for (const item of alloroItems) {
      const isStringItem = typeof item === "string";
      const fullText = isStringItem ? item : JSON.stringify(item);
      const title = isStringItem ? item.substring(0, 100) : item.opportunity || item.title || "Opportunity";

      result.from_referral_engine.alloro.push({
        title,
        description: isStringItem ? null : item.description || item.explanation || null,
        category: "ALLORO",
        agent_type: "REFERRAL_ENGINE_ANALYSIS",
        full_text: fullText,
      });
      result.summary.alloro_tasks++;
    }

    // Process USER tasks
    for (const item of userItems) {
      const isStringItem = typeof item === "string";
      const fullText = isStringItem ? item : JSON.stringify(item);
      const title = isStringItem ? item.substring(0, 100) : item.action || item.title || "Action Item";

      result.from_referral_engine.user.push({
        title,
        description: isStringItem ? null : item.description || item.explanation || null,
        category: "USER",
        agent_type: "REFERRAL_ENGINE_ANALYSIS",
        full_text: fullText,
      });
      result.summary.user_tasks++;
    }
  } catch (e) {
    log(`[TEST-TASKS] ⚠ Error simulating Referral Engine tasks: ${e}`);
  }

  result.summary.total_tasks =
    result.summary.user_tasks + result.summary.alloro_tasks;

  return result;
}

/**
 * POST /api/agents/gbp-optimizer-run
 *
 * Monthly GBP Copy Optimizer agent
 * - Runs for all accounts on 1st of each month
 * - Fetches GBP posts from previous month
 * - Sends to Copy Companion agent for optimization recommendations
 * - Creates tasks for copy updates
 *
 * Body: { referenceDate?: "YYYY-MM-DD" } (optional, for testing)
 */
router.post("/gbp-optimizer-run", async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { referenceDate } = req.body || {};

  log("\n" + "=".repeat(70));
  log("POST /api/agents/gbp-optimizer-run - STARTING");
  log("=".repeat(70));
  if (referenceDate) log(`Reference Date: ${referenceDate}`);
  log(`Timestamp: ${new Date().toISOString()}`);
  log(`Webhook: ${COPY_COMPANION_WEBHOOK || "NOT CONFIGURED"}`);

  try {
    // Validate webhook configuration
    if (!COPY_COMPANION_WEBHOOK) {
      throw new Error(
        "COPY_COMPANION_AGENT_WEBHOOK not configured in environment"
      );
    }

    // Fetch all onboarded Google accounts
    log("\n[SETUP] Fetching all onboarded Google accounts...");
    const accounts = await db("google_accounts")
      .where("onboarding_completed", true)
      .select("*");

    if (!accounts || accounts.length === 0) {
      log("[SETUP] No onboarded accounts found");
      return res.json({
        success: true,
        message: "No accounts to process",
        processed: 0,
        results: [],
      });
    }

    log(`[SETUP] Found ${accounts.length} total account(s)`);

    // Filter accounts that have GBP configured
    log("[SETUP] Filtering accounts with GBP configured...");
    const gbpAccounts = accounts.filter((account) => {
      const propertyIds =
        typeof account.google_property_ids === "string"
          ? JSON.parse(account.google_property_ids)
          : account.google_property_ids;
      return (
        propertyIds?.gbp &&
        Array.isArray(propertyIds.gbp) &&
        propertyIds.gbp.length > 0
      );
    });

    if (gbpAccounts.length === 0) {
      log("[SETUP] ⚠ No accounts with GBP configured");
      return res.json({
        success: true,
        message: "No accounts with GBP to process",
        processed: 0,
        results: [],
      });
    }

    log(`[SETUP] ✓ Found ${gbpAccounts.length} account(s) with GBP configured`);

    // Log account details
    gbpAccounts.forEach((acc, idx) => {
      const propertyIds =
        typeof acc.google_property_ids === "string"
          ? JSON.parse(acc.google_property_ids)
          : acc.google_property_ids;
      const locationCount = propertyIds?.gbp?.length || 0;
      log(
        `  [${idx + 1}] ${acc.domain_name} (${locationCount} location${
          locationCount !== 1 ? "s" : ""
        })`
      );
    });

    // Get previous month date range
    const monthRange = getPreviousMonthRange(referenceDate);
    log(
      `\n[SETUP] Month range: ${monthRange.startDate} to ${monthRange.endDate}`
    );

    // Process each client sequentially
    const results: any[] = [];

    for (const account of gbpAccounts) {
      const { id: googleAccountId, domain_name: domain } = account;
      const accountIndex = gbpAccounts.indexOf(account) + 1;

      log(`\n[${"=".repeat(60)}]`);
      log(
        `[CLIENT ${accountIndex}/${gbpAccounts.length}] Processing: ${domain} (ID: ${googleAccountId})`
      );
      log(`[${"=".repeat(60)}]`);

      try {
        // Check for duplicate before running
        log(`[CLIENT] Checking for existing results...`);
        const existingResult = await db("agent_results")
          .where({
            google_account_id: googleAccountId,
            domain,
            agent_type: "gbp_optimizer",
            date_start: monthRange.startDate,
            date_end: monthRange.endDate,
          })
          .whereIn("status", ["success", "pending"])
          .first();

        if (existingResult) {
          log(
            `[CLIENT] ℹ GBP Optimizer already run for this period (Result ID: ${existingResult.id})`
          );
          log(`[CLIENT] Skipping ${domain}`);
          results.push({
            googleAccountId,
            domain,
            success: true,
            skipped: true,
            reason: "already_exists",
            existingResultId: existingResult.id,
          });
          continue;
        }

        log(`[CLIENT] No existing results found - proceeding`);

        // Get valid OAuth2 client
        log(
          `[CLIENT] Getting valid OAuth2 client for account ${googleAccountId}`
        );
        const oauth2Client = await getValidOAuth2Client(googleAccountId);

        // Run GBP Optimizer agent
        log(`\n[CLIENT] Running GBP Optimizer agent...`);
        const result = await processGBPOptimizerAgent(
          account,
          oauth2Client,
          monthRange
        );

        if (!result.success) {
          throw new Error(result.error || "GBP Optimizer agent failed");
        }

        // Save agent result to database
        log(`\n[CLIENT] Saving results to database...`);
        const [agentResultRecord] = await db("agent_results")
          .insert({
            google_account_id: googleAccountId,
            domain,
            agent_type: "gbp_optimizer",
            date_start: monthRange.startDate,
            date_end: monthRange.endDate,
            agent_input: JSON.stringify(result.payload),
            agent_output: JSON.stringify(result.output),
            status: "success",
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning("id");

        const resultId = agentResultRecord.id;
        log(`[CLIENT] ✓ Agent result saved (ID: ${resultId})`);

        // Create tasks from recommendations
        await createTasksFromCopyRecommendations(
          result.output,
          googleAccountId,
          domain
        );

        results.push({
          googleAccountId,
          domain,
          success: true,
          resultId,
          recommendationCount: Object.keys(result.output[0] || {}).length,
        });

        log(`\n[CLIENT] ✓ ${domain} completed successfully`);
      } catch (error: any) {
        logError(`GBP Optimizer for ${domain}`, error);
        log(`[CLIENT] ✗ ${domain} failed: ${error?.message || String(error)}`);

        results.push({
          googleAccountId,
          domain,
          success: false,
          error: error?.message || String(error),
        });
      }
    }

    const duration = Date.now() - startTime;
    const successfulClients = results.filter(
      (r) => r.success && !r.skipped
    ).length;
    const skippedClients = results.filter((r) => r.skipped).length;
    const failedClients = results.filter((r) => !r.success).length;

    log("\n" + "=".repeat(70));
    log(`[COMPLETE] ✓ GBP Optimizer run completed`);
    log(`  - Total accounts: ${gbpAccounts.length}`);
    log(`  - Successful: ${successfulClients}`);
    log(`  - Skipped: ${skippedClients}`);
    log(`  - Failed: ${failedClients}`);
    log(`  - Duration: ${duration}ms (${(duration / 1000).toFixed(1)}s)`);
    log("=".repeat(70) + "\n");

    return res.json({
      success: true,
      message: `Processed ${gbpAccounts.length} account(s)`,
      processed: gbpAccounts.length,
      successful: successfulClients,
      skipped: skippedClients,
      failed: failedClients,
      duration: `${duration}ms`,
      results,
    });
  } catch (error: any) {
    logError("gbp-optimizer-run", error);
    const duration = Date.now() - startTime;
    log(`\n[FAILED] ❌ GBP Optimizer run failed after ${duration}ms`);
    log(`  Error: ${error?.message || String(error)}`);
    log("=".repeat(70) + "\n");

    return res.status(500).json({
      success: false,
      error: "GBP_OPTIMIZER_RUN_ERROR",
      message: error?.message || "Failed to run GBP optimizer agent",
      duration: `${duration}ms`,
    });
  }
});

/**
 * POST /api/agents/ranking-run
 *
 * Automated practice ranking agent run
 * - Runs for all accounts sequentially
 * - Runs each location within an account sequentially
 * - Uses Identifier Agent to automatically determine specialty/market
 *
 * Body: { googleAccountId?: number } (optional)
 */
router.post("/ranking-run", async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { googleAccountId } = req.body || {};

  log("\n" + "=".repeat(70));
  log("POST /api/agents/ranking-run - STARTING");
  log("=".repeat(70));
  if (googleAccountId) log(`Account ID: ${googleAccountId}`);
  log(`Timestamp: ${new Date().toISOString()}`);

  try {
    // 1. Fetch accounts to process
    let accounts = [];
    if (googleAccountId) {
      const account = await db("google_accounts")
        .where({ id: googleAccountId, onboarding_completed: true })
        .first();
      if (!account)
        throw new Error(`Onboarded account ${googleAccountId} not found`);
      accounts = [account];
    } else {
      accounts = await db("google_accounts")
        .where("onboarding_completed", true)
        .select("*");
    }

    if (!accounts || accounts.length === 0) {
      log("[SETUP] No accounts to process");
      return res.json({ success: true, message: "No accounts found" });
    }

    log(`[SETUP] Found ${accounts.length} account(s) to process`);

    // 2. Process each account sequentially
    const results: any[] = [];
    for (const account of accounts) {
      const { id: accId, domain_name: domain } = account;
      log(`\n[${"=".repeat(60)}]`);
      log(`[ACCOUNT] Processing: ${domain} (ID: ${accId})`);
      log(`[${"=".repeat(60)}]`);

      try {
        const propertyIds: GooglePropertyIds =
          typeof account.google_property_ids === "string"
            ? JSON.parse(account.google_property_ids)
            : account.google_property_ids;

        const gbpLocations = propertyIds?.gbp || [];
        if (gbpLocations.length === 0) {
          log(`  [ACCOUNT] No GBP locations found for ${domain}, skipping`);
          continue;
        }

        const oauth2Client = await getValidOAuth2Client(accId);
        const batchId = uuidv4();
        log(`  [ACCOUNT] Batch ID: ${batchId}`);
        log(
          `  [ACCOUNT] Performing upfront identification for ${gbpLocations.length} locations...`
        );

        // === UPFRONT IDENTIFICATION AND RECORD CREATION ===
        const locationMetaMap = new Map<
          string,
          { specialty: string; marketLocation: string }
        >();
        const locationRankingMap = new Map<string, number>();

        for (const loc of gbpLocations) {
          log(`    → Identifying: ${loc.displayName || loc.locationId}`);
          try {
            const gbpProfile = await fetchGBPDataForRange(
              oauth2Client,
              [loc],
              new Date().toISOString().split("T")[0],
              new Date().toISOString().split("T")[0]
            );

            const locationData = gbpProfile?.locations?.[0]?.data || {};
            const meta = await identifyLocationMeta(locationData, domain);
            locationMetaMap.set(loc.locationId, meta);
          } catch (identErr: any) {
            log(
              `    ✗ Identification failed for ${loc.locationId}, using fallback`
            );
            locationMetaMap.set(loc.locationId, {
              specialty: "orthodontist",
              marketLocation: "Unknown, US",
            });
          }
        }

        // Create ALL ranking records upfront with "pending" status
        // This ensures the dashboard shows all locations (e.g. 1/3, 2/3) immediately
        for (let i = 0; i < gbpLocations.length; i++) {
          const loc = gbpLocations[i];
          const meta = locationMetaMap.get(loc.locationId)!;

          const [rankingRecord] = await db("practice_rankings")
            .insert({
              google_account_id: accId,
              domain,
              specialty: meta.specialty,
              location: meta.marketLocation,
              gbp_account_id: loc.accountId,
              gbp_location_id: loc.locationId,
              gbp_location_name: loc.displayName || domain,
              batch_id: batchId,
              observed_at: new Date(),
              status: "pending",
              status_detail: JSON.stringify({
                currentStep: "queued",
                message: `Waiting in queue (${i + 1}/${
                  gbpLocations.length
                })...`,
                progress: 0,
                stepsCompleted: [],
                timestamps: { created_at: new Date().toISOString() },
              }),
              created_at: new Date(),
              updated_at: new Date(),
            })
            .returning("id");

          locationRankingMap.set(loc.locationId, rankingRecord.id);
        }

        log(`    ✓ Created ${gbpLocations.length} records upfront`);

        // === SEQUENTIAL ANALYSIS PHASE ===
        const accResults = [];
        for (let i = 0; i < gbpLocations.length; i++) {
          const loc = gbpLocations[i];
          const rankingId = locationRankingMap.get(loc.locationId)!;
          const meta = locationMetaMap.get(loc.locationId)!;

          log(
            `\n  [LOCATION] Processing ${i + 1}/${gbpLocations.length}: ${
              loc.displayName || loc.locationId
            }`
          );

          // Update status to processing with progress context
          await db("practice_rankings")
            .where({ id: rankingId })
            .update({
              status: "processing",
              status_detail: JSON.stringify({
                currentStep: "starting",
                message: `Starting analysis ${i + 1}/${gbpLocations.length}...`,
                progress: 5,
                stepsCompleted: ["queued"],
                timestamps: { started_at: new Date().toISOString() },
              }),
            });

          // Process the ranking with retry logic
          let success = false;
          for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
              if (attempt > 1) {
                log(
                  `    🔄 Retry ${attempt}/${MAX_RETRIES} for ID ${rankingId}`
                );
                await delay(RETRY_DELAY_MS);
              }

              const result = await processLocationRanking(
                rankingId,
                accId,
                loc.accountId,
                loc.locationId,
                loc.displayName || domain,
                meta.specialty,
                meta.marketLocation,
                domain,
                batchId,
                log
              );

              accResults.push(result);
              success = true;
              break;
            } catch (err: any) {
              log(`    ✗ Attempt ${attempt} failed: ${err.message}`);
              if (attempt === MAX_RETRIES) {
                await db("practice_rankings")
                  .where({ id: rankingId })
                  .update({ status: "failed", error_message: err.message });
              }
            }
          }

          if (!success) {
            log(`    ✗ FAILED: Exhausted retries for ${loc.locationId}`);
          }
        }

        results.push({
          domain,
          batchId,
          processed: accResults.length,
          total: gbpLocations.length,
        });
      } catch (accErr: any) {
        logError(`Account ${domain} failed`, accErr);
      }
    }

    const duration = Date.now() - startTime;
    log("\n" + "=".repeat(70));
    log(
      `[COMPLETE] ✓ Ranking run completed in ${(duration / 1000).toFixed(1)}s`
    );
    log("=".repeat(70) + "\n");

    return res.json({
      success: true,
      message: `Processed ${accounts.length} account(s)`,
      duration: `${duration}ms`,
      results,
    });
  } catch (error: any) {
    logError("ranking-run", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/agents/guardian-governance-agents-run
 *
 * Monthly Guardian & Governance Sentinel agents
 * - Runs system-wide analysis on all agent outputs from a specific month
 * - Groups results by agent_type
 * - Sends each group to Guardian and Governance agents
 * - Collects all results and saves as 2 aggregated rows (1 guardian, 1 governance)
 * - For admin oversight and quality assurance
 *
 * Body: { month?: "YYYY-MM", referenceDate?: "YYYY-MM-DD" } (optional)
 *   - month: If provided, analyze agent outputs from this specific month
 *   - referenceDate: Legacy parameter, if month not provided, uses this to determine the month
 */
router.post(
  "/guardian-governance-agents-run",
  async (req: Request, res: Response) => {
    const startTime = Date.now();
    const { month, referenceDate } = req.body || {};

    log("\n" + "=".repeat(70));
    log("POST /api/agents/guardian-governance-agents-run - STARTING");
    log("=".repeat(70));
    if (month) log(`Month: ${month}`);
    if (referenceDate) log(`Reference Date: ${referenceDate}`);
    log(`Timestamp: ${new Date().toISOString()}`);

    try {
      // Validate webhook configuration
      if (!GUARDIAN_AGENT_WEBHOOK || !GOVERNANCE_AGENT_WEBHOOK) {
        throw new Error(
          "GUARDIAN_AGENT_WEBHOOK or GOVERNANCE_AGENT_WEBHOOK not configured in environment"
        );
      }

      log(`Guardian webhook: ${GUARDIAN_AGENT_WEBHOOK}`);
      log(`Governance webhook: ${GOVERNANCE_AGENT_WEBHOOK}`);

      // Get month date range - use month param if provided, otherwise current month
      let monthRange: { startDate: string; endDate: string };

      if (month) {
        // Parse YYYY-MM format
        const startDate = `${month}-01`;
        const endOfMonth = new Date(
          new Date(month + "-01").getFullYear(),
          new Date(month + "-01").getMonth() + 1,
          0
        );
        const endDate = formatDate(endOfMonth);
        monthRange = { startDate, endDate };
        log(`[GUARDIAN-GOV] Using specified month: ${month}`);
      } else {
        monthRange = getCurrentMonthRange();
        log(`[GUARDIAN-GOV] Using current month`);
      }
      log(
        `\n[GUARDIAN-GOV] Date range: ${monthRange.startDate} to ${monthRange.endDate}`
      );

      // Fetch all successful agent results from current month
      // Exclude guardian, governance_sentinel, and gbp_optimizer
      log("\n[GUARDIAN-GOV] Fetching agent results from current month...");
      const results = await db("agent_results")
        .whereBetween("created_at", [
          new Date(monthRange.startDate),
          new Date(monthRange.endDate + "T23:59:59"),
        ])
        .where("status", "success")
        .whereNotIn("agent_type", [
          "guardian",
          "governance_sentinel",
          "gbp_optimizer",
        ])
        .orderBy("agent_type")
        .orderBy("created_at")
        .select("*");

      if (!results || results.length === 0) {
        log("[GUARDIAN-GOV] No agent results found for current month");
        return res.json({
          success: true,
          message: "No agent results to process",
          processed: 0,
          guardianResultId: null,
          governanceResultId: null,
        });
      }

      log(`[GUARDIAN-GOV] Found ${results.length} total results`);

      // Group results by agent_type
      log("[GUARDIAN-GOV] Grouping by agent_type...");
      const groupedResults: Record<string, any[]> = {};

      for (const result of results) {
        const agentType = result.agent_type;
        if (!groupedResults[agentType]) {
          groupedResults[agentType] = [];
        }

        // Parse agent_output if it's a string
        let parsedOutput = result.agent_output;
        if (typeof result.agent_output === "string") {
          try {
            parsedOutput = JSON.parse(result.agent_output);
          } catch (e) {
            log(
              `  [WARNING] Failed to parse agent_output for result ${result.id}`
            );
          }
        }

        groupedResults[agentType].push(parsedOutput);
      }

      const agentTypes = Object.keys(groupedResults);
      log(
        `[GUARDIAN-GOV] ✓ Created ${agentTypes.length} groups: ${agentTypes
          .map((t) => `${t}(${groupedResults[t].length})`)
          .join(", ")}`
      );

      // Check for duplicates
      const existingGuardian = await db("agent_results")
        .where({
          agent_type: "guardian",
          domain: "SYSTEM",
          date_start: monthRange.startDate,
          date_end: monthRange.endDate,
        })
        .whereIn("status", ["success", "pending"])
        .first();

      if (existingGuardian) {
        log(
          `[GUARDIAN-GOV] Guardian/Governance already run for this period (ID: ${existingGuardian.id})`
        );
        return res.json({
          success: true,
          message: "Guardian/Governance already run for this period",
          skipped: true,
          existingResultId: existingGuardian.id,
        });
      }

      // Initialize result collectors
      const guardianResults: any[] = [];
      const governanceResults: any[] = [];
      let successfulGroups = 0;
      let failedGroups = 0;

      // Process each agent_type group
      let groupIndex = 0;
      for (const agentType of agentTypes) {
        groupIndex++;
        const outputs = groupedResults[agentType];

        log(`\n[${"=".repeat(60)}]`);
        log(
          `[GUARDIAN-GOV] Processing group ${groupIndex}/${agentTypes.length}: ${agentType}`
        );
        log(`[${"=".repeat(60)}]`);
        log(`[GUARDIAN-GOV] Results in group: ${outputs.length}`);

        // Fetch historical PASS and REJECT recommendations for context
        log(
          `[GUARDIAN-GOV] Fetching historical recommendations for ${agentType}...`
        );

        const passedRecs = await db("agent_recommendations")
          .where("agent_under_test", agentType)
          .where("status", "PASS")
          .select(
            "id",
            "title",
            "explanation",
            "verdict",
            "confidence",
            "created_at"
          )
          .orderBy("created_at", "desc")
          .limit(50); // Limit to most recent 50

        const rejectedRecs = await db("agent_recommendations")
          .where("agent_under_test", agentType)
          .where("status", "REJECT")
          .select(
            "id",
            "title",
            "explanation",
            "verdict",
            "confidence",
            "created_at"
          )
          .orderBy("created_at", "desc")
          .limit(50);

        log(
          `[GUARDIAN-GOV] Found ${passedRecs.length} PASS, ${rejectedRecs.length} REJECT recommendations`
        );

        // Build payload with historical context
        const payload = buildGuardianGovernancePayload(
          agentType,
          outputs,
          passedRecs,
          rejectedRecs
        );

        // === STEP 1: Call Guardian Agent ===
        log(`[GUARDIAN-GOV]   → Calling Guardian agent`);
        let guardianSuccess = false;
        let guardianOutput: any = null;

        for (let attempt = 1; attempt <= 3; attempt++) {
          if (attempt > 1) {
            log(
              `[GUARDIAN-GOV]   🔄 Guardian retry attempt ${attempt}/3 for ${agentType}`
            );
            log(`[GUARDIAN-GOV]   Waiting 30 seconds before retry...`);
            await delay(30000);
          }

          try {
            guardianOutput = await callAgentWebhook(
              GUARDIAN_AGENT_WEBHOOK,
              payload,
              `Guardian (${agentType})`
            );

            // Validate output
            if (isValidAgentOutput(guardianOutput, `Guardian-${agentType}`)) {
              log(`[GUARDIAN-GOV]   ✓ Guardian completed successfully`);
              guardianSuccess = true;
              break;
            } else {
              throw new Error("Guardian returned empty or invalid output");
            }
          } catch (error: any) {
            log(
              `[GUARDIAN-GOV]   ⚠ Guardian attempt ${attempt} failed: ${error.message}`
            );
            if (attempt === 3) {
              log(
                `[GUARDIAN-GOV]   ✗ Guardian failed after 3 attempts for ${agentType}`
              );
            }
          }
        }

        // Collect Guardian result (success or failure)
        if (guardianSuccess && guardianOutput) {
          guardianResults.push({
            agent_under_test: agentType,
            recommendations: guardianOutput,
          });
        } else {
          guardianResults.push({
            agent_under_test: agentType,
            error: "Failed after 3 attempts",
          });
          failedGroups++;
        }

        // === STEP 2: Call Governance Sentinel Agent ===
        log(`[GUARDIAN-GOV]   → Calling Governance agent`);
        let governanceSuccess = false;
        let governanceOutput: any = null;

        for (let attempt = 1; attempt <= 3; attempt++) {
          if (attempt > 1) {
            log(
              `[GUARDIAN-GOV]   🔄 Governance retry attempt ${attempt}/3 for ${agentType}`
            );
            log(`[GUARDIAN-GOV]   Waiting 30 seconds before retry...`);
            await delay(30000);
          }

          try {
            governanceOutput = await callAgentWebhook(
              GOVERNANCE_AGENT_WEBHOOK,
              payload,
              `Governance (${agentType})`
            );

            // Validate output
            if (
              isValidAgentOutput(governanceOutput, `Governance-${agentType}`)
            ) {
              log(`[GUARDIAN-GOV]   ✓ Governance completed successfully`);
              governanceSuccess = true;
              break;
            } else {
              throw new Error("Governance returned empty or invalid output");
            }
          } catch (error: any) {
            log(
              `[GUARDIAN-GOV]   ⚠ Governance attempt ${attempt} failed: ${error.message}`
            );
            if (attempt === 3) {
              log(
                `[GUARDIAN-GOV]   ✗ Governance failed after 3 attempts for ${agentType}`
              );
            }
          }
        }

        // Collect Governance result (success or failure)
        if (governanceSuccess && governanceOutput) {
          governanceResults.push({
            agent_under_test: agentType,
            recommendations: governanceOutput,
          });
        } else {
          governanceResults.push({
            agent_under_test: agentType,
            error: "Failed after 3 attempts",
          });
          if (!guardianSuccess) {
            // Only increment if guardian also failed
            failedGroups++;
          }
        }

        // Track successful groups
        if (guardianSuccess && governanceSuccess) {
          successfulGroups++;
        }
      }

      // === STEP 3: Save aggregated results to database ===
      log(`\n[${"=".repeat(60)}]`);
      log("[GUARDIAN-GOV] ALL GROUPS PROCESSED - Saving to database");
      log(`[${"=".repeat(60)}]`);
      log(
        `[GUARDIAN-GOV] Guardian results collected: ${guardianResults.length} groups`
      );
      log(
        `[GUARDIAN-GOV] Governance results collected: ${governanceResults.length} groups`
      );

      // Save Guardian result
      const [guardianRecord] = await db("agent_results")
        .insert({
          google_account_id: null,
          domain: "SYSTEM",
          agent_type: "guardian",
          date_start: monthRange.startDate,
          date_end: monthRange.endDate,
          agent_input: JSON.stringify({
            type: "SYSTEM",
            aggregated_from: agentTypes,
            total_results: results.length,
            date_range: `${monthRange.startDate} to ${monthRange.endDate}`,
          }),
          agent_output: JSON.stringify(guardianResults),
          status: "success",
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("id");

      const guardianId = guardianRecord.id;
      log(`[GUARDIAN-GOV] ✓ Guardian result saved (ID: ${guardianId})`);

      // Save Governance Sentinel result
      const [governanceRecord] = await db("agent_results")
        .insert({
          google_account_id: null,
          domain: "SYSTEM",
          agent_type: "governance_sentinel",
          date_start: monthRange.startDate,
          date_end: monthRange.endDate,
          agent_input: JSON.stringify({
            type: "SYSTEM",
            aggregated_from: agentTypes,
            total_results: results.length,
            date_range: `${monthRange.startDate} to ${monthRange.endDate}`,
          }),
          agent_output: JSON.stringify(governanceResults),
          status: "success",
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("id");

      const governanceId = governanceRecord.id;
      log(`[GUARDIAN-GOV] ✓ Governance result saved (ID: ${governanceId})`);

      // Parse and save recommendations to agent_recommendations table
      try {
        await saveRecommendationsFromAgents(
          guardianId,
          governanceId,
          guardianResults,
          governanceResults
        );
      } catch (recError: any) {
        // Log but don't fail the entire process
        logError("Recommendation parsing", recError);
        log(
          `[GUARDIAN-GOV] ⚠ Recommendation parsing failed but agent run succeeded`
        );
      }

      const duration = Date.now() - startTime;

      log("\n" + "=".repeat(70));
      log(`[GUARDIAN-GOV] ✓ COMPLETED SUCCESSFULLY`);
      log(`  - Total groups: ${agentTypes.length}`);
      log(`  - Successful: ${successfulGroups}`);
      log(`  - Failed: ${failedGroups}`);
      log(`  - Guardian ID: ${guardianId}`);
      log(`  - Governance ID: ${governanceId}`);
      log(`  - Duration: ${duration}ms (${(duration / 1000).toFixed(1)}s)`);
      log("=".repeat(70) + "\n");

      return res.json({
        success: true,
        message: "Guardian and Governance agents completed",
        guardianResultId: guardianId,
        governanceResultId: governanceId,
        groupsProcessed: agentTypes.length,
        successfulGroups,
        failedGroups,
        groupDetails: agentTypes.map((type) => ({
          agent_type: type,
          count: groupedResults[type].length,
          guardian_success: !guardianResults.find(
            (r) => r.agent_under_test === type && r.error
          ),
          governance_success: !governanceResults.find(
            (r) => r.agent_under_test === type && r.error
          ),
        })),
        duration: `${duration}ms`,
      });
    } catch (error: any) {
      logError("guardian-governance-agents-run", error);
      const duration = Date.now() - startTime;
      log(
        `\n[GUARDIAN-GOV] ❌ Guardian/Governance run failed after ${duration}ms`
      );
      log(`  Error: ${error?.message || String(error)}`);
      log("=".repeat(70) + "\n");

      return res.status(500).json({
        success: false,
        error: "GUARDIAN_GOVERNANCE_RUN_ERROR",
        message: error?.message || "Failed to run guardian/governance agents",
        duration: `${duration}ms`,
      });
    }
  }
);

/**
 * POST /api/agents/process-all
 *
 * DEPRECATED - Use /proofline-run instead
 * Main endpoint that processes all clients daily
 * - Always runs Proofline (daily) for each client
 * - Conditionally runs Summary + Opportunity (monthly) when conditions are met
 *
 * Body: { referenceDate?: "YYYY-MM-DD" } (optional, for testing)
 */
router.post("/process-all", async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { referenceDate } = req.body || {};

  log("\n" + "=".repeat(70));
  log("POST /api/agents/process-all - STARTING");
  log("=".repeat(70));
  if (referenceDate) log(`Reference Date: ${referenceDate}`);
  log(`Timestamp: ${new Date().toISOString()}`);
  log(`Max retries per client: 3`);

  try {
    // Fetch all onboarded Google accounts
    log("\n[SETUP] Fetching all onboarded Google accounts...");
    const accounts = await db("google_accounts")
      .where("onboarding_completed", true)
      .select("*");

    if (!accounts || accounts.length === 0) {
      log("[SETUP] No onboarded accounts found");
      return res.json({
        success: true,
        message: "No accounts to process",
        processed: 0,
        results: [],
      });
    }

    log(`[SETUP] Found ${accounts.length} account(s) to process`);

    // Process each client sequentially with retry mechanism
    const results: any[] = [];
    let totalRetries = 0;

    for (const account of accounts) {
      const result = await processClient(account, referenceDate);

      // Track retry statistics
      if (result.attempts && result.attempts > 1) {
        totalRetries += result.attempts - 1;
        log(
          `[STATS] Client ${account.domain_name} required ${result.attempts} attempt(s)`
        );
      }

      results.push({
        googleAccountId: account.id,
        domain: account.domain_name,
        ...result,
      });

      // Stop on first error after all retries exhausted
      if (!result.success) {
        log(
          `\n[ERROR] ❌ Stopping processing - ${account.domain_name} failed after ${result.attempts} attempts`
        );
        throw new Error(
          `Processing failed for ${account.domain_name} after ${result.attempts} attempts: ${result.error}`
        );
      }
    }

    const duration = Date.now() - startTime;
    const successfulClients = results.filter((r) => r.success).length;

    log("\n" + "=".repeat(70));
    log(`[COMPLETE] ✓ All clients processed successfully`);
    log(`  - Total clients: ${accounts.length}`);
    log(`  - Successful: ${successfulClients}`);
    log(`  - Total retries: ${totalRetries}`);
    log(`  - Duration: ${duration}ms (${(duration / 1000).toFixed(1)}s)`);
    log("=".repeat(70) + "\n");

    return res.json({
      success: true,
      message: `Processed ${accounts.length} account(s) successfully`,
      processed: accounts.length,
      successful: successfulClients,
      totalRetries,
      duration: `${duration}ms`,
      results,
    });
  } catch (error: any) {
    logError("process-all", error);
    const duration = Date.now() - startTime;
    log(`\n[FAILED] ❌ Processing failed after ${duration}ms`);
    log("=".repeat(70) + "\n");

    return res.status(500).json({
      success: false,
      error: "PROCESSING_ERROR",
      message: error?.message || "Failed to process agents",
      duration: `${duration}ms`,
    });
  }
});

/**
 * GET /api/agents/latest/:googleAccountId
 *
 * Fetch the latest successful agent outputs for a given google account
 * Used by frontend dashboard to display agent results
 */
router.get("/latest/:googleAccountId", async (req: Request, res: Response) => {
  const { googleAccountId } = req.params;

  try {
    log(`\n[GET /latest/${googleAccountId}] Fetching latest agent outputs`);

    // Validate googleAccountId
    const accountId = parseInt(googleAccountId, 10);
    if (isNaN(accountId)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_ACCOUNT_ID",
        message: "Invalid google account ID provided",
      });
    }

    // Fetch account details
    const account = await db("google_accounts").where("id", accountId).first();

    if (!account) {
      return res.status(404).json({
        success: false,
        error: "ACCOUNT_NOT_FOUND",
        message: "Google account not found",
      });
    }

    // Fetch latest successful result for each agent type
    const agentTypes = ["proofline", "summary", "opportunity"];
    const agents: any = {};

    for (const agentType of agentTypes) {
      const result = await db("agent_results")
        .where({
          google_account_id: accountId,
          agent_type: agentType,
          status: "success",
        })
        .orderBy("created_at", "desc")
        .first();

      if (result) {
        // Parse agent_output from JSON string to object
        let parsedOutput = null;
        try {
          parsedOutput =
            typeof result.agent_output === "string"
              ? JSON.parse(result.agent_output)
              : result.agent_output;
        } catch (parseError) {
          log(
            `  [WARNING] Failed to parse agent_output for ${agentType}: ${parseError}`
          );
          parsedOutput = result.agent_output;
        }

        agents[agentType] = {
          results: parsedOutput,
          lastUpdated: result.created_at,
          dateStart: result.date_start,
          dateEnd: result.date_end,
          resultId: result.id,
        };
      } else {
        agents[agentType] = null;
      }
    }

    log(
      `  [SUCCESS] Retrieved latest outputs for account ${accountId} (${account.domain_name})`
    );

    return res.json({
      success: true,
      googleAccountId: accountId,
      domain: account.domain_name,
      agents,
    });
  } catch (error: any) {
    logError(`GET /latest/${googleAccountId}`, error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch latest agent outputs",
    });
  }
});

/**
 * GET /api/agents/getLatestReferralEngineOutput/:googleAccountId
 *
 * Fetch the latest successful Referral Engine output for a given google account
 * Used by frontend Referral Engine dashboard
 */
router.get(
  "/getLatestReferralEngineOutput/:googleAccountId",
  async (req: Request, res: Response) => {
    const { googleAccountId } = req.params;

    try {
      log(
        `\n[GET /getLatestReferralEngineOutput/${googleAccountId}] Fetching latest referral engine output`
      );

      // Validate googleAccountId
      const accountId = parseInt(googleAccountId, 10);
      if (isNaN(accountId)) {
        return res.status(400).json({
          success: false,
          error: "INVALID_ACCOUNT_ID",
          message: "Invalid google account ID provided",
        });
      }

      // Fetch account details
      const account = await db("google_accounts")
        .where("id", accountId)
        .first();

      if (!account) {
        return res.status(404).json({
          success: false,
          error: "ACCOUNT_NOT_FOUND",
          message: "Google account not found",
        });
      }

      // Check for active automation (monthly agents processing)
      // This prevents showing stale data while new referral engine output is being generated
      const activeAutomation = await db("pms_jobs")
        .where({ domain: account.domain_name })
        .whereRaw(
          `automation_status_detail::jsonb->>'status' = 'processing'
           AND automation_status_detail::jsonb->>'currentStep' = 'monthly_agents'`
        )
        .first();

      if (activeAutomation) {
        log(
          `  [PENDING] Active automation found for ${account.domain_name} - PMS Job ID: ${activeAutomation.id}`
        );
        return res.json({
          success: true,
          pending: true,
          message: "Monthly insights are being generated...",
          googleAccountId: accountId,
          domain: account.domain_name,
          data: null,
          metadata: {
            pmsJobId: activeAutomation.id,
            automationStatus: "processing",
          },
        });
      }

      // Fetch latest successful referral_engine result
      const result = await db("agent_results")
        .where({
          google_account_id: accountId,
          agent_type: "referral_engine",
          status: "success",
        })
        .orderBy("created_at", "desc")
        .first();

      if (!result) {
        log(
          `  [NO DATA] No referral engine results found for account ${accountId}`
        );
        return res.status(404).json({
          success: false,
          error: "NO_DATA",
          message: "No referral engine data available yet",
        });
      }

      // Parse agent_output from JSON string to object
      let parsedOutput = null;
      try {
        parsedOutput =
          typeof result.agent_output === "string"
            ? JSON.parse(result.agent_output)
            : result.agent_output;
      } catch (parseError) {
        log(`  [WARNING] Failed to parse agent_output: ${parseError}`);
        parsedOutput = result.agent_output;
      }

      log(
        `  [SUCCESS] Retrieved referral engine output for account ${accountId} (${account.domain_name})`
      );
      log(`  - Result ID: ${result.id}`);
      log(`  - Date range: ${result.date_start} to ${result.date_end}`);
      log(`  - Created: ${result.created_at}`);

      return res.json({
        success: true,
        pending: false,
        googleAccountId: accountId,
        domain: account.domain_name,
        data: parsedOutput,
        metadata: {
          resultId: result.id,
          dateStart: result.date_start,
          dateEnd: result.date_end,
          lastUpdated: result.created_at,
        },
      });
    } catch (error: any) {
      logError(`GET /getLatestReferralEngineOutput/${googleAccountId}`, error);
      return res.status(500).json({
        success: false,
        error: "FETCH_ERROR",
        message: error?.message || "Failed to fetch referral engine output",
      });
    }
  }
);

// =====================================================================
// HEALTH CHECK ENDPOINT
// =====================================================================

/**
 * GET /api/agents/health
 * Simple health check endpoint
 */
router.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    webhooks: {
      proofline: !!PROOFLINE_WEBHOOK,
      summary: !!SUMMARY_WEBHOOK,
      referral_engine: !!REFERRAL_ENGINE_WEBHOOK,
      opportunity: !!OPPORTUNITY_WEBHOOK,
      cro_optimizer: !!CRO_OPTIMIZER_WEBHOOK,
      copy_companion: !!COPY_COMPANION_WEBHOOK,
      guardian: !!GUARDIAN_AGENT_WEBHOOK,
      governance: !!GOVERNANCE_AGENT_WEBHOOK,
    },
  });
});

// =====================================================================
// EXPORTS
// =====================================================================

export default router;
