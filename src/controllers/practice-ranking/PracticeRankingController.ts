/**
 * PracticeRankingController
 *
 * HTTP handler layer for practice ranking endpoints.
 * Named function exports (not class-based) per project convention.
 *
 * Thin controller that handles:
 * - Request parsing and validation
 * - Delegating business logic to feature services
 * - Response formatting via feature-utils
 * - Error handling
 *
 * 12 endpoints:
 * - POST /trigger - Start batch ranking analysis
 * - GET /batch/:batchId/status - Batch status (in-memory + DB fallback)
 * - GET /status/:id - Single ranking status
 * - GET /results/:id - Full ranking results
 * - GET /list - List rankings with filters
 * - GET /accounts - List onboarded accounts with GBP locations
 * - DELETE /batch/:batchId - Delete batch + in-memory cleanup
 * - DELETE /:id - Delete single ranking
 * - POST /refresh-competitors - Invalidate competitor cache
 * - GET /latest - Latest rankings for client dashboard
 * - GET /tasks - Approved ranking tasks
 * - POST /webhook/llm-response - Receive LLM analysis from n8n
 */

import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../database/connection";
import { parseJsonField } from "./feature-utils/util.json-parser";
import { log, logError } from "./feature-utils/util.ranking-logger";
import {
  validateTriggerRequest,
  validateLocations,
  validateRefreshCompetitors,
  validateWebhookBody,
  validateRankingId,
  validateTasksRequest,
} from "./feature-utils/util.ranking-validator";
import {
  formatTriggerResponse,
  formatLegacyTriggerResponse,
  formatInMemoryBatchStatus,
  formatDbBatchStatus,
  formatRankingStatus,
  formatFullResults,
  formatRankingsList,
  formatAccountsList,
  formatLatestRanking,
  formatLegacyLatestRanking,
  formatTasksList,
} from "./feature-utils/util.ranking-formatter";
import * as batchTracker from "./feature-services/service.batch-status-tracker";
import * as competitorService from "./feature-services/service.competitor-analysis";
import * as llmWebhookHandler from "./feature-services/service.llm-webhook-handler";
import { processBatch } from "./feature-services/service.ranking-computation";

// =====================================================================
// POST /trigger
// =====================================================================

export async function triggerBatchAnalysis(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { googleAccountId, locations } = req.body;

    const validation = validateTriggerRequest(req.body);
    if (!validation.valid) {
      return res.status(400).json(validation.error);
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

    const propertyIds = parseJsonField(account.google_property_ids);

    // Handle new multi-location format
    if (locations && Array.isArray(locations) && locations.length > 0) {
      const locValidation = validateLocations(
        locations,
        propertyIds?.gbp,
      );
      if (!locValidation.valid) {
        return res.status(400).json(locValidation.error);
      }

      // Generate batch ID
      const batchId = uuidv4();

      log(
        `Starting batch ${batchId} for ${locations.length} locations in account ${googleAccountId}`,
      );

      // Create ALL ranking records upfront with "pending" status
      // This ensures the frontend can see all locations immediately when the trigger returns
      // Note: specialty/location will be auto-determined during processing via Identifier Agent
      const rankingIds: number[] = [];
      for (let i = 0; i < locations.length; i++) {
        const locationInput = locations[i];
        const [result] = await db("practice_rankings")
          .insert({
            google_account_id: googleAccountId,
            domain: account.domain_name,
            specialty: locationInput.specialty || null,
            location: locationInput.marketLocation || null,
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
        `[Batch ${batchId}] Created ${rankingIds.length} ranking records upfront`,
      );

      // Start background batch processing (records already created)
      setImmediate(() => {
        processBatch(
          batchId,
          googleAccountId,
          locations,
          account.domain_name,
          rankingIds,
          true, // recordsPreCreated
        ).catch((err) => {
          logError(`Background batch process ${batchId}`, err);
        });
      });

      return res.json(formatTriggerResponse(batchId, locations, rankingIds));
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

    const legacyLocations = [
      {
        gbpAccountId: firstGbp.accountId,
        gbpLocationId: firstGbp.locationId,
        gbpLocationName: firstGbp.displayName,
        specialty: specialty,
        marketLocation: location,
      },
    ];

    const batchId = uuidv4();

    // Start background batch processing (legacy: creates records inside)
    setImmediate(() => {
      processBatch(
        batchId,
        googleAccountId,
        legacyLocations,
        account.domain_name,
        [], // no pre-created IDs
        false, // recordsPreCreated = false for legacy
      ).catch((err) => {
        logError(`Background batch process ${batchId}`, err);
      });
    });

    return res.json(formatLegacyTriggerResponse(batchId));
  } catch (error: any) {
    logError("POST /trigger", error);
    return res.status(500).json({
      success: false,
      error: "TRIGGER_ERROR",
      message: error.message || "Failed to start analysis",
    });
  }
}

// =====================================================================
// GET /batch/:batchId/status
// =====================================================================

export async function getBatchStatus(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { batchId } = req.params;

    // Check in-memory status first (for active batches)
    const inMemoryStatus = batchTracker.getStatus(batchId);

    if (inMemoryStatus) {
      return res.json(formatInMemoryBatchStatus(inMemoryStatus));
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
        "updated_at",
      )
      .orderBy("created_at", "asc");

    if (rankings.length === 0) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: `Batch ${batchId} not found`,
      });
    }

    return res.json(formatDbBatchStatus(batchId, rankings));
  } catch (error: any) {
    logError("GET /batch/:batchId/status", error);
    return res.status(500).json({
      success: false,
      error: "BATCH_STATUS_ERROR",
      message: error.message || "Failed to get batch status",
    });
  }
}

