/**
 * DFY Approval Routes
 *
 * Two audiences, one file:
 * 1. Public: One-tap approve/reject from Monday email (token-based, no login)
 * 2. Authenticated: List/manage pending actions from dashboard
 *
 * The approve endpoint is the most important URL in the product.
 * Owner taps it in their email, the action goes live. No login. No friction.
 */

import { Router, Request, Response } from "express";
import { db } from "../database/connection";
import { executeApprovedAction } from "../services/dfyEngine";
import { APP_URL } from "../emails/templates/base";

const router = Router();

// =====================================================================
// PUBLIC: One-tap approve from email (token-based, no auth required)
// =====================================================================

/**
 * GET /api/actions/approve/:token
 *
 * Owner clicks this in their Monday email. One tap.
 * Validates token, checks expiration, executes the action, redirects to confirmation.
 */
router.get("/approve/:token", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const action = await db("pending_actions")
      .where({ approval_token: token })
      .first();

    if (!action) {
      return res.redirect(`${APP_URL}/home?action_error=not_found`);
    }

    if (action.status === "executed") {
      return res.redirect(`${APP_URL}/home?action_status=already_done`);
    }

    if (action.status === "rejected") {
      return res.redirect(`${APP_URL}/home?action_status=already_rejected`);
    }

    if (action.status !== "draft") {
      return res.redirect(`${APP_URL}/home?action_status=invalid`);
    }

    // Check expiration
    if (new Date(action.expires_at) < new Date()) {
      await db("pending_actions")
        .where({ id: action.id })
        .update({ status: "expired" });
      return res.redirect(`${APP_URL}/home?action_status=expired`);
    }

    // Mark as approved
    await db("pending_actions")
      .where({ id: action.id })
      .update({
        status: "approved",
        approved_at: new Date(),
      });

    // Execute the action
    try {
      const result = await executeApprovedAction(action);

      await db("pending_actions")
        .where({ id: action.id })
        .update({
          status: "executed",
          executed_at: new Date(),
          execution_result: JSON.stringify(result),
        });

      return res.redirect(`${APP_URL}/home?action_status=approved&type=${action.action_type}`);
    } catch (execErr: any) {
      // Approved but execution failed -- record the error, don't revert approval
      await db("pending_actions")
        .where({ id: action.id })
        .update({
          execution_result: JSON.stringify({
            success: false,
            error: execErr.message,
          }),
        });

      console.error(`[DFY Approval] Execution failed for ${action.id}: ${execErr.message}`);
      return res.redirect(`${APP_URL}/home?action_status=approved&exec_error=true`);
    }
  } catch (err: any) {
    console.error(`[DFY Approval] Error: ${err.message}`);
    return res.redirect(`${APP_URL}/home?action_error=server`);
  }
});

/**
 * GET /api/actions/reject/:token
 *
 * Owner clicks "Skip" in their Monday email.
 * Marks the action as rejected. Redirects to confirmation.
 */
router.get("/reject/:token", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const action = await db("pending_actions")
      .where({ approval_token: token })
      .first();

    if (!action) {
      return res.redirect(`${APP_URL}/home?action_error=not_found`);
    }

    if (action.status !== "draft") {
      return res.redirect(`${APP_URL}/home?action_status=already_${action.status}`);
    }

    await db("pending_actions")
      .where({ id: action.id })
      .update({
        status: "rejected",
        rejected_at: new Date(),
      });

    return res.redirect(`${APP_URL}/home?action_status=rejected&type=${action.action_type}`);
  } catch (err: any) {
    console.error(`[DFY Approval] Reject error: ${err.message}`);
    return res.redirect(`${APP_URL}/home?action_error=server`);
  }
});

// =====================================================================
// INLINE: JSON API for dashboard approve/reject (no redirect)
// =====================================================================

