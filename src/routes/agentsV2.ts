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
import { createOAuth2ClientForAccount } from "../auth/oauth2Helper";
import {
  fetchAllServiceData,
  GooglePropertyIds,
} from "../services/dataAggregator";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";

const router = express.Router();

// =====================================================================
// CONFIGURATION
// =====================================================================

const LOG_DIR = path.join(__dirname, "../logs");
const LOG_FILE = path.join(LOG_DIR, "agent-run.log");

// Agent webhook URLs from environment variables
const PROOFLINE_WEBHOOK = process.env.PROOFLINE_AGENT_WEBHOOK || "";
const SUMMARY_WEBHOOK = process.env.SUMMARY_AGENT_WEBHOOK || "";
const OPPORTUNITY_WEBHOOK = process.env.OPPORTUNITY_AGENT_WEBHOOK || "";

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
      timeout: 300000, // 5 minutes timeout
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
 */
function buildSummaryPayload(params: {
  domain: string;
  googleAccountId: number;
  startDate: string;
  endDate: string;
  monthData: any;
}): any {
  return {
    agent: "summary",
    domain: params.domain,
    googleAccountId: params.googleAccountId,
    dateRange: {
      start: params.startDate,
      end: params.endDate,
    },
    additional_data: params.monthData,
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

// =====================================================================
// CLIENT PROCESSING
// =====================================================================

/**
 * Process daily agent (Proofline) for a single client
 */
async function processDailyAgent(
  account: any,
  oauth2Client: any,
  dates: ReturnType<typeof getDailyDates>
): Promise<{ success: boolean; resultId?: number; error?: string }> {
  const { id: googleAccountId, domain_name: domain } = account;

  log(`  [DAILY] Processing Proofline agent for ${domain}`);

  try {
    // Check for duplicate - if exists for this date range, skip
    const existing = await db("agent_results")
      .where({
        google_account_id: googleAccountId,
        domain,
        agent_type: "proofline",
        date_start: dates.dayBeforeYesterday,
        date_end: dates.yesterday,
      })
      .whereIn("status", ["success", "pending"])
      .first();

    if (existing) {
      log(`  [DAILY] Skipping - result already exists (ID: ${existing.id})`);
      return { success: true, resultId: existing.id };
    }

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

    // Store raw data in google_data_store (covers both days)
    log(`  [DAILY] Storing raw Google service data`);
    await db("google_data_store").insert({
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
    });

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

    // Store agent result - ensure JSON serialization
    const [resultId] = await db("agent_results")
      .insert({
        google_account_id: googleAccountId,
        domain,
        agent_type: "proofline",
        date_start: dates.dayBeforeYesterday,
        date_end: dates.yesterday,
        agent_input: JSON.stringify(payload),
        agent_output: JSON.stringify(agentOutput),
        status: "success",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("id");

    log(`  [DAILY] ✓ Proofline completed (Result ID: ${resultId})`);
    return { success: true, resultId };
  } catch (error: any) {
    logError("processDailyAgent", error);

    // Store error result
    try {
      await db("agent_results").insert({
        google_account_id: googleAccountId,
        domain,
        agent_type: "proofline",
        date_start: dates.dayBeforeYesterday,
        date_end: dates.yesterday,
        agent_input: null,
        agent_output: null,
        status: "error",
        error_message: error?.message || String(error),
        created_at: new Date(),
        updated_at: new Date(),
      });
    } catch (dbError) {
      logError("processDailyAgent - DB error", dbError);
    }

    return { success: false, error: error?.message || String(error) };
  }
}

/**
 * Process monthly agents (Summary + Opportunity) for a single client
 */
async function processMonthlyAgents(
  account: any,
  oauth2Client: any,
  monthRange: ReturnType<typeof getPreviousMonthRange>
): Promise<{
  success: boolean;
  summaryId?: number;
  opportunityId?: number;
  skipped?: boolean;
  error?: string;
}> {
  const { id: googleAccountId, domain_name: domain } = account;
  const { startDate, endDate } = monthRange;

  log(
    `  [MONTHLY] Processing Summary + Opportunity for ${domain} (${startDate} to ${endDate})`
  );

  try {
    // Check for duplicate Summary - if exists, skip monthly processing
    const existingSummary = await db("agent_results")
      .where({
        google_account_id: googleAccountId,
        domain,
        agent_type: "summary",
        date_start: startDate,
        date_end: endDate,
      })
      .whereIn("status", ["success", "pending"])
      .first();

    if (existingSummary) {
      log(
        `  [MONTHLY] Skipping - Summary already exists (ID: ${existingSummary.id})`
      );
      return { success: true, skipped: true };
    }

    // Parse property IDs
    const propertyIds: GooglePropertyIds =
      typeof account.google_property_ids === "string"
        ? JSON.parse(account.google_property_ids)
        : account.google_property_ids;

    // Fetch month data
    log(`  [MONTHLY] Fetching data for ${startDate} to ${endDate}`);
    const monthData = await fetchAllServiceData(
      oauth2Client,
      googleAccountId,
      domain,
      propertyIds,
      startDate,
      endDate
    );

    // Store raw data in google_data_store
    log(`  [MONTHLY] Storing raw Google service data`);
    await db("google_data_store").insert({
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
    });

    // === STEP 1: Run Summary Agent ===
    log(`  [MONTHLY] Calling Summary agent webhook`);
    const summaryPayload = buildSummaryPayload({
      domain,
      googleAccountId,
      startDate,
      endDate,
      monthData,
    });

    const summaryOutput = await callAgentWebhook(
      SUMMARY_WEBHOOK,
      summaryPayload,
      "Summary"
    );

    log(`  [MONTHLY] Waiting 15 seconds before Opportunity agent...`);
    await delay(15000); // 15-second delay before Opportunity

    // Store Summary result - ensure JSON serialization
    const [summaryId] = await db("agent_results")
      .insert({
        google_account_id: googleAccountId,
        domain,
        agent_type: "summary",
        date_start: startDate,
        date_end: endDate,
        agent_input: JSON.stringify(summaryPayload),
        agent_output: JSON.stringify(summaryOutput),
        status: "success",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("id");

    log(`  [MONTHLY] ✓ Summary completed (Result ID: ${summaryId})`);

    // === STEP 2: Run Opportunity Agent (only uses Summary output) ===
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

    // Store Opportunity result - ensure JSON serialization
    const [opportunityId] = await db("agent_results")
      .insert({
        google_account_id: googleAccountId,
        domain,
        agent_type: "opportunity",
        date_start: startDate,
        date_end: endDate,
        agent_input: JSON.stringify(opportunityPayload),
        agent_output: JSON.stringify(opportunityOutput),
        status: "success",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("id");

    log(`  [MONTHLY] ✓ Opportunity completed (Result ID: ${opportunityId})`);

    return { success: true, summaryId, opportunityId };
  } catch (error: any) {
    logError("processMonthlyAgents", error);

    // Store error results
    try {
      await db("agent_results").insert([
        {
          google_account_id: googleAccountId,
          domain,
          agent_type: "summary",
          date_start: startDate,
          date_end: endDate,
          agent_input: null,
          agent_output: null,
          status: "error",
          error_message: error?.message || String(error),
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          google_account_id: googleAccountId,
          domain,
          agent_type: "opportunity",
          date_start: startDate,
          date_end: endDate,
          agent_input: null,
          agent_output: null,
          status: "error",
          error_message: error?.message || String(error),
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);
    } catch (dbError) {
      logError("processMonthlyAgents - DB error", dbError);
    }

    return { success: false, error: error?.message || String(error) };
  }
}

/**
 * Process a single client account
 */
async function processClient(
  account: any,
  referenceDate?: string
): Promise<{
  success: boolean;
  daily?: any;
  monthly?: any;
  error?: string;
}> {
  const { id: googleAccountId, domain_name: domain } = account;

  log(`\n[${"=".repeat(60)}]`);
  log(`[CLIENT] Processing: ${domain} (Account ID: ${googleAccountId})`);
  log(`[${"=".repeat(60)}]`);

  try {
    // Create OAuth2 client for this account
    log(`[CLIENT] Creating OAuth2 client`);
    const oauth2Client = await createOAuth2ClientForAccount(googleAccountId);

    // Get date ranges
    const dailyDates = getDailyDates(referenceDate);
    const monthRange = getPreviousMonthRange(referenceDate);

    // === STEP 1: Always run daily agent ===
    const dailyResult = await processDailyAgent(
      account,
      oauth2Client,
      dailyDates
    );

    if (!dailyResult.success) {
      throw new Error(`Daily agent failed: ${dailyResult.error}`);
    }

    // === STEP 2: Conditionally run monthly agents ===
    let monthlyResult: any = { skipped: true, reason: "conditions_not_met" };

    if (shouldRunMonthlyAgents(referenceDate)) {
      log(`[CLIENT] Waiting 15 seconds before monthly agents...`);
      await delay(15000); // 15-second delay before monthly processing

      log(`[CLIENT] Monthly conditions met - processing monthly agents`);
      monthlyResult = await processMonthlyAgents(
        account,
        oauth2Client,
        monthRange
      );

      if (!monthlyResult.success && !monthlyResult.skipped) {
        throw new Error(`Monthly agents failed: ${monthlyResult.error}`);
      }
    } else {
      log(`[CLIENT] Monthly conditions not met - skipping monthly agents`);
    }

    log(`[CLIENT] ✓ ${domain} processing completed successfully`);

    return {
      success: true,
      daily: dailyResult,
      monthly: monthlyResult,
    };
  } catch (error: any) {
    logError(`processClient - ${domain}`, error);
    return {
      success: false,
      error: error?.message || String(error),
    };
  }
}

// =====================================================================
// MAIN ENDPOINT
// =====================================================================

/**
 * POST /api/agents/process-all
 *
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
      const result = await processClient(account, referenceDate);
      results.push({
        googleAccountId: account.id,
        domain: account.domain_name,
        ...result,
      });

      // Stop on first error (as per requirements)
      if (!result.success) {
        log(
          `\n[ERROR] Stopping processing due to error in ${account.domain_name}`
        );
        throw new Error(
          `Processing failed for ${account.domain_name}: ${result.error}`
        );
      }

      // Add delay between clients if there are more to process
      if (accounts.indexOf(account) < accounts.length - 1) {
        log(`\n[SETUP] Waiting 15 seconds before next client...`);
        await delay(15000);
      }
    }

    const duration = Date.now() - startTime;
    log("\n" + "=".repeat(70));
    log(`[COMPLETE] All clients processed successfully in ${duration}ms`);
    log("=".repeat(70) + "\n");

    return res.json({
      success: true,
      message: `Processed ${accounts.length} account(s) successfully`,
      processed: accounts.length,
      duration: `${duration}ms`,
      results,
    });
  } catch (error: any) {
    logError("process-all", error);
    const duration = Date.now() - startTime;
    log(`\n[FAILED] Processing failed after ${duration}ms`);
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
      opportunity: !!OPPORTUNITY_WEBHOOK,
    },
  });
});

// =====================================================================
// EXPORTS
// =====================================================================

export default router;