// =====================================================================
// GET /status/:id
// =====================================================================

export async function getRankingStatus(
  req: Request,
  res: Response,
): Promise<Response> {
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

    return res.json(formatRankingStatus(ranking));
  } catch (error: any) {
    logError("GET /status/:id", error);
    return res.status(500).json({
      success: false,
      error: "STATUS_ERROR",
      message: error.message || "Failed to get status",
    });
  }
}

// =====================================================================
// GET /results/:id
// =====================================================================

export async function getRankingResults(
  req: Request,
  res: Response,
): Promise<Response> {
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

    return res.json(formatFullResults(ranking));
  } catch (error: any) {
    logError("GET /results/:id", error);
    return res.status(500).json({
      success: false,
      error: "RESULTS_ERROR",
      message: error.message || "Failed to get results",
    });
  }
}

// =====================================================================
// GET /list
// =====================================================================

export async function listRankings(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { googleAccountId, limit = 20, offset = 0 } = req.query;

    let query = db("practice_rankings")
      .select(
        "id",
        "google_account_id",
        "domain",
        "specialty",
        "location",
        "rank_keywords",
        "gbp_location_id",
        "gbp_location_name",
        "batch_id",
        "status",
        "rank_score",
        "rank_position",
        "total_competitors",
        "search_city",
        "search_state",
        "search_county",
        "search_postal_code",
        "created_at",
        "updated_at",
      )
      .orderBy("created_at", "desc")
      .limit(Number(limit))
      .offset(Number(offset));

    if (googleAccountId) {
      query = query.where({ google_account_id: Number(googleAccountId) });
    }

    const rankings = await query;

    return res.json(formatRankingsList(rankings));
  } catch (error: any) {
    logError("GET /list", error);
    return res.status(500).json({
      success: false,
      error: "LIST_ERROR",
      message: error.message || "Failed to list rankings",
    });
  }
}

// =====================================================================
// GET /accounts
// =====================================================================

