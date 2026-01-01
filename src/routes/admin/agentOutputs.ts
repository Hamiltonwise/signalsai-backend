/**
 * Admin Agent Outputs API Routes
 *
 * Endpoints for viewing and managing agent_results table
 * with archive functionality and filtering capabilities
 */

import express, { Request, Response } from "express";
import { db } from "../../database/connection";

const router = express.Router();

// =====================================================================
// GET /api/admin/agent-outputs
// =====================================================================
/**
 * List all agent outputs with filtering and pagination
 *
 * Query params:
 *   - domain: Filter by domain name
 *   - agent_type: Filter by agent type (proofline, summary, opportunity, etc.)
 *   - status: Filter by status ('success', 'pending', 'error', 'archived', 'all')
 *             Default: excludes 'archived' unless status=archived or status=all
 *   - date_from: Filter created_at >= date (ISO string)
 *   - date_to: Filter created_at <= date (ISO string)
 *   - page: Page number (default: 1)
 *   - limit: Items per page (default: 50)
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const {
      domain,
      agent_type,
      status,
      date_from,
      date_to,
      page = "1",
      limit = "50",
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    console.log("[Admin Agent Outputs] Fetching with filters:", req.query);

    // Build count query
    let countQuery = db("agent_results");

    // Apply filters to count query
    if (domain) {
      countQuery = countQuery.where("domain", domain);
    }

    if (agent_type && agent_type !== "all") {
      countQuery = countQuery.where("agent_type", agent_type);
    }

    // Status filter - default excludes archived
    if (status && status !== "all") {
      countQuery = countQuery.where("status", status);
    } else if (!status || status !== "all") {
      // Default: exclude archived
      countQuery = countQuery.whereNot("status", "archived");
    }

    if (date_from) {
      countQuery = countQuery.where(
        "created_at",
        ">=",
        new Date(date_from as string)
      );
    }

    if (date_to) {
      countQuery = countQuery.where(
        "created_at",
        "<=",
        new Date(date_to as string)
      );
    }

    // Execute count query
    const [{ count }] = await countQuery.count("* as count");
    const total = parseInt(count as string, 10);
    const totalPages = Math.ceil(total / limitNum);

    // Build data query
    let dataQuery = db("agent_results").select(
      "id",
      "google_account_id",
      "domain",
      "agent_type",
      "date_start",
      "date_end",
      "status",
      "error_message",
      "created_at",
      "updated_at"
    );

    // Apply same filters to data query
    if (domain) {
      dataQuery = dataQuery.where("domain", domain);
    }

    if (agent_type && agent_type !== "all") {
      dataQuery = dataQuery.where("agent_type", agent_type);
    }

    if (status && status !== "all") {
      dataQuery = dataQuery.where("status", status);
    } else if (!status || status !== "all") {
      dataQuery = dataQuery.whereNot("status", "archived");
    }

    if (date_from) {
      dataQuery = dataQuery.where(
        "created_at",
        ">=",
        new Date(date_from as string)
      );
    }

    if (date_to) {
      dataQuery = dataQuery.where(
        "created_at",
        "<=",
        new Date(date_to as string)
      );
    }

    // Execute data query with pagination
    const outputs = await dataQuery
      .orderBy("created_at", "desc")
      .limit(limitNum)
      .offset(offset);

    console.log(
      `[Admin Agent Outputs] Found ${outputs.length} of ${total} outputs (page ${pageNum})`
    );

    return res.json({
      success: true,
      data: outputs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
      },
    });
  } catch (error: any) {
    console.error("[Admin Agent Outputs] Error fetching outputs:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch agent outputs",
    });
  }
});

// =====================================================================
// GET /api/admin/agent-outputs/domains
// =====================================================================
/**
 * Get unique domains for filter dropdown
 */
router.get("/domains", async (_req: Request, res: Response) => {
  try {
    console.log("[Admin Agent Outputs] Fetching unique domains");

    const domains = await db("agent_results")
      .distinct("domain")
      .whereNotNull("domain")
      .orderBy("domain", "asc");

    const domainList = domains
      .map((d) => d.domain)
      .filter((d) => d && d !== "SYSTEM");

    console.log(
      `[Admin Agent Outputs] Found ${domainList.length} unique domains`
    );

    return res.json({
      success: true,
      domains: domainList,
    });
  } catch (error: any) {
    console.error("[Admin Agent Outputs] Error fetching domains:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch domains",
    });
  }
});

// =====================================================================
// GET /api/admin/agent-outputs/agent-types
// =====================================================================
/**
 * Get unique agent types for filter dropdown
 */
