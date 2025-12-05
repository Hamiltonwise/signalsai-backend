/**
 * Admin Agent Insights API Routes
 *
 * Endpoints for viewing Guardian and Governance Sentinel agent recommendations
 * and tracking their status (PASS/REJECT)
 */

import express, { Request, Response } from "express";
import { db } from "../database/connection";

const router = express.Router();

// =====================================================================
// GET /api/admin/agent-insights/summary
// =====================================================================
/**
 * Returns summary statistics for agents with recommendations
 *
 * Query params:
 *   - month: Optional YYYY-MM format (defaults to current month)
 *   - page: Page number (default: 1)
 *   - limit: Items per page (default: 50)
 *
 * Returns per agent_under_test:
 *   - pass_rate: Percentage of PASS verdicts
 *   - confidence_rate: Average confidence score
 *   - total_recommendations: Count of recommendations
 *   - fixed_count: Count where status = 'PASS'
 *
 * NOTE: Queries agent_recommendations table directly using created_at for month filtering
 */
router.get("/summary", async (req: Request, res: Response) => {
  try {
    const { month, page = "1", limit = "50" } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    // Determine date range
    const now = new Date();
    const startDate = month
      ? `${month}-01`
      : new Date(now.getFullYear(), now.getMonth(), 1)
          .toISOString()
          .split("T")[0];

    const endOfMonth = month
      ? new Date(
          new Date(month + "-01").getFullYear(),
          new Date(month + "-01").getMonth() + 1,
          0
        )
      : new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const endDate = endOfMonth.toISOString().split("T")[0];

    // Add time to endDate to include the entire last day
    const endDateTime = `${endDate}T23:59:59.999Z`;

    console.log(
      `[Admin Agent Insights] Fetching summary for ${startDate} to ${endDate}`
    );

    // Query agent_recommendations directly, grouped by agent_under_test
    // Filter by created_at for the selected month
    const summaryData = await db("agent_recommendations")
      .select("agent_under_test")
      .count("* as total_recommendations")
      .select(
        db.raw(
          "SUM(CASE WHEN verdict = 'PASS' THEN 1 ELSE 0 END) as pass_count"
        )
      )
      .select(
        db.raw(
          "SUM(CASE WHEN verdict = 'FAIL' THEN 1 ELSE 0 END) as fail_count"
        )
      )
      .select(
        db.raw(
          "SUM(CASE WHEN status = 'PASS' THEN 1 ELSE 0 END) as fixed_count"
        )
      )
      .avg("confidence as avg_confidence")
      .where("created_at", ">=", startDate)
      .where("created_at", "<=", endDateTime)
      .whereNotNull("agent_under_test")
      .groupBy("agent_under_test")
      .orderBy("agent_under_test");

    if (summaryData.length === 0) {
      console.log(
        "[Admin Agent Insights] No recommendations found for this period"
      );
      return res.json({
        success: true,
        data: [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: 0,
          totalPages: 0,
        },
        period: { startDate, endDate },
        message: "No recommendations found for this period",
      });
    }

    console.log(
      `[Admin Agent Insights] Found ${summaryData.length} agent types with recommendations`
    );

    // Format the response
    const allSummary = summaryData.map((row: any) => {
      const totalRecs = parseInt(String(row.total_recommendations)) || 0;
      const passCount = parseInt(String(row.pass_count)) || 0;
      const fixedCount = parseInt(String(row.fixed_count)) || 0;
      const avgConfidence = parseFloat(String(row.avg_confidence)) || 0;

      return {
        agent_type: row.agent_under_test,
        pass_rate: totalRecs > 0 ? passCount / totalRecs : 0,
        confidence_rate: avgConfidence,
        total_recommendations: totalRecs,
        fixed_count: fixedCount,
      };
    });

    // Apply pagination
    const total = allSummary.length;
    const totalPages = Math.ceil(total / limitNum);
    const summary = allSummary.slice(offset, offset + limitNum);

    console.log(
      `[Admin Agent Insights] Returning ${summary.length} of ${total} agent types (page ${pageNum})`
    );

    return res.json({
      success: true,
      data: summary,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
      },
      period: { startDate, endDate },
    });
  } catch (error: any) {
    console.error("[Admin Agent Insights] Error fetching summary:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch agent insights summary",
    });
  }
});

