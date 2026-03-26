/**
 * Founder Settings API — personal config for Founder Mode
 *
 * GET   /api/founder/settings  — fetch settings (creates row if missing)
 * PATCH /api/founder/settings  — update any JSONB column or cash_on_hand
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { db } from "../../database/connection";

const founderSettingsRoutes = express.Router();

/**
 * GET /api/founder/settings
 */
founderSettingsRoutes.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (req: any, res) => {
    try {
      const orgId = req.user?.organizationId || req.organizationId;
      if (!orgId) return res.status(401).json({ success: false, error: "No org" });

      let row = await db("founder_settings").where({ org_id: orgId }).first();
      if (!row) {
        // Auto-create with defaults
        const [created] = await db("founder_settings")
          .insert({ org_id: orgId })
          .returning("*");
        row = created;
      }

      return res.json({
        success: true,
        settings: {
          financial_config: row.financial_config || {},
          watch_ledger: row.watch_ledger || [],
          competitive_notes: row.competitive_notes || {},
          founder_cash_on_hand: row.founder_cash_on_hand || 0,
          updated_at: row.updated_at,
        },
      });
    } catch (error: any) {
      console.error("[Founder] Settings fetch error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to load settings" });
    }
  },
);

/**
 * PATCH /api/founder/settings
 *
 * Body can contain any combination of:
 *   financial_config, watch_ledger, competitive_notes, founder_cash_on_hand
 */
founderSettingsRoutes.patch(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (req: any, res) => {
    try {
      const orgId = req.user?.organizationId || req.organizationId;
      if (!orgId) return res.status(401).json({ success: false, error: "No org" });

      const { financial_config, watch_ledger, competitive_notes, founder_cash_on_hand } = req.body;

      const updates: Record<string, any> = { updated_at: db.fn.now() };
      if (financial_config !== undefined) updates.financial_config = JSON.stringify(financial_config);
      if (watch_ledger !== undefined) updates.watch_ledger = JSON.stringify(watch_ledger);
      if (competitive_notes !== undefined) updates.competitive_notes = JSON.stringify(competitive_notes);
      if (founder_cash_on_hand !== undefined) updates.founder_cash_on_hand = Number(founder_cash_on_hand) || 0;

      // Upsert
      const existing = await db("founder_settings").where({ org_id: orgId }).first();
      if (existing) {
        await db("founder_settings").where({ org_id: orgId }).update(updates);
      } else {
        await db("founder_settings").insert({ org_id: orgId, ...updates });
      }

      const row = await db("founder_settings").where({ org_id: orgId }).first();

      return res.json({
        success: true,
        settings: {
          financial_config: row.financial_config || {},
          watch_ledger: row.watch_ledger || [],
          competitive_notes: row.competitive_notes || {},
          founder_cash_on_hand: row.founder_cash_on_hand || 0,
          updated_at: row.updated_at,
        },
      });
    } catch (error: any) {
      console.error("[Founder] Settings save error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to save settings" });
    }
  },
);

export default founderSettingsRoutes;
