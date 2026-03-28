/**
 * Dashboard Context API -- WO-CHECKUP-SESSION-KEY
 *
 * GET /api/user/dashboard-context
 *
 * On first load after account creation: if the org has checkup data
 * stored from the Checkup gate, returns it so the frontend can
 * pre-populate the position card before the first ranking snapshot runs.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { db } from "../../database/connection";

const dashboardContextRoutes = express.Router();

/**
 * GET /api/user/dashboard-context
 *
 * Returns checkup_context if session_checkup_key is set and checkup_data exists.
 * This gives new accounts immediate dashboard content from their Checkup results.
 */
dashboardContextRoutes.get(
  "/",
  authenticateToken,
  async (req: any, res) => {
    try {
      const orgId = req.user?.organizationId || req.organizationId;
      if (!orgId) return res.status(401).json({ success: false, error: "Auth required" });

      const org = await db("organizations")
        .where({ id: orgId })
        .select(
          "checkup_score",
          "checkup_data",
          "top_competitor_name",
          "session_checkup_key",
          "first_login_at",
          "name",
          "research_brief",
          "patientpath_status",
          "week1_win_headline",
          "week1_win_detail",
          "week1_win_type",
          "week1_win_shown_at",
          "created_at",
        )
        .first();

      if (!org) return res.status(404).json({ success: false, error: "Org not found" });

      // Only include checkup context if data exists
      let checkupContext = null;
      if (org.session_checkup_key && org.checkup_data) {
        const data = typeof org.checkup_data === "string"
          ? JSON.parse(org.checkup_data)
          : org.checkup_data;

        checkupContext = {
          score: org.checkup_score,
          data,
          top_competitor_name: org.top_competitor_name,
          session_key: org.session_checkup_key,
        };
      }

      // Research brief for PatientPath reveal (WO-43)
      let researchFindings: string[] | null = null;
      if (org.research_brief && org.patientpath_status) {
        try {
          const brief = typeof org.research_brief === "string" ? JSON.parse(org.research_brief) : org.research_brief;
          const findings = brief?.findings || brief?.key_findings || [];
          if (Array.isArray(findings) && findings.length > 0) {
            researchFindings = findings.slice(0, 3).map((f: any) => typeof f === "string" ? f : f.text || f.detail || f.finding || String(f));
          }
        } catch { /* ignore parse errors */ }
      }

      // Week 1 Win card (WO-48): show for 7 days after generation
      let week1Win = null;
      if (org.week1_win_headline && org.week1_win_shown_at) {
        const shownAt = new Date(org.week1_win_shown_at);
        const daysSinceShown = (Date.now() - shownAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceShown <= 7) {
          week1Win = {
            headline: org.week1_win_headline,
            detail: org.week1_win_detail,
            type: org.week1_win_type,
          };
        }
      }

      return res.json({
        success: true,
        checkup_context: checkupContext,
        research_findings: researchFindings,
        patientpath_status: org.patientpath_status || null,
        has_ranking_snapshot: false,
        week1_win: week1Win,
      });
    } catch (error: any) {
      console.error("[DashboardContext] Error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to load dashboard context" });
    }
  },
);

export default dashboardContextRoutes;