// =====================================================================
// GET /api/admin/agent-insights/:agentType/recommendations
// =====================================================================
/**
 * Returns all recommendations for a specific agent_under_test
 *
 * Path params:
 *   - agentType: The agent to get recommendations for (e.g., 'opportunity')
 *
 * Query params:
 *   - month: Optional YYYY-MM format (defaults to all time)
 *   - source: Filter by 'guardian' or 'governance_sentinel' or 'all' (default: all)
 *   - status: Filter by 'PASS' or 'REJECT' or 'all' (default: all)
 *   - page: Page number (default: 1)
 *   - limit: Items per page (default: 50)
 */
router.get(
  "/:agentType/recommendations",
  async (req: Request, res: Response) => {
    try {
      const { agentType } = req.params;
      const {
        month,
        source = "all",
        status = "all",
        page = "1",
        limit = "50",
      } = req.query;

      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const offset = (pageNum - 1) * limitNum;

      console.log(
        `[Admin Agent Insights] Fetching recommendations for ${agentType}, month=${
          month || "all"
        }, source=${source}, status=${status}, page=${pageNum}`
      );

      let query = db("agent_recommendations").where(
        "agent_under_test",
        agentType
      );

      // Apply month filter if provided
      if (month) {
        const startDate = `${month}-01`;
        const endOfMonth = new Date(
          new Date(month + "-01").getFullYear(),
          new Date(month + "-01").getMonth() + 1,
          0
        );
        const endDate = endOfMonth.toISOString().split("T")[0];
        const endDateTime = `${endDate}T23:59:59.999Z`;

        query = query
          .where("created_at", ">=", startDate)
          .where("created_at", "<=", endDateTime);
      }

      // Apply source filter
      if (source && source !== "all") {
        query = query.where("source_agent_type", source as string);
      }

      // Apply status filter
      if (status && status !== "all") {
        query = query.where("status", status as string);
      }

      // Get total count
      const countQuery = query.clone();
      const [{ count }] = await countQuery.count("* as count");
      const total = parseInt(String(count), 10);
      const totalPages = Math.ceil(total / limitNum);

      // Get paginated results
      const recommendations = await query
        .orderBy("created_at", "desc")
        .limit(limitNum)
        .offset(offset)
        .select("*");

      // Parse JSON fields
      const parsedRecommendations = recommendations.map((rec) => ({
        ...rec,
        evidence_links:
          typeof rec.evidence_links === "string"
            ? JSON.parse(rec.evidence_links)
            : rec.evidence_links,
      }));

      console.log(
        `[Admin Agent Insights] Found ${parsedRecommendations.length} of ${total} recommendations (page ${pageNum})`
      );

      return res.json({
        success: true,
        data: parsedRecommendations,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
        },
      });
    } catch (error: any) {
      console.error(
        "[Admin Agent Insights] Error fetching recommendations:",
        error
      );
      return res.status(500).json({
        success: false,
        error: "FETCH_ERROR",
        message: error?.message || "Failed to fetch recommendations",
      });
    }
  }
);

// =====================================================================
// PATCH /api/admin/agent-insights/recommendations/:id
// =====================================================================
/**
 * Update recommendation status (NULL/PASS/REJECT)
 *
 * Path params:
 *   - id: The recommendation ID
 *
 * Body:
 *   - status: 'PASS', 'REJECT', or 'IGNORE' (IGNORE sets to NULL)
 */
router.patch("/recommendations/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status - IGNORE will be converted to NULL
    if (!status || !["PASS", "REJECT", "IGNORE"].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_STATUS",
        message: "Status must be PASS, REJECT, or IGNORE",
      });
    }

    // Convert IGNORE to NULL for database
    const dbStatus = status === "IGNORE" ? null : status;

    console.log(
      `[Admin Agent Insights] Updating recommendation ${id} to status ${status}`
    );

    // Check if recommendation exists
    const existing = await db("agent_recommendations").where("id", id).first();
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Recommendation not found",
      });
    }

    // Build update object
    const updates: any = {
      status: dbStatus,
      updated_at: new Date(),
    };

    // Set completed_at timestamp when marking as PASS
    if (status === "PASS") {
      updates.completed_at = new Date();
    } else {
      // Clear completed_at when marking as REJECT or IGNORE (NULL)
      updates.completed_at = null;
    }

    // Update in database
    await db("agent_recommendations").where("id", id).update(updates);

    console.log(`[Admin Agent Insights] ✓ Updated recommendation ${id}`);

    return res.json({
      success: true,
      message: "Recommendation status updated successfully",
      data: { id, status: dbStatus },
    });
  } catch (error: any) {
    console.error(
      "[Admin Agent Insights] Error updating recommendation:",
      error
    );
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update recommendation",
    });
  }
});