router.get("/agent-types", async (_req: Request, res: Response) => {
  try {
    console.log("[Admin Agent Outputs] Fetching unique agent types");

    const types = await db("agent_results")
      .distinct("agent_type")
      .whereNotNull("agent_type")
      .orderBy("agent_type", "asc");

    const typeList = types.map((t) => t.agent_type);

    console.log(
      `[Admin Agent Outputs] Found ${typeList.length} unique agent types`
    );

    return res.json({
      success: true,
      agentTypes: typeList,
    });
  } catch (error: any) {
    console.error("[Admin Agent Outputs] Error fetching agent types:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch agent types",
    });
  }
});

// =====================================================================
// GET /api/admin/agent-outputs/:id
// =====================================================================
/**
 * Get single agent output with full details including input/output
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    console.log(`[Admin Agent Outputs] Fetching output ID: ${id}`);

    const output = await db("agent_results").where("id", id).first();

    if (!output) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Agent output not found",
      });
    }

    // Parse JSON fields if they're strings
    let parsedInput = output.agent_input;
    let parsedOutput = output.agent_output;

    try {
      if (typeof output.agent_input === "string") {
        parsedInput = JSON.parse(output.agent_input);
      }
    } catch (e) {
      console.warn(
        `[Admin Agent Outputs] Failed to parse agent_input for ID ${id}`
      );
    }

    try {
      if (typeof output.agent_output === "string") {
        parsedOutput = JSON.parse(output.agent_output);
      }
    } catch (e) {
      console.warn(
        `[Admin Agent Outputs] Failed to parse agent_output for ID ${id}`
      );
    }

    console.log(`[Admin Agent Outputs] Found output ID: ${id}`);

    return res.json({
      success: true,
      data: {
        ...output,
        agent_input: parsedInput,
        agent_output: parsedOutput,
      },
    });
  } catch (error: any) {
    console.error("[Admin Agent Outputs] Error fetching output:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch agent output",
    });
  }
});

// =====================================================================
// PATCH /api/admin/agent-outputs/:id/archive
// =====================================================================
/**
 * Archive a single agent output
 */
router.patch("/:id/archive", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    console.log(`[Admin Agent Outputs] Archiving output ID: ${id}`);

    // Check if output exists
    const output = await db("agent_results").where("id", id).first();

    if (!output) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Agent output not found",
      });
    }

    // Check if already archived
    if (output.status === "archived") {
      return res.status(400).json({
        success: false,
        error: "ALREADY_ARCHIVED",
        message: "Agent output is already archived",
      });
    }

    // Archive the output
    await db("agent_results").where("id", id).update({
      status: "archived",
      updated_at: new Date(),
    });

    console.log(`[Admin Agent Outputs] ✓ Archived output ID: ${id}`);

    return res.json({
      success: true,
      message: "Agent output archived successfully",
      data: { id, status: "archived" },
    });
  } catch (error: any) {
    console.error("[Admin Agent Outputs] Error archiving output:", error);
    return res.status(500).json({
      success: false,
      error: "ARCHIVE_ERROR",
      message: error?.message || "Failed to archive agent output",
    });
  }
});

// =====================================================================
// PATCH /api/admin/agent-outputs/:id/unarchive
// =====================================================================
/**
 * Restore an archived agent output (set status back to 'success')
 */
router.patch("/:id/unarchive", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    console.log(`[Admin Agent Outputs] Unarchiving output ID: ${id}`);

    // Check if output exists
    const output = await db("agent_results").where("id", id).first();

    if (!output) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Agent output not found",
      });
    }

    // Check if it's actually archived
    if (output.status !== "archived") {
      return res.status(400).json({
        success: false,
        error: "NOT_ARCHIVED",
        message: "Agent output is not archived",
      });
    }

    // Restore to success status
    await db("agent_results").where("id", id).update({
      status: "success",
      updated_at: new Date(),
    });

    console.log(`[Admin Agent Outputs] ✓ Unarchived output ID: ${id}`);

    return res.json({
      success: true,
      message: "Agent output restored successfully",
      data: { id, status: "success" },
    });
  } catch (error: any) {
    console.error("[Admin Agent Outputs] Error unarchiving output:", error);
    return res.status(500).json({
      success: false,
      error: "UNARCHIVE_ERROR",
      message: error?.message || "Failed to unarchive agent output",
    });
  }
});

// =====================================================================
// POST /api/admin/agent-outputs/bulk/archive
// =====================================================================
/**
 * Bulk archive multiple agent outputs
 * Body: { ids: number[] }
 */
router.post("/bulk/archive", async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;

    // Validate input
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "Must provide an array of output IDs",
      });
    }

    console.log(`[Admin Agent Outputs] Bulk archiving ${ids.length} output(s)`);

    // Archive all outputs (excluding already archived)
    const updated = await db("agent_results")
      .whereIn("id", ids)
      .whereNot("status", "archived")
      .update({
        status: "archived",
        updated_at: new Date(),
      });

    console.log(`[Admin Agent Outputs] ✓ Archived ${updated} output(s)`);

    return res.json({
      success: true,
      message: `${updated} output(s) archived successfully`,
      data: { archived: updated },
    });
  } catch (error: any) {
    console.error("[Admin Agent Outputs] Error bulk archiving:", error);
    return res.status(500).json({
      success: false,
      error: "BULK_ARCHIVE_ERROR",
      message: error?.message || "Failed to bulk archive outputs",
    });
  }
});