/**
 * POST /api/actions/approve/:token
 *
 * Dashboard calls this via fetch(). Returns JSON instead of redirecting.
 * Same logic as GET version but for in-app use.
 */
router.post("/approve/:token", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const action = await db("pending_actions")
      .where({ approval_token: token })
      .first();

    if (!action) return res.status(404).json({ error: "not_found" });
    if (action.status === "executed") return res.json({ status: "already_done" });
    if (action.status === "rejected") return res.json({ status: "already_rejected" });
    if (action.status !== "draft") return res.status(400).json({ error: "invalid_status", status: action.status });

    if (new Date(action.expires_at) < new Date()) {
      await db("pending_actions").where({ id: action.id }).update({ status: "expired" });
      return res.status(410).json({ error: "expired" });
    }

    await db("pending_actions").where({ id: action.id }).update({
      status: "approved",
      approved_at: new Date(),
    });

    try {
      const result = await executeApprovedAction(action);
      await db("pending_actions").where({ id: action.id }).update({
        status: "executed",
        executed_at: new Date(),
        execution_result: JSON.stringify(result),
      });
      return res.json({ status: "executed", result });
    } catch (execErr: any) {
      await db("pending_actions").where({ id: action.id }).update({
        execution_result: JSON.stringify({ success: false, error: execErr.message }),
      });
      return res.status(500).json({ status: "approved", exec_error: execErr.message });
    }
  } catch (err: any) {
    return res.status(500).json({ error: "server_error", message: err.message });
  }
});

/**
 * POST /api/actions/reject/:token
 *
 * Dashboard calls this via fetch(). Returns JSON.
 */
router.post("/reject/:token", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const action = await db("pending_actions")
      .where({ approval_token: token })
      .first();

    if (!action) return res.status(404).json({ error: "not_found" });
    if (action.status !== "draft") return res.json({ status: `already_${action.status}` });

    await db("pending_actions").where({ id: action.id }).update({
      status: "rejected",
      rejected_at: new Date(),
    });

    return res.json({ status: "rejected" });
  } catch (err: any) {
    return res.status(500).json({ error: "server_error", message: err.message });
  }
});

// =====================================================================
// AUTHENTICATED: Dashboard management of pending actions
// =====================================================================

/**
 * GET /api/actions/pending/:orgId
 *
 * List all draft/pending actions for an org.
 * Used by dashboard to show "Actions waiting for your approval" card.
 */
router.get("/pending/:orgId", async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(req.params.orgId, 10);
    if (!orgId) return res.status(400).json({ error: "Invalid org ID" });

    const actions = await db("pending_actions")
      .where({ org_id: orgId, status: "draft" })
      .where("expires_at", ">", new Date())
      .orderBy("created_at", "desc")
      .select(
        "id",
        "action_type",
        "status",
        "preview_title",
        "preview_body",
        "approval_token",
        "created_at",
        "expires_at",
      );

    return res.json({ actions });
  } catch (err: any) {
    console.error(`[DFY Approval] List error: ${err.message}`);
    return res.status(500).json({ error: "Failed to fetch pending actions" });
  }
});

/**
 * GET /api/actions/history/:orgId
 *
 * Recent action history (last 30 days, all statuses).
 * Shows what was approved, rejected, expired.
 */
router.get("/history/:orgId", async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(req.params.orgId, 10);
    if (!orgId) return res.status(400).json({ error: "Invalid org ID" });

    const actions = await db("pending_actions")
      .where({ org_id: orgId })
      .where("created_at", ">=", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      .orderBy("created_at", "desc")
      .limit(50)
      .select(
        "id",
        "action_type",
        "status",
        "preview_title",
        "preview_body",
        "created_at",
        "approved_at",
        "executed_at",
        "rejected_at",
      );

    return res.json({ actions });
  } catch (err: any) {
    console.error(`[DFY Approval] History error: ${err.message}`);
    return res.status(500).json({ error: "Failed to fetch action history" });
  }
});

export default router;
