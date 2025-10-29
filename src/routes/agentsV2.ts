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
 * Process monthly agents (Summary + Opportunity) for a single client
 * Returns outputs in memory without saving to DB
 */
async function processMonthlyAgents(
  account: any,
  oauth2Client: any,
  monthRange: ReturnType<typeof getPreviousMonthRange>
): Promise<{
  success: boolean;
  summaryOutput?: any;
  opportunityOutput?: any;
  summaryPayload?: any;
  opportunityPayload?: any;
  rawData?: any;
  skipped?: boolean;
  error?: string;
}> {
  const { id: googleAccountId, domain_name: domain } = account;
  const { startDate, endDate } = monthRange;

  log(
    `  [MONTHLY] Processing Summary + Opportunity for ${domain} (${startDate} to ${endDate})`
  );

  try {
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

    log(`  [MONTHLY] Waiting 15 seconds before Opportunity agent...`);
    await delay(15000); // 15-second delay before Opportunity

    log(`  [MONTHLY] ✓ Summary completed successfully`);

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

    return {
      success: true,
      summaryOutput,
      opportunityOutput,
      summaryPayload,
      opportunityPayload,
      rawData,
    };
  } catch (error: any) {
    logError("processMonthlyAgents", error);
    return { success: false, error: error?.message || String(error) };
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
      // Create OAuth2 client for this account
      log(`[CLIENT] Creating OAuth2 client`);
      const oauth2Client = await createOAuth2ClientForAccount(googleAccountId);

      // Force token refresh to ensure validity
      try {
        log(`[CLIENT] Refreshing OAuth token for account ${googleAccountId}`);
        await oauth2Client.refreshAccessToken();

        const credentials = oauth2Client.credentials;

        log(`[CLIENT] Credentials status after refresh:`);
        log(`  - Has access token: ${!!credentials?.access_token}`);
        log(`  - Has refresh token: ${!!credentials?.refresh_token}`);
        log(
          `  - Token expiry: ${
            credentials?.expiry_date
              ? new Date(credentials.expiry_date).toISOString()
              : "unknown"
          }`
        );
        log(`  - Scopes: ${credentials?.scope || "not available"}`);

        if (credentials.access_token) {
          const expiryDate = credentials.expiry_date
            ? new Date(credentials.expiry_date)
            : new Date(Date.now() + 3600000);

          await db("google_accounts").where({ id: googleAccountId }).update({
            access_token: credentials.access_token,
            expiry_date: expiryDate,
            updated_at: new Date(),
          });

          log(
            `[CLIENT] ✓ Token refreshed successfully. Expires: ${expiryDate.toISOString()}`
          );
        }
      } catch (refreshError: any) {
        logError(`Token refresh for account ${googleAccountId}`, refreshError);
        throw new Error(
          `Authentication failed: Unable to refresh token - ${refreshError.message}`
        );
      }

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
          log(`[CLIENT] Waiting 15 seconds before monthly agents...`);
          await delay(15000);

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

      // Add delay between clients if there are more to process
      if (accounts.indexOf(account) < accounts.length - 1) {
        log(`\n[SETUP] Waiting 15 seconds before next client...`);
        await delay(15000);
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
