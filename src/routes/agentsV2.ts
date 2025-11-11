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
import { aggregatePmsData } from "../utils/pmsAggregator";
import { createNotification } from "../utils/notificationHelper";
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
const CRO_OPTIMIZER_WEBHOOK = process.env.CRO_OPTIMIZER_AGENT_WEBHOOK || "";
const COPY_COMPANION_WEBHOOK = process.env.COPY_COMPANION_AGENT_WEBHOOK || "";

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
  croOptimizerOutput?: any;
  summaryPayload?: any;
  opportunityPayload?: any;
  croOptimizerPayload?: any;
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
        };
        log(
          `  [MONTHLY] ✓ Aggregated PMS data found (${aggregated.months.length} months, ${aggregated.sources.length} sources)`
        );
      } else {
        log(`  [MONTHLY] ⚠ No approved PMS data found`);
      }
    } catch (pmsError: any) {
      log(
        `  [MONTHLY] ⚠ Error fetching aggregated PMS data: ${pmsError.message}`
      );
    }

    // Fetch Clarity data for the month
    log(`  [MONTHLY] Fetching Clarity data for ${domain}`);
    let clarityData = null;
    try {
      const clarityResult = await db("clarity_data_store")
        .where({ domain: domain })
        .whereBetween("report_date", [startDate, endDate])
        .orderBy("report_date", "desc")
        .select("*");

      if (clarityResult.length > 0) {
        // Parse the JSON data field and aggregate results
        clarityData = clarityResult.map((row) => ({
          report_date: row.report_date,
          data: typeof row.data === "string" ? JSON.parse(row.data) : row.data,
        }));
        log(`  [MONTHLY] ✓ Found ${clarityData.length} Clarity data record(s)`);
      } else {
        log(`  [MONTHLY] ⚠ No Clarity data found for this period`);
      }
    } catch (clarityError: any) {
      log(`  [MONTHLY] ⚠ Error fetching Clarity data: ${clarityError.message}`);
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
      clarityData,
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

    // === STEP 3: Run CRO Optimizer Agent with retry logic ===
    log(`  [MONTHLY] Waiting 15 seconds before CRO Optimizer agent...`);
    await delay(15000); // 15-second delay before CRO Optimizer

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

    // === STEP 4: Create tasks from action items ===
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

    // === STEP 5: Create tasks from CRO Optimizer action items ===
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

    return {
      success: true,
      summaryOutput,
      opportunityOutput,
      croOptimizerOutput,
      summaryPayload,
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
        // Create OAuth2 client
        log(`[CLIENT] Creating OAuth2 client`);
        const oauth2Client = await createOAuth2ClientForAccount(
          googleAccountId
        );

        // Refresh token
        log(`[CLIENT] Refreshing OAuth token`);
        await oauth2Client.refreshAccessToken();
        const credentials = oauth2Client.credentials;

        if (credentials.access_token) {
          const expiryDate = credentials.expiry_date
            ? new Date(credentials.expiry_date)
            : new Date(Date.now() + 3600000);

          await db("google_accounts").where({ id: googleAccountId }).update({
            access_token: credentials.access_token,
            expiry_date: expiryDate,
            updated_at: new Date(),
          });

          log(`[CLIENT] ✓ Token refreshed`);
        }

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

        // Check for duplicate before saving
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
        } else {
          log(
            `[CLIENT] ℹ Proofline result already exists (ID: ${existingDaily.id})`
          );
        }

        results.push({
          googleAccountId,
          domain,
          success: true,
        });

        log(`[CLIENT] ✓ ${domain} completed successfully`);

        // Delay between clients
        if (accounts.indexOf(account) < accounts.length - 1) {
          log(`\n[SETUP] Waiting 15 seconds before next client...`);
          await delay(15000);
        }
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
 *
 * Body: { googleAccountId: number, domain: string, force?: boolean }
 */
router.post("/monthly-agents-run", async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { googleAccountId, domain, force = false } = req.body;

  log("\n" + "=".repeat(70));
  log("POST /api/agents/monthly-agents-run - STARTING");
  log("=".repeat(70));
  log(`Account ID: ${googleAccountId}`);
  log(`Domain: ${domain}`);
  log(`Force run: ${force}`);
  log(`Timestamp: ${new Date().toISOString()}`);

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

    // Check for existing results unless force=true
    if (!force) {
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
        log(
          `[SETUP] Monthly agents already completed for this period - skipping`
        );
        return res.json({
          success: true,
          message: "Monthly agents already run for this period",
          skipped: true,
          existingResultId: existingSummary.id,
        });
      }
    } else {
      log(`[SETUP] Force mode enabled - will overwrite existing results`);
    }

    // Create OAuth2 client
    log(`[CLIENT] Creating OAuth2 client`);
    const oauth2Client = await createOAuth2ClientForAccount(googleAccountId);

    // Refresh token
    log(`[CLIENT] Refreshing OAuth token`);
    await oauth2Client.refreshAccessToken();
    const credentials = oauth2Client.credentials;

    if (credentials.access_token) {
      const expiryDate = credentials.expiry_date
        ? new Date(credentials.expiry_date)
        : new Date(Date.now() + 3600000);

      await db("google_accounts").where({ id: googleAccountId }).update({
        access_token: credentials.access_token,
        expiry_date: expiryDate,
        updated_at: new Date(),
      });

      log(`[CLIENT] ✓ Token refreshed`);
    }

    // Run monthly agents
    log(`[CLIENT] Running monthly agents (Summary + Opportunity)`);
    const monthlyResult = await processMonthlyAgents(
      account,
      oauth2Client,
      monthRange
    );

    if (!monthlyResult.success) {
      throw new Error(monthlyResult.error || "Monthly agents failed");
    }

    // Save results
    log(`[CLIENT] Saving results to database...`);

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

    // Create notification for completed monthly agents
    try {
      await createNotification(
        domain,
        "Monthly Insights Ready",
        "Your monthly summary and opportunities are now available for review",
        "agent",
        {
          summaryId,
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

    log("\n" + "=".repeat(70));
    log(`[COMPLETE] ✓ Monthly agents completed successfully`);
    log(`  - Summary ID: ${summaryId}`);
    log(`  - Opportunity ID: ${opportunityId}`);
    log(`  - CRO Optimizer ID: ${croOptimizerId}`);
    log(`  - Duration: ${duration}ms (${(duration / 1000).toFixed(1)}s)`);
    log("=".repeat(70) + "\n");

    return res.json({
      success: true,
      message: "Monthly agents completed successfully",
      summaryId,
      opportunityId,
      croOptimizerId,
      duration: `${duration}ms`,
    });
  } catch (error: any) {
    logError("monthly-agents-run", error);
    const duration = Date.now() - startTime;
    log(`\n[FAILED] ❌ Monthly agents failed after ${duration}ms`);
    log("=".repeat(70) + "\n");

    return res.status(500).json({
      success: false,
      error: "MONTHLY_AGENTS_ERROR",
      message: error?.message || "Failed to run monthly agents",
      duration: `${duration}ms`,
    });
  }
});
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

        // Create OAuth2 client
        log(`[CLIENT] Creating OAuth2 client for account ${googleAccountId}`);
        const oauth2Client = await createOAuth2ClientForAccount(
          googleAccountId
        );

        // Refresh token
        log(`[CLIENT] Refreshing OAuth token...`);
        await oauth2Client.refreshAccessToken();
        const credentials = oauth2Client.credentials;

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
            `[CLIENT] ✓ Token refreshed. Expires: ${expiryDate.toISOString()}`
          );
        }

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

        // Delay between clients (except for last one)
        if (accountIndex < gbpAccounts.length) {
          log(`\n[SETUP] Waiting 15 seconds before next client...`);
          await delay(15000);
        }
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
      cro_optimizer: !!CRO_OPTIMIZER_WEBHOOK,
      copy_companion: !!COPY_COMPANION_WEBHOOK,
    },
  });
});

// =====================================================================
// EXPORTS
// =====================================================================

export default router;
