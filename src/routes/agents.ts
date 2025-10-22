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
import { getPreviousWeekDates, isValidWeekRange } from "../utils/weekDates";
import { fetchAllServiceData } from "../services/dataFetcher";
import {
  callAgentWebhooks,
  compileDataForAgent,
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
// ROUTE 1: POST /api/agents/process-weekly
// =====================================================================

/**
 * Main endpoint to process weekly data and generate agent insights
 * Triggered by N8N or manually for testing
 */
router.post(
  "/process-weekly",
  tokenRefreshMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const startTime = Date.now();

    try {
      const { weekStart, weekEnd } = req.body;
      const googleAccountId = req.googleAccountId;

      log("==========================================");
      log("POST /api/agents/process-weekly - Starting");
      log(`Google Account ID: ${googleAccountId}`);
      log(`Week: ${weekStart} to ${weekEnd}`);

      // Validation
      if (!weekStart || !weekEnd) {
        log("ERROR: Missing required parameters");
        return res.status(400).json({
          success: false,
          error: "MISSING_PARAMETERS",
          message: "weekStart and weekEnd are required",
        });
      }

      // Validate googleAccountId is reasonable (not a huge Google User ID)
      if (!googleAccountId || googleAccountId > 1000000) {
        log(`ERROR: Invalid googleAccountId: ${googleAccountId}`);
        return res.status(400).json({
          success: false,
          error: "INVALID_ACCOUNT_ID",
          message:
            "x-google-account-id header must be the database ID (e.g., 1, 2, 3), not the Google User ID. Query google_accounts table to find your id.",
        });
      }

      // Validate date range
      if (!isValidWeekRange(weekStart, weekEnd)) {
        log("ERROR: Invalid date range - must be exactly 7 days");
        return res.status(400).json({
          success: false,
          error: "INVALID_DATE_RANGE",
          message: "Date range must be exactly 7 days (one week)",
        });
      }

      // Get domain name from google_accounts
      const account = await db("google_accounts")
        .where({ id: googleAccountId })
        .select("domain_name")
        .first();

      if (!account || !account.domain_name) {
        log(`ERROR: No domain found for account ${googleAccountId}`);
        return res.status(400).json({
          success: false,
          error: "NO_DOMAIN",
          message:
            "No domain_name found for this account. Complete onboarding first.",
        });
      }

      const domain = account.domain_name;
      log(`Domain: ${domain}`);

      // Check for duplicate processing
      log("Checking for existing results...");
      const existingResult = await db("agent_results")
        .where({
          week_start: weekStart,
          week_end: weekEnd,
          domain: domain,
        })
        .whereIn("status", ["pending", "approved"])
        .first();

      if (existingResult) {
        log(`Found existing result with status: ${existingResult.status}`);
        return res.json({
          success: true,
          message: "Result already exists",
          weekStart,
          weekEnd,
          domain,
          resultId: existingResult.id,
          status: existingResult.status,
          insights: existingResult.agent_response,
        });
      }

      // Step 1: Fetch service data
      log("=== STEP 1: Fetching service data ===");
      const serviceData = await fetchAllServiceData({
        oauth2Client: req.oauth2Client!,
        googleAccountId: req.googleAccountId!,
        weekStart,
        weekEnd,
      });

      log(
        `Service data fetched: GA4=${!!serviceData.ga4Data}, GSC=${!!serviceData.gscData}, GBP=${!!serviceData.gbpData}, Clarity=${!!serviceData.clarityData}, PMS=${!!serviceData.pmsData}`
      );

      // Step 2: Store raw data in google_data_store
      log("=== STEP 2: Storing raw service data ===");
      await db("google_data_store").insert({
        week_start: weekStart,
        week_end: weekEnd,
        domain: domain,
        ga4_data: serviceData.ga4Data,
        gbp_data: serviceData.gbpData,
        gsc_data: serviceData.gscData,
        created_at: new Date(),
        updated_at: new Date(),
      });

      log("Raw service data stored successfully");

      // Step 3: Call agent webhooks
      log("=== STEP 3: Calling agent webhooks ===");
      const compiledData = compileDataForAgent(
        weekStart,
        weekEnd,
        domain,
        serviceData
      );

      const agentResults = await callAgentWebhooks(compiledData, log);

      // Check if any webhooks succeeded
      const successfulResults = agentResults.filter((r) => r.success);

      if (successfulResults.length === 0) {
        log("ERROR: All agent webhook calls failed");

        // Store error result
        const [errorResultId] = await db("agent_results")
          .insert({
            week_start: weekStart,
            week_end: weekEnd,
            domain: domain,
            agent_response: {
              error: "All agent webhooks failed",
              attempts: agentResults,
            },
            status: "error",
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning("id");

        return res.status(500).json({
          success: false,
          error: "AGENT_WEBHOOKS_FAILED",
          message: "All agent webhook calls failed",
          details: agentResults,
        });
      }

      // Step 4: Store agent results
      log("=== STEP 4: Storing agent results ===");
      const combinedResponse = {
        webhooks: agentResults,
        successCount: successfulResults.length,
        totalCount: agentResults.length,
      };

      const [resultId] = await db("agent_results")
        .insert({
          week_start: weekStart,
          week_end: weekEnd,
          domain: domain,
          agent_response: combinedResponse,
          status: "pending",
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("id");

      const duration = Date.now() - startTime;
      log(`=== COMPLETE: Result ID ${resultId} created in ${duration}ms ===`);
      log("==========================================");

      return res.json({
        success: true,
        weekStart,
        weekEnd,
        domain,
        resultId,
        insights: combinedResponse,
        duration: `${duration}ms`,
      });
    } catch (error: any) {
      logError("process-weekly", error);
      const duration = Date.now() - startTime;
      log(`=== FAILED after ${duration}ms ===`);
      log("==========================================");

      return res.status(500).json({
        success: false,
        error: "PROCESSING_ERROR",
        message: error.message || "Failed to process weekly data",
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
    } = req.query;

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

    if (startDate) {
      baseQuery = baseQuery.where("week_start", ">=", startDate as string);
    }

    if (endDate) {
      baseQuery = baseQuery.where("week_end", "<=", endDate as string);
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
        weekStart: r.week_start,
        weekEnd: r.week_end,
        domain: r.domain,
        status: r.status,
        agentResponse: r.agent_response,
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
    const { domain } = req.query;

    log(`GET /api/agents/latest - domain=${domain}`);

    if (!domain) {
      return res.status(400).json({
        success: false,
        error: "MISSING_PARAMETER",
        message: "domain is required",
      });
    }

    const result = await db("agent_results")
      .where("domain", domain as string)
      .orderBy("created_at", "desc")
      .first();

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
        weekStart: result.week_start,
        weekEnd: result.week_end,
        domain: result.domain,
        status: result.status,
        agentResponse: result.agent_response,
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
        weekStart: updatedResult.week_start,
        weekEnd: updatedResult.week_end,
        domain: updatedResult.domain,
        status: updatedResult.status,
        agentResponse: updatedResult.agent_response,
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
    const { weekStart, weekEnd, domain } = req.query;

    log(
      `GET /api/agents/weekly-data - domain=${domain}, week=${weekStart} to ${weekEnd}`
    );

    // Validation
    if (!weekStart || !weekEnd || !domain) {
      return res.status(400).json({
        success: false,
        error: "MISSING_PARAMETERS",
        message: "weekStart, weekEnd, and domain are required",
      });
    }

    // Fetch raw data
    const data = await db("google_data_store")
      .where({
        week_start: weekStart as string,
        week_end: weekEnd as string,
        domain: domain as string,
      })
      .first();

    if (!data) {
      log(
        `No data found for domain: ${domain}, week: ${weekStart} to ${weekEnd}`
      );
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "No data found for this week and location",
      });
    }

    log(`Weekly data found: ID ${data.id}`);

    return res.json({
      success: true,
      data: {
        id: data.id,
        weekStart: data.week_start,
        weekEnd: data.week_end,
        domain: data.domain,
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
