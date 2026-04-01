/**
 * Admin Kill Switch Routes
 *
 * Emergency stop for all agent execution.
 * All endpoints require superAdmin auth.
 *
 * POST /api/admin/kill-switch/activate   - { reason: string }
 * POST /api/admin/kill-switch/deactivate
 * GET  /api/admin/kill-switch/status
 */

import express, { Response } from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { AuthRequest } from "../../middleware/auth";
import {
  activateKillSwitch,
  deactivateKillSwitch,
  isKillSwitchActive,
} from "../../services/agents/killSwitch";

const killSwitchRoutes = express.Router();

// All routes require superAdmin
killSwitchRoutes.use(authenticateToken, superAdminMiddleware);

// POST /activate
killSwitchRoutes.post("/activate", async (req: AuthRequest, res: Response) => {
  try {
    const { reason } = req.body || {};
    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      return res.status(400).json({ success: false, error: "Reason is required" });
    }

    const activatedBy = req.user?.email || "unknown";
    await activateKillSwitch(reason.trim(), activatedBy);

    return res.json({ success: true, message: "Kill switch activated. All agents halted." });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[KillSwitch API] Activate error:", message);
    return res.status(500).json({ success: false, error: "Failed to activate kill switch" });
  }
});

// POST /deactivate
killSwitchRoutes.post("/deactivate", async (_req: AuthRequest, res: Response) => {
  try {
    await deactivateKillSwitch();
    return res.json({ success: true, message: "Kill switch deactivated. Agents resuming." });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[KillSwitch API] Deactivate error:", message);
    return res.status(500).json({ success: false, error: "Failed to deactivate kill switch" });
  }
});

// GET /status
killSwitchRoutes.get("/status", async (_req: AuthRequest, res: Response) => {
  try {
    const status = await isKillSwitchActive();
    return res.json({
      success: true,
      ...status,
      activatedAt: status.activatedAt?.toISOString() || null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[KillSwitch API] Status error:", message);
    return res.status(500).json({ success: false, error: "Failed to check kill switch status" });
  }
});

export default killSwitchRoutes;
