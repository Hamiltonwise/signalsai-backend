import express, { Request, Response } from "express";
import { db } from "../../database/connection";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { invalidateCache } from "../../services/featureFlags";

const router = express.Router();

// ── GET /api/admin/feature-flags ─────────────────────────────────
// List all feature flags.

router.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (_req: Request, res: Response) => {
    try {
      const flags = await db("feature_flags").orderBy("flag_name", "asc");
      return res.json({ success: true, flags });
    } catch (err: any) {
      console.error("[FEATURE-FLAGS] List error:", err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  },
);

// ── PATCH /api/admin/feature-flags/:name ─────────────────────────
// Toggle or update a feature flag.

router.patch(
  "/:name",
  authenticateToken,
  superAdminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const { is_enabled, enabled_for_orgs, description } = req.body;

      const flag = await db("feature_flags").where({ flag_name: name }).first();
      if (!flag) {
        return res.status(404).json({ success: false, error: `Flag "${name}" not found` });
      }

      const updates: Record<string, unknown> = {};
      if (is_enabled !== undefined) updates.is_enabled = is_enabled;
      if (enabled_for_orgs !== undefined) updates.enabled_for_orgs = JSON.stringify(enabled_for_orgs);
      if (description !== undefined) updates.description = description;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, error: "No updates provided" });
      }

      await db("feature_flags").where({ flag_name: name }).update(updates);

      // Bust the in-memory cache
      invalidateCache();

      const updated = await db("feature_flags").where({ flag_name: name }).first();
      console.log(`[FEATURE-FLAGS] Updated flag "${name}":`, updates);

      return res.json({ success: true, flag: updated });
    } catch (err: any) {
      console.error("[FEATURE-FLAGS] Update error:", err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  },
);

// T2 registers feature flag routes
export default router;
