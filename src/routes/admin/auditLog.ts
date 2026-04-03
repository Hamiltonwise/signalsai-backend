import express, { Request, Response } from "express";
import { db } from "../../database/connection";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";

const router = express.Router();

// ── GET /api/admin/audit-log ─────────────────────────────────────
// Returns audit trail, optionally filtered by target.

router.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const targetId = req.query.target_id as string | undefined;
      const targetType = req.query.target_type as string | undefined;
      const actorId = req.query.actor_id as string | undefined;
      const action = req.query.action as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
      const offset = parseInt(req.query.offset as string, 10) || 0;

      let query = db("audit_log").orderBy("occurred_at", "desc").limit(limit).offset(offset);

      if (targetId) query = query.where("target_id", targetId);
      if (targetType) query = query.where("target_type", targetType);
      if (actorId) query = query.where("actor_id", actorId);
      if (action) query = query.where("action", action);

      const events = await query;

      return res.json({ success: true, events, count: events.length });
    } catch (err: any) {
      console.error("[AUDIT-LOG] Query error:", err.message);
      return res.status(500).json({ success: false, error: "Internal error" });
    }
  },
);

// T2 registers GET /api/admin/audit-log
export default router;