// =====================================================================
// PATCH /api/admin/agent-insights/:agentType/recommendations/mark-all-pass
// =====================================================================
/**
 * Mark all recommendations for a specific agent as PASS
 *
 * Path params:
 *   - agentType: The agent type (e.g., 'opportunity')
 *
 * Query params:
 *   - source: Optional filter by 'guardian' or 'governance_sentinel'
 */
router.patch(
  "/:agentType/recommendations/mark-all-pass",
  async (req: Request, res: Response) => {
    try {
      const { agentType } = req.params;
      const { source } = req.query;

      console.log(
        `[Admin Agent Insights] Marking all recommendations as PASS for ${agentType}${
          source ? ` (source: ${source})` : ""
        }`
      );

      let query = db("agent_recommendations")
        .where("agent_under_test", agentType)
        .where("status", "REJECT");

      // Apply source filter if provided
      if (source && source !== "all") {
        query = query.where("source_agent_type", source as string);
      }

      // Update all matching recommendations
      const updated = await query.update({
        status: "PASS",
        completed_at: new Date(),
        updated_at: new Date(),
      });

      console.log(
        `[Admin Agent Insights] ✓ Marked ${updated} recommendation(s) as PASS`
      );

      return res.json({
        success: true,
        message: `Marked ${updated} recommendation(s) as PASS`,
        data: { agentType, updated },
      });
    } catch (error: any) {
      console.error("[Admin Agent Insights] Error marking all as PASS:", error);
      return res.status(500).json({
        success: false,
        error: "UPDATE_ERROR",
        message: error?.message || "Failed to mark recommendations as PASS",
      });
    }
  }
);

// =====================================================================
// DELETE /api/admin/agent-insights/recommendations/bulk-delete
// =====================================================================
/**
 * Bulk delete recommendations by IDs
 *
 * Body:
 *   - ids: Array of recommendation IDs to delete
 */
router.delete(
  "/recommendations/bulk-delete",
  async (req: Request, res: Response) => {
    try {
      const { ids } = req.body;

      // Validate input
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          success: false,
          error: "INVALID_INPUT",
          message: "Must provide an array of recommendation IDs",
        });
      }

      console.log(
        `[Admin Agent Insights] Bulk deleting ${ids.length} recommendation(s)`
      );

      // Delete recommendations
      const deleted = await db("agent_recommendations")
        .whereIn("id", ids)
        .del();

      console.log(
        `[Admin Agent Insights] ✓ Deleted ${deleted} recommendation(s)`
      );

      return res.json({
        success: true,
        message: `Deleted ${deleted} recommendation(s)`,
        data: { deleted },
      });
    } catch (error: any) {
      console.error(
        "[Admin Agent Insights] Error bulk deleting recommendations:",
        error
      );
      return res.status(500).json({
        success: false,
        error: "DELETE_ERROR",
        message: error?.message || "Failed to delete recommendations",
      });
    }
  }
);

// =====================================================================
// DELETE /api/admin/agent-insights/clear-month-data
// =====================================================================
/**
 * Clear Guardian and Governance data for a specific month
 * - Deletes agent_recommendations where created_at is in the selected month
 * - Deletes agent_results where agent_type is guardian or governance_sentinel
 *
 * Query params:
 *   - month: Optional YYYY-MM format (defaults to current month)
 */
router.delete("/clear-month-data", async (req: Request, res: Response) => {
  try {
    const { month } = req.query;

    // Determine date range
    const now = new Date();
    const startDate = month
      ? `${month}-01`
      : new Date(now.getFullYear(), now.getMonth(), 1)
          .toISOString()
          .split("T")[0];

    const endOfMonth = month
      ? new Date(
          new Date(month + "-01").getFullYear(),
          new Date(month + "-01").getMonth() + 1,
          0
        )
      : new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const endDate = endOfMonth.toISOString().split("T")[0];

    // Add time to endDate to include the entire last day
    const endDateTime = `${endDate}T23:59:59.999Z`;

    console.log(
      `[Admin Agent Insights] Clearing Guardian/Governance data for ${startDate} to ${endDate}`
    );

    // Delete recommendations for this month (by created_at)
    const deletedRecs = await db("agent_recommendations")
      .where("created_at", ">=", startDate)
      .where("created_at", "<=", endDateTime)
      .del();

    // Delete agent_results for this month
    const deletedResults = await db("agent_results")
      .whereIn("agent_type", ["guardian", "governance_sentinel"])
      .where("created_at", ">=", startDate)
      .where("created_at", "<=", endDateTime)
      .del();

    console.log(
      `[Admin Agent Insights] ✓ Deleted ${deletedResults} agent results and ${deletedRecs} recommendations`
    );

    return res.json({
      success: true,
      message: `Cleared Guardian and Governance data for ${startDate} to ${endDate}`,
      data: {
        deletedResults,
        deletedRecommendations: deletedRecs,
      },
    });
  } catch (error: any) {
    console.error("[Admin Agent Insights] Error clearing month data:", error);
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to clear month data",
    });
  }
});

