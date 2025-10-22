/**
 * Proofline Agent Integration Routes
 *
 * Main endpoints for weekly data processing and agent insights.
 * Implements logging to src/logs/agent-run.log for all operations.
 */

import express, { Request, Response } from "express";
import { db } from "../database/connection";
import {
  tokenRefreshMiddleware,
  AuthenticatedRequest,
} from "../middleware/tokenRefresh";
// import { getPreviousWeekDates, isValidWeekRange } from "../utils/weekDates";
import { fetchAllServiceDataForRange, fetchAllServiceDataForDay } from "../services/dataFetcher";
import {
  callAgentWebhooks,
  compileProoflineDailyPayload,
  compileMonthlySummaryPayload,
  compileMonthlyOpportunityPayload,
  PROOFLINE_AGENT_WEBHOOK,
  SUMMARY_AGENT_WEBHOOK,
  OPPORTUNITY_AGENT_WEBHOOK,
} from "../services/agentWebhook";
import * as fs from "fs";
import * as path from "path";

const router = express.Router();

// =====================================================================
// CONFIGURATION
// =====================================================================

const LOG_DIR = path.join(__dirname, "../logs");
const LOG_FILE = path.join(LOG_DIR, "agent-run.log");

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// =====================================================================
// LOGGING UTILITIES
// =====================================================================

/**
 * Appends a log message to agent-run.log
 */
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

/**
 * Logs an error with stack trace
 */
function logError(operation: string, error: any): void {
  const errorMessage = `ERROR in ${operation}: ${error.message || error}`;
  const stackTrace = error.stack ? `\nStack: ${error.stack}` : "";
  log(`${errorMessage}${stackTrace}`);
}

// =====================================================================
// DATE HELPERS (Daily/Monthly)
// =====================================================================

function formatDate(d: Date) {
  return d.toISOString().split("T")[0];
}

function getYesterdayAndTwoDaysAgo(baseDate?: string): {
  yesterday: string;
  twoDaysAgo: string;
} {
  const base = baseDate ? new Date(baseDate) : new Date();
  const y = new Date(base);
  y.setDate(y.getDate() - 1);
  y.setHours(0, 0, 0, 0);
  const two = new Date(base);
  two.setDate(two.getDate() - 2);
  two.setHours(0, 0, 0, 0);
  return { yesterday: formatDate(y), twoDaysAgo: formatDate(two) };
}

function getPreviousMonthRange(referenceDate?: string): {
  startDate: string;
  endDate: string;
} {
  const now = referenceDate ? new Date(referenceDate) : new Date();
  // previous month: from first day to last day
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  return { startDate: formatDate(start), endDate: formatDate(end) };
}


// =====================================================================
// ROUTE 1B: POST /api/agents/process-daily
// =====================================================================

/**
 * Daily processing: runs the Proofline agent with data for last two days and yesterday.
 * Optionally accepts a reference date in body (YYYY-MM-DD); defaults to today.
 */
