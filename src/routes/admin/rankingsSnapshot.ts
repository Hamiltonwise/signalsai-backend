/**
 * Rankings Snapshot Admin Endpoints — WO31/WO33
 *
 * POST /api/admin/rankings/run-now     — manual trigger for one org
 * POST /api/admin/rankings/run-all     — trigger all orgs (cron equivalent)
 * POST /api/admin/monday-email/run-now — manual trigger Monday email for one org
 * POST /api/admin/monday-email/run-all — trigger all orgs
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { generateSnapshotForOrg, generateAllSnapshots } from "../../services/rankingsIntelligence";
import { sendMondayEmailForOrg, sendAllMondayEmails } from "../../jobs/mondayEmail";

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

      const created = await generateSnapshotForOrg(Number(org_id));
      return res.json({
        success: true,
        created,
        message: created ? "Snapshot generated" : "Snapshot already exists for this week",
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
      const result = await generateAllSnapshots();
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

export default rankingsSnapshotRoutes;
