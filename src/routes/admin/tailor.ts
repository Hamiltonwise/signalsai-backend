/**
 * Tailor API -- Per-org text overrides and customization.
 *
 * GET  /api/admin/tailor - List text overrides for an org
 * POST /api/admin/tailor - Create or update a text override
 */

import express, { Response } from "express";
import { db } from "../../database/connection";
import { authenticateToken, AuthRequest } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";

const router = express.Router();

// GET /api/admin/tailor -- returns all text overrides for the user's org (or global)
router.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const overrides = await db("tailor_overrides")
        .whereNull("org_id")
        .orWhere("org_id", null)
        .orderBy("override_key", "asc");

      return res.json({ success: true, overrides });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[TAILOR] GET error:", message);
      return res.status(500).json({ success: false, error: message });
    }
  },
);

// PUT /api/admin/tailor -- upsert a text override { key, value }
router.put(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { key, value } = req.body;

      if (!key || typeof key !== "string") {
        return res.status(400).json({ success: false, error: "key is required" });
      }
      if (value === undefined || typeof value !== "string") {
        return res.status(400).json({ success: false, error: "value is required" });
      }

      const userId = req.user?.userId ?? null;

      // Upsert: insert or update on conflict (org_id, override_key)
      const existing = await db("tailor_overrides")
        .where({ org_id: null, override_key: key })
        .first();

      if (existing) {
        await db("tailor_overrides")
          .where({ id: existing.id })
          .update({
            override_value: value,
            updated_by: userId,
            updated_at: db.fn.now(),
          });
      } else {
        await db("tailor_overrides").insert({
          org_id: null,
          override_key: key,
          override_value: value,
          updated_by: userId,
        });
      }

      console.log(`[TAILOR] Saved override "${key}" by user ${userId}`);
      return res.json({ success: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[TAILOR] PUT error:", message);
      return res.status(500).json({ success: false, error: message });
    }
  },
);

export default router;
