/**
 * Admin Agent Insights API Routes
 *
 * Endpoints for viewing Guardian and Governance Sentinel agent recommendations
 * and tracking their status (PENDING/COMPLETED)
 */

import express, { Request, Response } from "express";
import { db } from "../database/connection";

const router = express.Router();

// =====================================================================
// GET /api/admin/agent-insights/summary
// =====================================================================
/**
 * Returns summary statistics for current month's agents
 *
 * Query params:
 *   - month: Optional YYYY-MM format (defaults to current month)
 *   - page: Page number (default: 1)
 *   - limit: Items per page (default: 50)
 *
 * Returns per agent_under_test:
 *   - pass_rate: Percentage of PASS verdicts from agent outputs
 *   - confidence_rate: Average confidence score
 *   - total_recommendations: Count from agent_recommendations table
 *   - fixed_count: Count where status = 'COMPLETED'
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

    console.log(
      `[Admin Agent Insights] Fetching summary for ${startDate} to ${endDate}`
    );

    // Fetch guardian and governance results for this month
    const agentResults = await db("agent_results")
      .whereIn("agent_type", ["guardian", "governance_sentinel"])
      .whereBetween("date_start", [startDate, endDate])
      .where("status", "success")
      .select("*");

    if (agentResults.length === 0) {
      console.log(
        "[Admin Agent Insights] No guardian/governance results found for this period"
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
        message: "No agent results found for this period",
      });
    }

    console.log(
      `[Admin Agent Insights] Found ${agentResults.length} guardian/governance results`
    );

    // Parse agent outputs and calculate metrics per agent_under_test
    const metricsMap: Record<
      string,
      {
        agent_type: string;
        total_checks: number;
        pass_count: number;
        fail_count: number;
        pending_count: number;
        confidence_sum: number;
        confidence_count: number;
      }
    > = {};

    for (const result of agentResults) {
      let output: any[];

      try {
        output =
          typeof result.agent_output === "string"
            ? JSON.parse(result.agent_output)
            : result.agent_output;
      } catch (parseError) {
        console.error(
          `Failed to parse agent_output for result ${result.id}:`,
          parseError
        );
        continue;
      }

      if (!Array.isArray(output)) {
        console.warn(`agent_output for result ${result.id} is not an array`);
        continue;
      }

      for (const item of output) {
        const agentType = item.agent_under_test;

        if (!agentType) {
          console.warn(`Missing agent_under_test in result ${result.id}`);
          continue;
        }

        // Initialize metrics for this agent type
        if (!metricsMap[agentType]) {
          metricsMap[agentType] = {
            agent_type: agentType,
            total_checks: 0,
            pass_count: 0,
            fail_count: 0,
            pending_count: 0,
            confidence_sum: 0,
            confidence_count: 0,
          };
        }

        const metrics = metricsMap[agentType];

        // Process recommendations array
        const recommendations = item.recommendations || [];
        for (const rec of recommendations) {
          metrics.total_checks++;

          // Count verdict types
          const verdict = rec.verdict?.toUpperCase();
          if (verdict === "PASS") {
            metrics.pass_count++;
          } else if (verdict === "FAIL") {
            metrics.fail_count++;
          } else {
            metrics.pending_count++;
          }

          // Sum confidence scores
          if (rec.confidence !== null && rec.confidence !== undefined) {
            metrics.confidence_sum += rec.confidence;
            metrics.confidence_count++;
          }
        }
      }
    }

    // Get recommendation counts from agent_recommendations table
    const recCounts = await db("agent_recommendations")
      .select("agent_under_test")
      .count("* as total")
      .select(
        db.raw("SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as fixed", [
          "COMPLETED",
        ])
      )
      .groupBy("agent_under_test");

    // Combine metrics
    const allSummary = Object.keys(metricsMap).map((agentType) => {
      const m = metricsMap[agentType];
      const recData = recCounts.find(
        (r) => r.agent_under_test === agentType
      ) || {
        total: "0",
        fixed: "0",
      };

      return {
        agent_type: agentType,
        pass_rate: m.total_checks > 0 ? m.pass_count / m.total_checks : 0,
        confidence_rate:
          m.confidence_count > 0 ? m.confidence_sum / m.confidence_count : 0,
        total_recommendations: parseInt(String(recData.total)) || 0,
        fixed_count: parseInt(String(recData.fixed)) || 0,
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
 *   - source: Filter by 'guardian' or 'governance_sentinel' or 'all' (default: all)
 *   - status: Filter by 'PENDING' or 'COMPLETED' or 'all' (default: all)
 *   - page: Page number (default: 1)
 *   - limit: Items per page (default: 50)
 */