// =====================================================================
// POST /api/admin/agent-outputs/bulk/unarchive
// =====================================================================
/**
 * Bulk unarchive multiple agent outputs
 * Body: { ids: number[] }
 */
router.post("/bulk/unarchive", async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;

    // Validate input
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "Must provide an array of output IDs",
      });
    }

    console.log(
      `[Admin Agent Outputs] Bulk unarchiving ${ids.length} output(s)`
    );

    // Unarchive all outputs
    const updated = await db("agent_results")
      .whereIn("id", ids)
      .where("status", "archived")
      .update({
        status: "success",
        updated_at: new Date(),
      });

    console.log(`[Admin Agent Outputs] ✓ Unarchived ${updated} output(s)`);

    return res.json({
      success: true,
      message: `${updated} output(s) restored successfully`,
      data: { unarchived: updated },
    });
  } catch (error: any) {
    console.error("[Admin Agent Outputs] Error bulk unarchiving:", error);
    return res.status(500).json({
      success: false,
      error: "BULK_UNARCHIVE_ERROR",
      message: error?.message || "Failed to bulk unarchive outputs",
    });
  }
});

// =====================================================================
// DELETE /api/admin/agent-outputs/:id
// =====================================================================
/**
 * Permanently delete a single agent output
 */
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    console.log(`[Admin Agent Outputs] Deleting output ID: ${id}`);

    // Check if output exists
    const output = await db("agent_results").where("id", id).first();

    if (!output) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Agent output not found",
      });
    }

    // Delete the output
    await db("agent_results").where("id", id).del();

    console.log(`[Admin Agent Outputs] ✓ Permanently deleted output ID: ${id}`);

    return res.json({
      success: true,
      message: "Agent output permanently deleted",
      data: { id: parseInt(id, 10) },
    });
  } catch (error: any) {
    console.error("[Admin Agent Outputs] Error deleting output:", error);
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to delete agent output",
    });
  }
});

// =====================================================================
// POST /api/admin/agent-outputs/bulk/delete
// =====================================================================
/**
 * Bulk delete multiple agent outputs permanently
 * Body: { ids: number[] }
 */
router.post("/bulk/delete", async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;

    // Validate input
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "Must provide an array of output IDs",
      });
    }

    console.log(`[Admin Agent Outputs] Bulk deleting ${ids.length} output(s)`);

    // Delete all outputs
    const deleted = await db("agent_results").whereIn("id", ids).del();

    console.log(
      `[Admin Agent Outputs] ✓ Permanently deleted ${deleted} output(s)`
    );

    return res.json({
      success: true,
      message: `${deleted} output(s) permanently deleted`,
      data: { deleted },
    });
  } catch (error: any) {
    console.error("[Admin Agent Outputs] Error bulk deleting:", error);
    return res.status(500).json({
      success: false,
      error: "BULK_DELETE_ERROR",
      message: error?.message || "Failed to bulk delete outputs",
    });
  }
});

// =====================================================================
// GET /api/admin/agent-outputs/stats/summary
// =====================================================================
/**
 * Get summary statistics for agent outputs
 */
router.get("/stats/summary", async (_req: Request, res: Response) => {
  try {
    console.log("[Admin Agent Outputs] Fetching summary statistics");

    // Get counts by status
    const statusCounts = await db("agent_results")
      .select("status")
      .count("* as count")
      .groupBy("status");

    // Get counts by agent type
    const typeCounts = await db("agent_results")
      .select("agent_type")
      .count("* as count")
      .whereNot("status", "archived")
      .groupBy("agent_type");

    // Get recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentCount = await db("agent_results")
      .where("created_at", ">=", sevenDaysAgo)
      .whereNot("status", "archived")
      .count("* as count")
      .first();

    // Format response
    const statusMap: Record<string, number> = {};
    statusCounts.forEach((row: any) => {
      statusMap[row.status] = parseInt(row.count, 10);
    });

    const typeMap: Record<string, number> = {};
    typeCounts.forEach((row: any) => {
      typeMap[row.agent_type] = parseInt(row.count, 10);
    });

    console.log("[Admin Agent Outputs] ✓ Summary statistics fetched");

    return res.json({
      success: true,
      data: {
        byStatus: statusMap,
        byAgentType: typeMap,
        recentCount: parseInt((recentCount as any)?.count || "0", 10),
        total: Object.values(statusMap).reduce((a, b) => a + b, 0),
      },
    });
  } catch (error: any) {
    console.error("[Admin Agent Outputs] Error fetching stats:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch statistics",
    });
  }
});

// =====================================================================
// EXPORTS
// =====================================================================

export default router;