export async function listAccounts(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const accounts = await db("google_accounts")
      .where({ onboarding_completed: true })
      .select("id", "domain_name", "practice_name", "google_property_ids")
      .orderBy("practice_name", "asc");

    const formattedAccounts = accounts.map((a) => {
      const propertyIds = parseJsonField(a.google_property_ids);

      // Debug: Log the raw GBP data to understand structure
      const rawGbp = propertyIds?.gbp || [];
      if (rawGbp.length > 0) {
        log(
          `Account ${a.id} (${
            a.domain_name
          }) GBP locations raw structure: ${JSON.stringify(rawGbp[0])}`,
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
    });

    return res.json(formatAccountsList(formattedAccounts));
  } catch (error: any) {
    logError("GET /accounts", error);
    return res.status(500).json({
      success: false,
      error: "ACCOUNTS_ERROR",
      message: error.message || "Failed to list accounts",
    });
  }
}

// =====================================================================
// DELETE /batch/:batchId
// =====================================================================

export async function deleteBatch(
  req: Request,
  res: Response,
): Promise<Response> {
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
    batchTracker.clearStatus(batchId);

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
}

// =====================================================================
// DELETE /:id
// =====================================================================

export async function deleteRanking(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;
    const rankingId = parseInt(id);

    const idValidation = validateRankingId(id);
    if (!idValidation.valid) {
      return res.status(400).json(idValidation.error);
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
}

// =====================================================================
// POST /refresh-competitors
// =====================================================================

export async function refreshCompetitors(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { specialty, location } = req.body;

    const validation = validateRefreshCompetitors({ specialty, location });
    if (!validation.valid) {
      return res.status(400).json(validation.error);
    }

    const wasInvalidated = await competitorService.invalidateCache(
      specialty,
      location,
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
}

// =====================================================================
// GET /latest
// =====================================================================

export async function getLatestRankings(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { googleAccountId } = req.query;

    if (!googleAccountId) {
      return res.status(400).json({
        success: false,
        error: "MISSING_PARAMS",
        message: "googleAccountId is required",
      });
    }

    // Step 1: Find the most recent batch_id with completed rankings for this account
    const latestBatchRecord = await db("practice_rankings")
      .where({
        google_account_id: Number(googleAccountId),
        status: "completed",
      })
      .whereNotNull("batch_id")
      .orderBy("created_at", "desc")
      .first()
      .select("batch_id");

    if (!latestBatchRecord || !latestBatchRecord.batch_id) {
      // Fall back to legacy: get latest ranking without batch_id (old format)
      const legacyRanking = await db("practice_rankings")
        .where({
          google_account_id: Number(googleAccountId),
          status: "completed",
        })
        .whereNull("batch_id")
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
      return res.json({
        success: true,
        rankings: [formatLegacyLatestRanking(legacyRanking)],
      });
    }

    const latestBatchId = latestBatchRecord.batch_id;
    log(
      `[GET /latest] Found latest batch: ${latestBatchId} for account ${googleAccountId}`,
    );

    // Step 2: Get all completed rankings from the latest batch
    const batchRankings = await db("practice_rankings")
      .where({
        google_account_id: Number(googleAccountId),
        batch_id: latestBatchId,
        status: "completed",
      })
      .orderBy("created_at", "asc");

    if (batchRankings.length === 0) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "No completed rankings found in the latest batch",
      });
    }

    log(
      `[GET /latest] Found ${batchRankings.length} rankings in batch ${latestBatchId}`,
    );

    // Step 3: For each ranking in the batch, get the previous analysis for trend comparison
    const rankingsWithPrevious = await Promise.all(
      batchRankings.map(async (ranking) => {
        // Get the previous completed ranking for this location (excluding current batch)
        const previous = await db("practice_rankings")
          .where({
            google_account_id: Number(googleAccountId),
            gbp_location_id: ranking.gbp_location_id,
            status: "completed",
          })
          .whereNot({ batch_id: latestBatchId })
          .orderBy("created_at", "desc")
          .first();

        return formatLatestRanking(ranking, previous || null);
      }),
    );

    return res.json({
      success: true,
      batchId: latestBatchId,
      rankings: rankingsWithPrevious,
    });
  } catch (error: any) {
    logError("GET /latest", error);
    return res.status(500).json({
      success: false,
      error: "LATEST_ERROR",
      message: error.message || "Failed to get latest rankings",
    });
  }
}

// =====================================================================
// GET /tasks
// =====================================================================

export async function getRankingTasks(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { practiceRankingId, googleAccountId, gbpLocationId } = req.query;

    log(
      `[Tasks] Fetching approved ranking tasks with params: ${JSON.stringify(
        req.query,
      )}`,
    );

    const validation = validateTasksRequest(req.query);
    if (!validation.valid) {
      return res.status(400).json(validation.error);
    }

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
    }

    log(`[Tasks] Found ${tasks.length} approved ranking tasks`);

    return res.json(formatTasksList(tasks));
  } catch (error: any) {
    logError("GET /tasks", error);
    return res.status(500).json({
      success: false,
      error: "TASKS_ERROR",
      message: error.message || "Failed to fetch ranking tasks",
    });
  }
}

// =====================================================================
// POST /webhook/llm-response
// =====================================================================

export async function handleLlmWebhook(
  req: Request,
  res: Response,
): Promise<Response> {
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

    const validation = validateWebhookBody(body);
    if (!validation.valid) {
      return res.status(400).json(validation.error);
    }

    log(`Received LLM response for ranking ${practice_ranking_id}`);

    // Check if error response
    if (error) {
      await llmWebhookHandler.handleErrorResponse(
        practice_ranking_id,
        error_code,
        error_message,
      );
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

    // Archive previous tasks and create new ones (CRITICAL: wrapped in transaction)
    await llmWebhookHandler.archiveAndCreateTasks(
      ranking,
      practice_ranking_id,
      llmAnalysis,
    );

    // Save successful LLM analysis
    await llmWebhookHandler.saveLlmAnalysis(practice_ranking_id, llmAnalysis);

    return res.json({ success: true, message: "Analysis saved" });
  } catch (error: any) {
    logError("POST /webhook/llm-response", error);
    return res.status(500).json({
      success: false,
      error: "WEBHOOK_ERROR",
      message: error.message || "Failed to process webhook",
    });
  }
}
