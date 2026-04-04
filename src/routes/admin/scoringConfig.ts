/**
 * Scoring Config Admin Endpoints
 *
 * GET  /api/admin/scoring-config          - list all config rows
 * PUT  /api/admin/scoring-config          - update config values
 * POST /api/admin/scoring-config/preview  - preview score with proposed weights
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { db } from "../../database/connection";
import {
  calculateClarityScore,
  clearScoringConfigCache,
  getScoringDefaults,
  loadScoringConfig,
  type ScoringConfig,
} from "../../services/clarityScoring";

const scoringConfigRoutes = express.Router();

// GET /api/admin/scoring-config
scoringConfigRoutes.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (_req, res) => {
    try {
      const rows = await db("scoring_config")
        .select("id", "key", "value", "label", "description", "updated_by", "created_at", "updated_at")
        .orderBy("id", "asc");

      return res.json({ success: true, config: rows, defaults: getScoringDefaults() });
    } catch (error: any) {
      // Table may not exist yet
      console.error("[ScoringConfig] GET error:", error.message);
      return res.json({ success: true, config: [], defaults: getScoringDefaults(), note: "Config table not available, using defaults." });
    }
  },
);

// PUT /api/admin/scoring-config
// Body: { updates: [{ key: string, value: number }], updated_by?: string }
scoringConfigRoutes.put(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { updates, updated_by } = req.body;
      if (!updates || !Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ success: false, error: "updates array required" });
      }

      const results: Array<{ key: string; old_value: number; new_value: number }> = [];

      for (const item of updates) {
        if (!item.key || item.value === undefined || item.value === null) continue;
        const numValue = Number(item.value);
        if (isNaN(numValue)) continue;

        const existing = await db("scoring_config").where({ key: item.key }).first();
        if (existing) {
          await db("scoring_config").where({ key: item.key }).update({
            value: numValue,
            updated_by: updated_by || (req as any).user?.email || "admin",
            updated_at: db.fn.now(),
          });
          results.push({ key: item.key, old_value: existing.value, new_value: numValue });
        }
      }

      // Clear cache so next scoring call picks up new values
      clearScoringConfigCache();

      return res.json({ success: true, updated: results.length, changes: results });
    } catch (error: any) {
      console.error("[ScoringConfig] PUT error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to update scoring config" });
    }
  },
);

// POST /api/admin/scoring-config/preview
// Body: { org_id: number, proposed: Record<string, number> }
// Returns old score vs. new score for the given org
scoringConfigRoutes.post(
  "/preview",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { org_id, proposed } = req.body;
      if (!org_id) {
        return res.status(400).json({ success: false, error: "org_id required" });
      }
      if (!proposed || typeof proposed !== "object") {
        return res.status(400).json({ success: false, error: "proposed config object required" });
      }

      // Look up org's checkup data
      const org = await db("organizations")
        .where({ id: org_id })
        .select("checkup_data", "specialty")
        .first();

      if (!org || !org.checkup_data) {
        return res.status(404).json({ success: false, error: "Org not found or no checkup data" });
      }

      const checkup = typeof org.checkup_data === "string"
        ? JSON.parse(org.checkup_data)
        : org.checkup_data;

      // Build PlaceData from checkup
      const placeData = {
        rating: checkup.rating ?? checkup.place?.rating ?? 0,
        reviewCount: checkup.reviewCount ?? checkup.place?.reviewCount ?? 0,
        photosCount: checkup.photosCount ?? checkup.place?.photosCount ?? 0,
        hasHours: checkup.hasHours ?? checkup.place?.hasHours ?? false,
        hasPhone: checkup.hasPhone ?? checkup.place?.hasPhone ?? false,
        hasWebsite: checkup.hasWebsite ?? checkup.place?.hasWebsite ?? false,
        hasEditorialSummary: checkup.hasEditorialSummary ?? checkup.place?.hasEditorialSummary ?? false,
        businessStatus: checkup.businessStatus ?? checkup.place?.businessStatus ?? "OPERATIONAL",
        reviews: checkup.reviews ?? checkup.place?.reviews ?? [],
      };

      const competitors = checkup.competitors ?? [];
      const specialty = org.specialty ?? checkup.specialty ?? "general";
      const googlePosition = checkup.googlePosition ?? checkup.position ?? null;

      // Ensure config cache is loaded
      await loadScoringConfig();

      // Score with current config (no overrides)
      const oldResult = calculateClarityScore(placeData, competitors, specialty, googlePosition);

      // Score with proposed overrides
      const proposedConfig: ScoringConfig = {};
      for (const [key, val] of Object.entries(proposed)) {
        proposedConfig[key] = Number(val);
      }
      const newResult = calculateClarityScore(placeData, competitors, specialty, googlePosition, proposedConfig);

      return res.json({
        success: true,
        org_id,
        old: {
          composite: oldResult.composite,
          subScores: oldResult.subScores,
          label: oldResult.scoreLabel,
        },
        new: {
          composite: newResult.composite,
          subScores: newResult.subScores,
          label: newResult.scoreLabel,
        },
        delta: newResult.composite - oldResult.composite,
      });
    } catch (error: any) {
      console.error("[ScoringConfig] Preview error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to preview scoring config" });
    }
  },
);

export default scoringConfigRoutes;