router.post(
  "/process-daily",
  tokenRefreshMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const startTime = Date.now();
    try {
      const googleAccountId = req.googleAccountId;
      const { referenceDate } = req.body || {};

      log("==========================================");
      log("POST /api/agents/process-daily - Starting");
      log(`Google Account ID: ${googleAccountId}`);
      if (referenceDate) log(`Reference Date: ${referenceDate}`);

      // Validate account id
      if (!googleAccountId || googleAccountId > 1000000) {
        log(`ERROR: Invalid googleAccountId: ${googleAccountId}`);
        return res.status(400).json({
          success: false,
          error: "INVALID_ACCOUNT_ID",
          message:
            "x-google-account-id header must be the database ID (e.g., 1, 2, 3)",
        });
      }

      // Resolve domain
      const account = await db("google_accounts")
        .where({ id: googleAccountId })
        .select("domain_name")
        .first();

      if (!account || !account.domain_name) {
        log(`ERROR: No domain found for account ${googleAccountId}`);
        return res.status(400).json({
          success: false,
          error: "NO_DOMAIN",
          message: "No domain_name found for this account.",
        });
      }
      const domain = account.domain_name;
      log(`Domain: ${domain}`);

      // Compute dates
      const { yesterday, twoDaysAgo } = getYesterdayAndTwoDaysAgo(referenceDate);
      const lastTwoStart = twoDaysAgo;
      const lastTwoEnd = yesterday;
      log(`Daily ranges: lastTwoDays=${lastTwoStart}..${lastTwoEnd}, yesterday=${yesterday}`);

      // Duplicate guard: use the two-day range as the result's range
      const existing = await db("agent_results")
        .where({
          date_start: lastTwoStart,
          date_end: lastTwoEnd,
          domain,
          agent_name: "proofline",
        })
        .whereIn("status", ["pending", "approved"])
        .first();
      if (existing) {
        log(`Daily result already exists (id ${existing.id}, status ${existing.status})`);
        return res.json({
          success: true,
          message: "Daily result already exists",
          domain,
          resultId: existing.id,
          status: existing.status,
          insights: existing.agent_response,
        });
      }

      // Fetch service data for both ranges in parallel
      log("=== STEP 1: Fetching service data for daily ranges ===");
      const [lastTwoDaysData, yesterdayData] = await Promise.all([
        fetchAllServiceDataForRange({
          oauth2Client: req.oauth2Client!,
          googleAccountId: googleAccountId!,
          startDate: lastTwoStart,
          endDate: lastTwoEnd,
        }),
        fetchAllServiceDataForDay(req.oauth2Client!, googleAccountId!, yesterday),
      ]);

      // Store raw data rows (one for each range)
      log("=== STEP 2: Storing raw service data (daily) ===");
      await db("google_data_store").insert([
        {
          date_start: lastTwoStart,
          date_end: lastTwoEnd,
          domain,
          run_type: "daily",
          agent_name: "proofline",
          ga4_data: lastTwoDaysData.ga4Data,
          gbp_data: lastTwoDaysData.gbpData,
          gsc_data: lastTwoDaysData.gscData,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          date_start: yesterday,
          date_end: yesterday,
          domain,
          run_type: "daily",
          agent_name: "proofline",
          ga4_data: yesterdayData.ga4Data,
          gbp_data: yesterdayData.gbpData,
          gsc_data: yesterdayData.gscData,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      // Build payload for Proofline daily agent
      log("=== STEP 3: Calling Proofline (daily) ===");
      const payload = compileProoflineDailyPayload({
        domain,
        lastTwoDays: {
          startDate: lastTwoStart,
          endDate: lastTwoEnd,
          serviceData: lastTwoDaysData,
        },
        yesterday: { date: yesterday, serviceData: yesterdayData },
      });

      const agentResults = await callAgentWebhooks(payload, log, [
        PROOFLINE_AGENT_WEBHOOK,
      ]);
      const prooflineResult = agentResults[0];
      const [resultId] = await db("agent_results")
        .insert({
          date_start: lastTwoStart,
          date_end: lastTwoEnd,
          domain,
          agent_name: "proofline",
          agent_response: prooflineResult,
          status: prooflineResult?.success ? "pending" : "error",
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("id");

      const duration = Date.now() - startTime;
      log(`=== DAILY COMPLETE: Result ID ${resultId} created in ${duration}ms ===`);
      log("==========================================");

      return res.json({
        success: true,
        domain,
        resultId,
        agentResponse: prooflineResult,
        duration: `${duration}ms`,
      });
    } catch (error: any) {
      logError("process-daily", error);
      const duration = Date.now() - startTime;
      log(`=== DAILY FAILED after ${duration}ms ===`);
      log("==========================================");
      return res.status(500).json({
        success: false,
        error: "PROCESSING_ERROR",
        message: error.message || "Failed to process daily data",
      });
    }
  }
);

// =====================================================================
// ROUTE 1C: POST /api/agents/process-monthly
// =====================================================================

/**
 * Monthly processing: runs Summary first, then Opportunity using Summary output.
 * Optionally accepts a reference date in body to anchor "previous month".
 */
router.post(
  "/process-monthly",
  tokenRefreshMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const startTime = Date.now();
    try {
      const googleAccountId = req.googleAccountId;
      const { referenceDate } = req.body || {};

      log("==========================================");
      log("POST /api/agents/process-monthly - Starting");
      log(`Google Account ID: ${googleAccountId}`);
      if (referenceDate) log(`Reference Date: ${referenceDate}`);

      if (!googleAccountId || googleAccountId > 1000000) {
        log(`ERROR: Invalid googleAccountId: ${googleAccountId}`);
        return res.status(400).json({
          success: false,
          error: "INVALID_ACCOUNT_ID",
          message:
            "x-google-account-id header must be the database ID (e.g., 1, 2, 3)",
        });
      }

      const account = await db("google_accounts")
        .where({ id: googleAccountId })
        .select("domain_name")
        .first();
      if (!account || !account.domain_name) {
        log(`ERROR: No domain found for account ${googleAccountId}`);
        return res.status(400).json({
          success: false,
          error: "NO_DOMAIN",
          message: "No domain_name found for this account.",
        });
      }
      const domain = account.domain_name;

      const { startDate, endDate } = getPreviousMonthRange(referenceDate);
      log(`Monthly range: ${startDate}..${endDate}`);

      // Duplicate block for monthly
      const existingSummary = await db("agent_results")
        .where({ date_start: startDate, date_end: endDate, domain, agent_name: "summary" })
        .whereIn("status", ["pending", "approved"])
        .first();
      if (existingSummary) {
        log(`Monthly summary already exists (id ${existingSummary.id}, status ${existingSummary.status})`);
        return res.json({
          success: true,
          message: "Monthly result already exists",
          domain,
          summaryResultId: existingSummary.id,
          status: existingSummary.status,
        });
      }

      // Fetch aggregated month data
      log("=== STEP 1: Fetching service data for month ===");
      const monthData = await fetchAllServiceDataForRange({
        oauth2Client: req.oauth2Client!,
        googleAccountId: googleAccountId!,
        startDate,
        endDate,
      });

      // Persist raw month data
      log("=== STEP 2: Storing raw service data (monthly) ===");
      await db("google_data_store").insert([
        {
          date_start: startDate,
          date_end: endDate,
          domain,
          run_type: "monthly",
          agent_name: "summary",
          ga4_data: monthData.ga4Data,
          gbp_data: monthData.gbpData,
          gsc_data: monthData.gscData,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          date_start: startDate,
          date_end: endDate,
          domain,
          run_type: "monthly",
          agent_name: "opportunity",
          ga4_data: monthData.ga4Data,
          gbp_data: monthData.gbpData,
          gsc_data: monthData.gscData,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      // Run Summary agent
      log("=== STEP 3: Calling Summary (monthly) ===");
      const summaryPayload = compileMonthlySummaryPayload({
        domain,
        startDate,
        endDate,
        serviceData: monthData,
      });
      const [summaryResult] = await callAgentWebhooks(summaryPayload, log, [
        SUMMARY_AGENT_WEBHOOK,
      ]);

      // Run Opportunity agent with Summary output
      log("=== STEP 4: Calling Opportunity (monthly) ===");
      const opportunityPayload = compileMonthlyOpportunityPayload({
        domain,
        startDate,
        endDate,
        serviceData: monthData,
        summaryResponse: summaryResult?.data,
      });
      const [opportunityResult] = await callAgentWebhooks(
        opportunityPayload,
        log,
        [OPPORTUNITY_AGENT_WEBHOOK]
      );

      // Save Summary row
      const [summaryId] = await db("agent_results")
        .insert({
          date_start: startDate,
          date_end: endDate,
          domain,
          agent_name: "summary",
          agent_response: summaryResult,
          status: summaryResult?.success ? "pending" : "error",
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("id");

      // Save Opportunity row
      const [opportunityId] = await db("agent_results")
        .insert({
          date_start: startDate,
          date_end: endDate,
          domain,
          agent_name: "opportunity",
          agent_response: opportunityResult,
          status: opportunityResult?.success ? "pending" : "error",
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("id");

      const duration = Date.now() - startTime;
      log(
        `=== MONTHLY COMPLETE: Summary ID ${summaryId}, Opportunity ID ${opportunityId} in ${duration}ms ===`
      );
      log("==========================================");
      return res.json({
        success: true,
        domain,
        summaryResultId: summaryId,
        opportunityResultId: opportunityId,
        duration: `${duration}ms`,
      });
    } catch (error: any) {
      logError("process-monthly", error);
      const duration = Date.now() - startTime;
      log(`=== MONTHLY FAILED after ${duration}ms ===`);
      log("==========================================");
      return res.status(500).json({
        success: false,
        error: "PROCESSING_ERROR",
        message: error.message || "Failed to process monthly data",
      });
    }
  }
);

// =====================================================================
// ROUTE 1D: POST /api/agents/process
// =====================================================================

/**
 * Single daily endpoint that:
 * - Always runs the daily Proofline agent (last two days + yesterday)
 * - Conditionally runs monthly (Summary then Opportunity) if previous month is complete and no monthly result exists yet
 * Body: { referenceDate?: YYYY-MM-DD }
 */
router.post(
  "/process",
  tokenRefreshMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const startTimeAll = Date.now();
    const runs: any = { daily: null, monthly: null };
    try {
      const googleAccountId = req.googleAccountId;
      const { referenceDate } = req.body || {};

      log("==========================================");
      log("POST /api/agents/process - Starting (daily + conditional monthly)");
      log(`Google Account ID: ${googleAccountId}`);
      if (referenceDate) log(`Reference Date: ${referenceDate}`);

      if (!googleAccountId || googleAccountId > 1000000) {
        log(`ERROR: Invalid googleAccountId: ${googleAccountId}`);
        return res.status(400).json({
          success: false,
          error: "INVALID_ACCOUNT_ID",
          message:
            "x-google-account-id header must be the database ID (e.g., 1, 2, 3)",
        });
      }

      const account = await db("google_accounts")
        .where({ id: googleAccountId })
        .select("domain_name")
        .first();
      if (!account || !account.domain_name) {
        log(`ERROR: No domain found for account ${googleAccountId}`);
        return res.status(400).json({
          success: false,
          error: "NO_DOMAIN",
          message: "No domain_name found for this account.",
        });
      }
      const domain = account.domain_name;

      // ------------------------
      // Run DAILY (always)
      // ------------------------
      const startTimeDaily = Date.now();
      try {
        const { yesterday, twoDaysAgo } = getYesterdayAndTwoDaysAgo(referenceDate);
        const lastTwoStart = twoDaysAgo;
        const lastTwoEnd = yesterday;
        log(
          `DAILY ranges: lastTwoDays=${lastTwoStart}..${lastTwoEnd}, yesterday=${yesterday}`
        );

        // Guard duplicate by the 2-day range
      const existingDaily = await db("agent_results")
        .where({
          date_start: lastTwoStart,
          date_end: lastTwoEnd,
          domain,
          agent_name: "proofline",
        })
        .whereIn("status", ["pending", "approved"])
        .first();
        if (existingDaily) {
          log(
            `Daily result already exists (id ${existingDaily.id}, status ${existingDaily.status})`
          );
          runs.daily = {
            skipped: true,
            reason: "existing",
            resultId: existingDaily.id,
            status: existingDaily.status,
          };
        } else {
          // Fetch data
          log("=== DAILY STEP 1: Fetching service data ===");
          const [lastTwoDaysData, yesterdayData] = await Promise.all([
            fetchAllServiceDataForRange({
              oauth2Client: req.oauth2Client!,
              googleAccountId: googleAccountId!,
              startDate: lastTwoStart,
              endDate: lastTwoEnd,
            }),
            fetchAllServiceDataForDay(
              req.oauth2Client!,
              googleAccountId!,
              yesterday
            ),
          ]);

          // Store raw rows
          log("=== DAILY STEP 2: Storing raw data ===");
          await db("google_data_store").insert([
            {
              date_start: lastTwoStart,
              date_end: lastTwoEnd,
              domain,
              run_type: "daily",
              agent_name: "proofline",
              ga4_data: lastTwoDaysData.ga4Data,
              gbp_data: lastTwoDaysData.gbpData,
              gsc_data: lastTwoDaysData.gscData,
              created_at: new Date(),
              updated_at: new Date(),
            },
            {
              date_start: yesterday,
              date_end: yesterday,
              domain,
              run_type: "daily",
              agent_name: "proofline",
              ga4_data: yesterdayData.ga4Data,
              gbp_data: yesterdayData.gbpData,
              gsc_data: yesterdayData.gscData,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ]);

          // Call Proofline daily agent
          log("=== DAILY STEP 3: Calling Proofline ===");
          const payload = compileProoflineDailyPayload({
            domain,
            lastTwoDays: {
              startDate: lastTwoStart,
              endDate: lastTwoEnd,
              serviceData: lastTwoDaysData,
            },
            yesterday: { date: yesterday, serviceData: yesterdayData },
          });

          const dailyResults = await callAgentWebhooks(payload, log, [
            PROOFLINE_AGENT_WEBHOOK,
          ]);
          const prooflineResult = dailyResults[0];
          const [dailyId] = await db("agent_results")
            .insert({
              date_start: lastTwoStart,
              date_end: lastTwoEnd,
              domain,
              agent_name: "proofline",
              agent_response: prooflineResult,
              status: prooflineResult?.success ? "pending" : "error",
              created_at: new Date(),
              updated_at: new Date(),
            })
            .returning("id");
          runs.daily = { skipped: false, resultId: dailyId };
        }
      } catch (e: any) {
        logError("process (daily)", e);
        runs.daily = { error: e.message || String(e) };
      }

      // ------------------------
      // Conditionally run MONTHLY
      // ------------------------
      try {
        const { startDate, endDate } = getPreviousMonthRange(referenceDate);
        // matured if today > endDate
        const today = referenceDate
          ? new Date(referenceDate)
          : new Date();
        const end = new Date(endDate + "T23:59:59Z");
        const matured = today.getTime() > end.getTime();

        // Already exists?
        const existingMonthly = await db("agent_results")
          .where({ date_start: startDate, date_end: endDate, domain, agent_name: "summary" })
          .whereIn("status", ["pending", "approved"])
          .first();

        if (!matured) {
          runs.monthly = { skipped: true, reason: "not_matured", startDate, endDate };
        } else if (existingMonthly) {
          runs.monthly = {
            skipped: true,
            reason: "existing",
            resultId: existingMonthly.id,
            status: existingMonthly.status,
            startDate,
            endDate,
          };
        } else {
          log(`MONTHLY due for ${startDate}..${endDate}`);
          // Fetch month data
          log("=== MONTHLY STEP 1: Fetching month data ===");
          const monthData = await fetchAllServiceDataForRange({
            oauth2Client: req.oauth2Client!,
            googleAccountId: googleAccountId!,
            startDate,
            endDate,
          });

          // Store raw
          log("=== MONTHLY STEP 2: Storing raw data ===");
          await db("google_data_store").insert([
            {
              date_start: startDate,
              date_end: endDate,
              domain,
              run_type: "monthly",
              agent_name: "summary",
              ga4_data: monthData.ga4Data,
              gbp_data: monthData.gbpData,
              gsc_data: monthData.gscData,
              created_at: new Date(),
              updated_at: new Date(),
            },
            {
              date_start: startDate,
              date_end: endDate,
              domain,
              run_type: "monthly",
              agent_name: "opportunity",
              ga4_data: monthData.ga4Data,
              gbp_data: monthData.gbpData,
              gsc_data: monthData.gscData,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ]);

          // Call Summary then Opportunity
          log("=== MONTHLY STEP 3: Calling Summary ===");
          const summaryPayload = compileMonthlySummaryPayload({
            domain,
            startDate,
            endDate,
            serviceData: monthData,
          });
          const [summaryResult] = await callAgentWebhooks(summaryPayload, log, [
            SUMMARY_AGENT_WEBHOOK,
          ]);

          log("=== MONTHLY STEP 4: Calling Opportunity ===");
          const opportunityPayload = compileMonthlyOpportunityPayload({
            domain,
            startDate,
            endDate,
            serviceData: monthData,
            summaryResponse: summaryResult?.data,
          });
          const [opportunityResult] = await callAgentWebhooks(
            opportunityPayload,
            log,
            [OPPORTUNITY_AGENT_WEBHOOK]
          );

          const [summaryId] = await db("agent_results")
            .insert({
              date_start: startDate,
              date_end: endDate,
              domain,
              agent_name: "summary",
              agent_response: summaryResult,
              status: summaryResult?.success ? "pending" : "error",
              created_at: new Date(),
              updated_at: new Date(),
            })
            .returning("id");

          const [opportunityId] = await db("agent_results")
            .insert({
              date_start: startDate,
              date_end: endDate,
              domain,
              agent_name: "opportunity",
              agent_response: opportunityResult,
              status: opportunityResult?.success ? "pending" : "error",
              created_at: new Date(),
              updated_at: new Date(),
            })
            .returning("id");
          runs.monthly = {
            skipped: false,
            summaryResultId: summaryId,
            opportunityResultId: opportunityId,
            startDate,
            endDate,
          };
        }
      } catch (e: any) {
        logError("process (monthly)", e);
        runs.monthly = { error: e.message || String(e) };
      }

      const durationAll = Date.now() - startTimeAll;
      log(`=== PROCESS COMPLETE in ${durationAll}ms ===`);
      log("==========================================");
      return res.json({ success: true, domain, runs, duration: `${durationAll}ms` });
    } catch (error: any) {
      logError("process (combined)", error);
      const durationAll = Date.now() - startTimeAll;
      log(`=== PROCESS FAILED after ${durationAll}ms ===`);
      log("==========================================");
      return res.status(500).json({
        success: false,
        error: "PROCESSING_ERROR",
        message: error.message || "Failed to process agents",
      });
    }
  }
);

// =====================================================================
// ROUTE 2: GET /api/agents/results
// =====================================================================

/**
 * Retrieve paginated list of all agent results with filtering
 */
router.get("/results", async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      domain,
      startDate,
      endDate,
      agentName,
    } = req.query as any;

    log(
      `GET /api/agents/results - page=${page}, limit=${limit}, status=${status}, domain=${domain}`
    );

    const pageNum = Math.max(parseInt(page as string, 10) || 1, 1);
    const limitNum = Math.min(
      Math.max(parseInt(limit as string, 10) || 20, 1),
      100
    );

    // Build base query for filtering
    let baseQuery = db("agent_results");

    if (status) {
      baseQuery = baseQuery.where("status", status as string);
    }

    if (domain) {
      baseQuery = baseQuery.where("domain", domain as string);
    }

    if (agentName) {
      baseQuery = baseQuery.where("agent_name", agentName as string);
    }

    if (startDate) {
      baseQuery = baseQuery.where("date_start", ">=", startDate as string);
    }

    if (endDate) {
      baseQuery = baseQuery.where("date_end", "<=", endDate as string);
    }

    // Get total count with a separate query
    const totalResult = await baseQuery.clone().count("* as total");
    const total = Number(totalResult?.[0]?.total ?? 0);

    // Get paginated results
    const results = await baseQuery
      .clone()
      .select("*")
      .orderBy("created_at", "desc")
      .limit(limitNum)
      .offset((pageNum - 1) * limitNum);

    const totalPages = Math.ceil(total / limitNum);

    log(`Results returned: ${results.length} of ${total} total`);

    return res.json({
      success: true,
      data: results.map((r) => ({
        id: r.id,
        dateStart: r.date_start,
        dateEnd: r.date_end,
        weekStart: r.date_start, // compat alias
        weekEnd: r.date_end, // compat alias
        domain: r.domain,
        status: r.status,
        agentName: r.agent_name,
        agentResponse: r.agent_response,
        insights: r.agent_response, // compat alias
        approvedBy: r.approved_by,
        approvedAt: r.approved_at,
        createdAt: r.created_at,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
      },
    });
  } catch (error: any) {
    logError("GET /results", error);
    return res.status(500).json({
      success: false,
      error: "QUERY_ERROR",
      message: "Failed to fetch results",
    });
  }
});

// =====================================================================
// ROUTE 3: GET /api/agents/latest
// =====================================================================

/**
 * Get the most recent agent result for a specific location
 */
router.get("/latest", async (req: Request, res: Response) => {
  try {
    const { domain, agentName } = req.query as any;

    log(`GET /api/agents/latest - domain=${domain}`);

    if (!domain) {
      return res.status(400).json({
        success: false,
        error: "MISSING_PARAMETER",
        message: "domain is required",
      });
    }

    let base = db("agent_results").where("domain", domain as string);
    if (agentName) base = base.andWhere("agent_name", agentName as string);
    const result = await base.orderBy("created_at", "desc").first();

    if (!result) {
      log(`No results found for domain: ${domain}`);
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "No results found for this domain",
      });
    }

    log(`Latest result found: ID ${result.id}, status: ${result.status}`);

    return res.json({
      success: true,
      data: {
        id: result.id,
        dateStart: result.date_start,
        dateEnd: result.date_end,
        weekStart: result.date_start, // compat alias
        weekEnd: result.date_end, // compat alias
        domain: result.domain,
        status: result.status,
        agentName: result.agent_name,
        agentResponse: result.agent_response,
        insights: result.agent_response, // compat alias
        approvedBy: result.approved_by,
        approvedAt: result.approved_at,
        createdAt: result.created_at,
      },
    });
  } catch (error: any) {
    logError("GET /latest", error);
    return res.status(500).json({
      success: false,
      error: "QUERY_ERROR",
      message: "Failed to fetch latest result",
    });
  }
});

// =====================================================================
// ROUTE 4: POST /api/agents/approve
// =====================================================================

/**
 * Approve or reject agent results with optional feedback
 */
router.post("/approve", async (req: Request, res: Response) => {
  try {
    const { resultId, status, approvedBy, feedback } = req.body;

    log(
      `POST /api/agents/approve - resultId=${resultId}, status=${status}, approvedBy=${approvedBy}`
    );

    // Validation
    if (!resultId || !status || !approvedBy) {
      return res.status(400).json({
        success: false,
        error: "MISSING_PARAMETERS",
        message: "resultId, status, and approvedBy are required",
      });
    }

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_STATUS",
        message: "status must be 'approved' or 'rejected'",
      });
    }

    // Check if result exists
    const result = await db("agent_results").where("id", resultId).first();

    if (!result) {
      log(`ERROR: Result ${resultId} not found`);
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Result not found",
      });
    }

    // Update result
    const updateData: any = {
      status,
      approved_by: approvedBy,
      approved_at: new Date(),
      updated_at: new Date(),
    };

    if (feedback) {
      updateData.agent_response = {
        ...result.agent_response,
        feedback,
      };
    }

    await db("agent_results").where("id", resultId).update(updateData);

    log(`Result ${resultId} ${status} by ${approvedBy}`);

    // Fetch updated result
    const updatedResult = await db("agent_results")
      .where("id", resultId)
      .first();

    return res.json({
      success: true,
      message: `Result ${status} successfully`,
      data: {
        id: updatedResult.id,
        status: updatedResult.status,
        approvedBy: updatedResult.approved_by,
        approvedAt: updatedResult.approved_at,
      },
    });
  } catch (error: any) {
    logError("POST /approve", error);
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: "Failed to update approval status",
    });
  }
});

// =====================================================================
// ROUTE 5: PUT /api/agents/update-response
// =====================================================================

/**
 * Update agent_response for a specific result
 */
router.put("/update-response", async (req: Request, res: Response) => {
  try {
    const { resultId, agentResponse } = req.body;

    log(`PUT /api/agents/update-response - resultId=${resultId}`);

    // Validation
    if (!resultId || !agentResponse) {
      return res.status(400).json({
        success: false,
        error: "MISSING_PARAMETERS",
        message: "resultId and agentResponse are required",
      });
    }

    // Check if result exists
    const result = await db("agent_results").where("id", resultId).first();

    if (!result) {
      log(`ERROR: Result ${resultId} not found`);
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Result not found",
      });
    }

    // Update result
    await db("agent_results").where("id", resultId).update({
      agent_response: agentResponse,
      updated_at: new Date(),
    });

    log(`Result ${resultId} agent_response updated successfully`);

    // Fetch updated result
    const updatedResult = await db("agent_results")
      .where("id", resultId)
      .first();

    return res.json({
      success: true,
      message: "Agent response updated successfully",
      data: {
        id: updatedResult.id,
        dateStart: updatedResult.date_start,
        dateEnd: updatedResult.date_end,
        weekStart: updatedResult.date_start, // compat alias
        weekEnd: updatedResult.date_end, // compat alias
        domain: updatedResult.domain,
        status: updatedResult.status,
        agentName: updatedResult.agent_name,
        agentResponse: updatedResult.agent_response,
        insights: updatedResult.agent_response, // compat alias
        approvedBy: updatedResult.approved_by,
        approvedAt: updatedResult.approved_at,
        createdAt: updatedResult.created_at,
      },
    });
  } catch (error: any) {
    logError("PUT /update-response", error);
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: "Failed to update agent response",
    });
  }
});

