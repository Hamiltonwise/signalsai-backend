/**
 * Vocabulary Config API
 *
 * GET  /api/org/:orgId/vocabulary — returns vertical defaults merged with org overrides
 * PATCH /api/org/:orgId/vocabulary — update org-level overrides
 *
 * The vocabulary config is DB-driven per account. Static defaults exist as seed data.
 * When no override exists, the vertical default is returned.
 * Adding a vertical = one database row. No code change.
 */

import express from "express";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../middleware/rbac";
import { db } from "../database/connection";

const vocabularyRoutes = express.Router();

// Default fallback config if org has no vertical assigned and no defaults match
const UNIVERSAL_FALLBACK: Record<string, string | number> = {
  patientTerm: "customer",
  referralTerm: "referral source",
  caseType: "new customer",
  primaryMetric: "customer acquisition",
  healthScoreLabel: "Google Health Check",
  competitorTerm: "competitor",
  providerTerm: "owner",
  locationTerm: "business",
  avgCaseValue: 500,
};

/**
 * GET /api/org/:orgId/vocabulary
 *
 * Returns the merged vocabulary config:
 * 1. Start with universal fallback
 * 2. Overlay vertical defaults (from vocabulary_defaults table)
 * 3. Overlay org-specific overrides (from vocabulary_configs table)
 */
vocabularyRoutes.get(
  "/:orgId/vocabulary",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = parseInt(req.params.orgId, 10);
      if (isNaN(orgId)) {
        return res.status(400).json({ success: false, error: "Invalid orgId" });
      }

      // Verify user has access to this org
      if (req.organizationId !== orgId) {
        return res.status(403).json({ success: false, error: "Access denied" });
      }

      // Get org to determine vertical
      const org = await db("organizations").where({ id: orgId }).first();
      const vertical = org?.vertical || org?.organization_type || null;

      // Check for org-level override first (it stores the vertical too)
      const orgConfig = await db("vocabulary_configs").where({ org_id: orgId }).first();
      const orgVertical = orgConfig?.vertical || vertical;
      const orgOverrides = orgConfig?.overrides
        ? typeof orgConfig.overrides === "string"
          ? JSON.parse(orgConfig.overrides)
          : orgConfig.overrides
        : {};

      // Get vertical defaults
      let verticalDefaults: Record<string, any> = {};
      if (orgVertical) {
        const defaultRow = await db("vocabulary_defaults").where({ vertical: orgVertical }).first();
        if (defaultRow) {
          verticalDefaults = typeof defaultRow.config === "string"
            ? JSON.parse(defaultRow.config)
            : defaultRow.config;
        }
      }

      // Merge: fallback → vertical defaults → org overrides
      const merged = {
        ...UNIVERSAL_FALLBACK,
        ...verticalDefaults,
        ...orgOverrides,
        vertical: orgVertical || "general",
      };

      return res.json({ success: true, vocabulary: merged });
    } catch (error: any) {
      console.error("[Vocabulary] Error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to load vocabulary" });
    }
  },
);

/**
 * PATCH /api/org/:orgId/vocabulary
 *
 * Update org-level vocabulary overrides. Creates the config row if it doesn't exist.
 * Body: { vertical?: string, overrides?: Record<string, string> }
 */
vocabularyRoutes.patch(
  "/:orgId/vocabulary",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = parseInt(req.params.orgId, 10);
      if (isNaN(orgId)) {
        return res.status(400).json({ success: false, error: "Invalid orgId" });
      }

      if (req.organizationId !== orgId) {
        return res.status(403).json({ success: false, error: "Access denied" });
      }

      const { vertical, overrides } = req.body;

      const existing = await db("vocabulary_configs").where({ org_id: orgId }).first();

      if (existing) {
        const updates: Record<string, any> = {};
        if (vertical) updates.vertical = vertical;
        if (overrides) {
          const currentOverrides = typeof existing.overrides === "string"
            ? JSON.parse(existing.overrides)
            : existing.overrides;
          updates.overrides = JSON.stringify({ ...currentOverrides, ...overrides });
        }
        await db("vocabulary_configs").where({ org_id: orgId }).update(updates);
      } else {
        await db("vocabulary_configs").insert({
          org_id: orgId,
          vertical: vertical || "general",
          overrides: JSON.stringify(overrides || {}),
        });
      }

      return res.json({ success: true, message: "Vocabulary updated" });
    } catch (error: any) {
      console.error("[Vocabulary] Update error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to update vocabulary" });
    }
  },
);

/**
 * GET /api/vocabulary/defaults
 *
 * Returns all vertical defaults. Admin use — for seeing what verticals are available.
 */
vocabularyRoutes.get(
  "/defaults",
  async (_req, res) => {
    try {
      const defaults = await db("vocabulary_defaults").select("*").orderBy("vertical", "asc");
      return res.json({
        success: true,
        verticals: defaults.map((d: any) => ({
          vertical: d.vertical,
          config: typeof d.config === "string" ? JSON.parse(d.config) : d.config,
        })),
      });
    } catch (error: any) {
      console.error("[Vocabulary] Defaults error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to load defaults" });
    }
  },
);

export default vocabularyRoutes;