router.get(
  "/:agentType/recommendations",
  async (req: Request, res: Response) => {
    try {
      const { agentType } = req.params;
      const {
        source = "all",
        status = "all",
        page = "1",
        limit = "50",
      } = req.query;

      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const offset = (pageNum - 1) * limitNum;

      console.log(
        `[Admin Agent Insights] Fetching recommendations for ${agentType}, source=${source}, status=${status}, page=${pageNum}`
      );

      let query = db("agent_recommendations").where(
        "agent_under_test",
        agentType
      );

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
 * Update recommendation status (PENDING <-> COMPLETED)
 *
 * Path params:
 *   - id: The recommendation ID
 *
 * Body:
 *   - status: 'PENDING' or 'COMPLETED'
 */
router.patch("/recommendations/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    if (!status || !["PENDING", "COMPLETED"].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_STATUS",
        message: "Status must be PENDING or COMPLETED",
      });
    }

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
      status,
      updated_at: new Date(),
    };

    // Set completed_at timestamp when marking as completed
    if (status === "COMPLETED") {
      updates.completed_at = new Date();
    } else if (status === "PENDING") {
      // Clear completed_at when marking back to pending
      updates.completed_at = null;
    }

    // Update in database
    await db("agent_recommendations").where("id", id).update(updates);

    console.log(`[Admin Agent Insights] ✓ Updated recommendation ${id}`);

    return res.json({
      success: true,
      message: "Recommendation status updated successfully",
      data: { id, status },
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
// PATCH /api/admin/agent-insights/:agentType/recommendations/mark-all-completed
// =====================================================================
/**
 * Mark all recommendations for a specific agent as completed
 *
 * Path params:
 *   - agentType: The agent type (e.g., 'opportunity')
 *
 * Query params:
 *   - source: Optional filter by 'guardian' or 'governance_sentinel'
 */
router.patch(
  "/:agentType/recommendations/mark-all-completed",
  async (req: Request, res: Response) => {
    try {
      const { agentType } = req.params;
      const { source } = req.query;

      console.log(
        `[Admin Agent Insights] Marking all recommendations as completed for ${agentType}${
          source ? ` (source: ${source})` : ""
        }`
      );

      let query = db("agent_recommendations")
        .where("agent_under_test", agentType)
        .where("status", "PENDING");

      // Apply source filter if provided
      if (source && source !== "all") {
        query = query.where("source_agent_type", source as string);
      }

      // Update all matching recommendations
      const updated = await query.update({
        status: "COMPLETED",
        completed_at: new Date(),
        updated_at: new Date(),
      });

      console.log(
        `[Admin Agent Insights] ✓ Marked ${updated} recommendation(s) as completed`
      );

      return res.json({
        success: true,
        message: `Marked ${updated} recommendation(s) as completed`,
        data: { agentType, updated },
      });
    } catch (error: any) {
      console.error(
        "[Admin Agent Insights] Error marking all as completed:",
        error
      );
      return res.status(500).json({
        success: false,
        error: "UPDATE_ERROR",
        message:
          error?.message || "Failed to mark recommendations as completed",
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
// EXPORTS
// =====================================================================

export default router;