// =====================================================================
// ROUTE 6: GET /api/agents/weekly-data
// =====================================================================

/**
 * Retrieve raw Google data stored for a specific week
 */
router.get("/weekly-data", async (req: Request, res: Response) => {
  try {
    const { weekStart, weekEnd, dateStart, dateEnd, domain } = req.query as any;

    const start = (dateStart as string) || (weekStart as string);
    const end = (dateEnd as string) || (weekEnd as string);

    log(`GET /api/agents/weekly-data - domain=${domain}, range=${start} to ${end}`);

    // Validation
    if (!start || !end || !domain) {
      return res.status(400).json({
        success: false,
        error: "MISSING_PARAMETERS",
        message: "dateStart, dateEnd, and domain are required",
      });
    }

    // Fetch raw data
    const data = await db("google_data_store")
      .where({
        date_start: start,
        date_end: end,
        domain: domain as string,
      })
      .first();

    if (!data) {
      log(`No data found for domain: ${domain}, range: ${start} to ${end}`);
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "No data found for this range and location",
      });
    }

    log(`Weekly data found: ID ${data.id}`);

    return res.json({
      success: true,
      data: {
        id: data.id,
        dateStart: data.date_start,
        dateEnd: data.date_end,
        weekStart: data.date_start, // compat alias
        weekEnd: data.date_end, // compat alias
        domain: data.domain,
        runType: data.run_type,
        agentName: data.agent_name,
        ga4Data: data.ga4_data,
        gbpData: data.gbp_data,
        gscData: data.gsc_data,
        createdAt: data.created_at,
      },
    });
  } catch (error: any) {
    logError("GET /weekly-data", error);
    return res.status(500).json({
      success: false,
      error: "QUERY_ERROR",
      message: "Failed to fetch weekly data",
    });
  }
});