// =====================================================================
// GET /api/admin/agent-insights/:agentType/governance-ids
// =====================================================================
/**
 * Get all PASS and REJECT recommendation IDs for a specific agent
 *
 * Path params:
 *   - agentType: The agent to get governance IDs for (e.g., 'opportunity')
 *
 * Returns:
 *   - passed: Array of recommendation IDs with status = 'PASS'
 *   - rejected: Array of recommendation IDs with status = 'REJECT'
 *   - counts: Object with passed and rejected counts
 */
router.get(
  "/:agentType/governance-ids",
  async (req: Request, res: Response) => {
    try {
      const { agentType } = req.params;

      console.log(
        `[Admin Agent Insights] Fetching governance recommendation IDs for ${agentType}`
      );

      // Get PASS recommendations
      const passedResults = await db("agent_recommendations")
        .where("agent_under_test", agentType)
        .where("status", "PASS")
        .select("id");

      // Get REJECT recommendations
      const rejectedResults = await db("agent_recommendations")
        .where("agent_under_test", agentType)
        .where("status", "REJECT")
        .select("id");

      const passed = passedResults.map((r) => r.id);
      const rejected = rejectedResults.map((r) => r.id);

      console.log(
        `[Admin Agent Insights] Found ${passed.length} PASS and ${rejected.length} REJECT recommendations for ${agentType}`
      );

      return res.json({
        success: true,
        passed,
        rejected,
        counts: {
          passed: passed.length,
          rejected: rejected.length,
        },
      });
    } catch (error: any) {
      console.error(
        "[Admin Agent Insights] Error fetching governance IDs:",
        error
      );
      return res.status(500).json({
        success: false,
        error: "FETCH_ERROR",
        message:
          error?.message || "Failed to fetch governance recommendation IDs",
      });
    }
  }
);

// =====================================================================
// POST /api/admin/agent-insights/recommendations/by-ids
// =====================================================================
/**
 * Get recommendation details by IDs grouped by status
 *
 * Body:
 *   - passed: Array of PASS recommendation IDs (optional)
 *   - rejected: Array of REJECT recommendation IDs (optional)
 *
 * Returns:
 *   - passed: Array of PASS recommendations with id, title, explanation, status
 *   - rejected: Array of REJECT recommendations with id, title, explanation, status
 *   - counts: Object with passed and rejected counts
 */
router.post("/by-ids", async (req: Request, res: Response) => {
  try {
    console.log("reached here");
    const { passed, rejected } = req.body;

    // Validate input
    if (!passed && !rejected) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "Must provide passed and/or rejected arrays",
      });
    }

    console.log(
      `[Admin Agent Insights] Fetching recommendations: ${
        passed?.length || 0
      } passed, ${rejected?.length || 0} rejected`
    );

    // Fetch passed recommendations
    const passedRecs =
      passed && Array.isArray(passed) && passed.length > 0
        ? await db("agent_recommendations")
            .whereIn("id", passed)
            .select("id", "title", "explanation", "status")
        : [];

    // Fetch rejected recommendations
    const rejectedRecs =
      rejected && Array.isArray(rejected) && rejected.length > 0
        ? await db("agent_recommendations")
            .whereIn("id", rejected)
            .select("id", "title", "explanation", "status")
        : [];

    console.log(
      `[Admin Agent Insights] Found ${passedRecs.length} passed and ${rejectedRecs.length} rejected recommendation(s)`
    );

    return res.json({
      success: true,
      passed: passedRecs,
      rejected: rejectedRecs,
      counts: {
        passed: passedRecs.length,
        rejected: rejectedRecs.length,
      },
    });
  } catch (error: any) {
    console.error(
      "[Admin Agent Insights] Error fetching recommendations by IDs:",
      error
    );
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch recommendations",
    });
  }
});

// =====================================================================
// EXPORTS
// =====================================================================

export default router;
