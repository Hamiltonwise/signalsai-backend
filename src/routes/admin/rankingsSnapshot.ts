/**
 * Rankings Snapshot Admin Endpoints — WO31/WO33
 *
 * POST /api/admin/rankings/run-now     — manual trigger for one org
 * POST /api/admin/rankings/run-all     — trigger all orgs (cron equivalent)
 * POST /api/admin/monday-email/run-now — manual trigger Monday email for one org
 * POST /api/admin/monday-email/run-all — trigger all orgs
 * POST /api/admin/score-recalc/run-now — manual trigger score recalc for one org
 * POST /api/admin/score-recalc/run-all — trigger all orgs (weekly cron equivalent)
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { generateSnapshotForOrg, generateAllSnapshots } from "../../services/rankingsIntelligence";
import { sendMondayEmailForOrg, sendAllMondayEmails } from "../../jobs/mondayEmail";
import { recalculateScore, recalculateAllScores } from "../../services/weeklyScoreRecalc";

const rankingsSnapshotRoutes = express.Router();

// ─── WO31: Rankings snapshot manual triggers ────────────────────────

rankingsSnapshotRoutes.post(
  "/rankings/run-now",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { org_id } = req.body;
      if (!org_id) {
        return res.status(400).json({ success: false, error: "org_id required" });
      }

      const force = req.body.force !== false; // Default to force refresh
      const created = await generateSnapshotForOrg(Number(org_id), force);
      return res.json({
        success: true,
        created,
        message: created ? "Snapshot generated" : "Snapshot already exists for this week (use force: true to overwrite)",
      });
    } catch (error: any) {
      console.error("[RankingsSnapshot] Run-now error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to generate snapshot" });
    }
  },
);

rankingsSnapshotRoutes.post(
  "/rankings/run-all",
  authenticateToken,
  superAdminMiddleware,
  async (_req, res) => {
    try {
      const force = _req.body?.force !== false; // Default to force refresh
      const result = await generateAllSnapshots(force);
      return res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("[RankingsSnapshot] Run-all error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to generate snapshots" });
    }
  },
);

// ─── WO33: Monday email manual triggers ─────────────────────────────

rankingsSnapshotRoutes.post(
  "/monday-email/run-now",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { org_id } = req.body;
      if (!org_id) {
        return res.status(400).json({ success: false, error: "org_id required" });
      }

      const sent = await sendMondayEmailForOrg(Number(org_id));
      return res.json({
        success: true,
        sent,
        message: sent ? "Email sent" : "Email not sent (check logs)",
      });
    } catch (error: any) {
      console.error("[MondayEmail] Run-now error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to send email" });
    }
  },
);

rankingsSnapshotRoutes.post(
  "/monday-email/run-all",
  authenticateToken,
  superAdminMiddleware,
  async (_req, res) => {
    try {
      const result = await sendAllMondayEmails();
      return res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("[MondayEmail] Run-all error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to send emails" });
    }
  },
);

// -- Score Recalc manual triggers ───────────────────────────────────

rankingsSnapshotRoutes.post(
  "/score-recalc/run-now",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { org_id } = req.body;
      if (!org_id) {
        return res.status(400).json({ success: false, error: "org_id required" });
      }

      const result = await recalculateScore(Number(org_id));
      if (!result) {
        return res.json({
          success: true,
          recalculated: false,
          message: "Org skipped (no checkup_data, no placeId, or Google returned nothing)",
        });
      }

      return res.json({
        success: true,
        recalculated: true,
        previousScore: result.previousScore,
        newScore: result.newScore,
        delta: result.delta,
        changes: result.changes,
        subScores: result.subScores,
      });
    } catch (error: any) {
      console.error("[ScoreRecalc] Run-now error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to recalculate score" });
    }
  },
);

rankingsSnapshotRoutes.post(
  "/score-recalc/run-all",
  authenticateToken,
  superAdminMiddleware,
  async (_req, res) => {
    try {
      const result = await recalculateAllScores();
      return res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("[ScoreRecalc] Run-all error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to recalculate scores" });
    }
  },
);

// ─── CRO Engine Manual Trigger ─────────────────────────────────────

import { runCROForAllOrgs } from "../../services/croEngine";

rankingsSnapshotRoutes.post(
  "/cro/run-all",
  authenticateToken,
  superAdminMiddleware,
  async (_req, res) => {
    try {
      const result = await runCROForAllOrgs();
      return res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("[CRO Engine] Run-all error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to run CRO engine" });
    }
  },
);

export default rankingsSnapshotRoutes;