// =====================================================================
// ROUTE 6B: GET /api/agents/data
// =====================================================================

/**
 * Retrieve raw Google data for a domain and date range, optional agentName filter.
 * Query: domain (required), dateStart, dateEnd (required), agentName (optional)
 */
router.get("/data", async (req: Request, res: Response) => {
  try {
    const { domain, dateStart, dateEnd, agentName } = req.query as any;

    log(
      `GET /api/agents/data - domain=${domain}, range=${dateStart} to ${dateEnd}, agentName=${agentName}`
    );

    if (!domain || !dateStart || !dateEnd) {
      return res.status(400).json({
        success: false,
        error: "MISSING_PARAMETERS",
        message: "domain, dateStart, and dateEnd are required",
      });
    }

    let base = db("google_data_store")
      .where({ domain: domain as string })
      .andWhere("date_start", dateStart as string)
      .andWhere("date_end", dateEnd as string);

    if (agentName) base = base.andWhere("agent_name", agentName as string);

    const rows = await base.orderBy("created_at", "desc");

    return res.json({
      success: true,
      data: rows.map((data: any) => ({
        id: data.id,
        dateStart: data.date_start,
        dateEnd: data.date_end,
        weekStart: data.date_start, // compat alias
        weekEnd: data.date_end, // compat alias
        domain: data.domain,
        runType: data.run_type,
        agentName: data.agent_name,
        ga4Data: data.ga4_data,
        gbpData: data.gbp_data,
        gscData: data.gsc_data,
        createdAt: data.created_at,
      })),
    });
  } catch (error: any) {
    logError("GET /data", error);
    return res.status(500).json({
      success: false,
      error: "QUERY_ERROR",
      message: "Failed to fetch data",
    });
  }
});

// =====================================================================
// ROUTE 7: GET /api/agents/account-info
// =====================================================================

/**
 * Diagnostic endpoint to help users find their database account ID
 * Looks up by email or domain
 */
router.get("/account-info", async (req: Request, res: Response) => {
  try {
    const { email, domain } = req.query;

    log(`GET /api/agents/account-info - email=${email}, domain=${domain}`);

    if (!email && !domain) {
      return res.status(400).json({
        success: false,
        error: "MISSING_PARAMETER",
        message: "Provide either 'email' or 'domain' query parameter",
        example: "/api/agents/account-info?email=user@example.com",
      });
    }

    let accounts;
    if (email) {
      accounts = await db("google_accounts")
        .where("email", email as string)
        .select("id", "email", "domain_name", "onboarding_completed")
        .limit(10);
    } else {
      accounts = await db("google_accounts")
        .where("domain_name", domain as string)
        .select("id", "email", "domain_name", "onboarding_completed")
        .limit(10);
    }

    if (accounts.length === 0) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "No accounts found with that email or domain",
      });
    }

    log(`Found ${accounts.length} account(s)`);

    return res.json({
      success: true,
      message: "Use the 'id' field as x-google-account-id header",
      accounts: accounts.map((a) => ({
        id: a.id,
        email: a.email,
        domain: a.domain_name,
        onboarded: a.onboarding_completed,
      })),
    });
  } catch (error: any) {
    logError("GET /account-info", error);
    return res.status(500).json({
      success: false,
      error: "QUERY_ERROR",
      message: "Failed to fetch account info",
    });
  }
});

// =====================================================================
// EXPORTS
// =====================================================================

export default router;
