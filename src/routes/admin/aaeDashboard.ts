/**
 * AAE Conference Dashboard API
 *
 * GET /api/admin/aae-dashboard
 *
 * Returns real-time funnel metrics for the AAE 2026 conference.
 * Corey views this on his phone at the booth to see live conversions.
 *
 * Metrics:
 *   - Scans today (checkup.started, checkup.scan_started)
 *   - Completions (checkup.analyzed, checkup_complete, checkup.scan_completed)
 *   - Accounts created (account.created, checkup.account_created)
 *   - Shares (referral.shared, colleague.shared, checkup.share_created)
 *   - Last 10 events with timestamps
 *   - Top findings/Oz moments from today's checkups
 *   - Current MRR and projected MRR
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { db } from "../../database/connection";
import { getMRRFromDB } from "../../services/businessMetrics";

const aaeDashboardRoutes = express.Router();

aaeDashboardRoutes.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (_req, res) => {
    try {
      const hasTable = await db.schema.hasTable("behavioral_events");
      if (!hasTable) {
        return res.json({
          success: true,
          counts: { scans: 0, completions: 0, accounts: 0, shares: 0 },
          recentEvents: [],
          topFindings: [],
          mrr: { current: 0, projected: 0 },
          hourlyBreakdown: [],
        });
      }

      // Today's window (UTC start of day)
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      // Count scans
      const scansResult = await db("behavioral_events")
        .whereIn("event_type", ["checkup.started", "checkup.scan_started"])
        .where("created_at", ">=", todayStart)
        .count("id as count")
        .first();

      // Count completions
      const completionsResult = await db("behavioral_events")
        .whereIn("event_type", [
          "checkup.analyzed",
          "checkup_complete",
          "checkup.scan_completed",
          "checkup.completed",
        ])
        .where("created_at", ">=", todayStart)
        .count("id as count")
        .first();

      // Count accounts
      const accountsResult = await db("behavioral_events")
        .whereIn("event_type", ["account.created", "checkup.account_created"])
        .where("created_at", ">=", todayStart)
        .count("id as count")
        .first();

      // Count shares
      const sharesResult = await db("behavioral_events")
        .whereIn("event_type", [
          "referral.shared",
          "colleague.shared",
          "checkup.share_created",
          "checkup.competitor_invite_created",
        ])
        .where("created_at", ">=", todayStart)
        .count("id as count")
        .first();

      const counts = {
        scans: Number(scansResult?.count || 0),
        completions: Number(completionsResult?.count || 0),
        accounts: Number(accountsResult?.count || 0),
        shares: Number(sharesResult?.count || 0),
      };

      // Last 10 events (any relevant type, today)
      const relevantTypes = [
        "checkup.started",
        "checkup.scan_started",
        "checkup.analyzed",
        "checkup_complete",
        "checkup.scan_completed",
        "checkup.completed",
        "account.created",
        "checkup.account_created",
        "referral.shared",
        "colleague.shared",
        "checkup.share_created",
        "checkup.competitor_invite_created",
        "checkup.gate_viewed",
        "checkup.email_captured",
      ];

      const recentEvents = await db("behavioral_events")
        .leftJoin(
          "organizations",
          "behavioral_events.org_id",
          "organizations.id",
        )
        .whereIn("behavioral_events.event_type", relevantTypes)
        .where("behavioral_events.created_at", ">=", todayStart)
        .orderBy("behavioral_events.created_at", "desc")
        .limit(10)
        .select(
          "behavioral_events.id",
          "behavioral_events.event_type",
          "behavioral_events.org_id",
          "behavioral_events.properties",
          "behavioral_events.created_at",
          "organizations.name as org_name",
        );

      const formattedEvents = recentEvents.map((e: any) => {
        const props =
          typeof e.properties === "string"
            ? JSON.parse(e.properties)
            : e.properties || {};
        return {
          id: e.id,
          event_type: e.event_type,
          org_name: e.org_name || props.practice_name || props.name || "Unknown",
          city: props.city || props.location || null,
          created_at: e.created_at,
        };
      });

      // Top findings: look for checkup results with scores or findings
      const topFindings = await db("behavioral_events")
        .whereIn("event_type", [
          "checkup.analyzed",
          "checkup.scan_completed",
          "checkup.completed",
        ])
        .where("created_at", ">=", todayStart)
        .orderBy("created_at", "desc")
        .limit(20)
        .select("properties", "created_at");

      const findings: Array<{
        practice: string;
        finding: string;
        score: number | null;
        created_at: string;
      }> = [];

      for (const row of topFindings) {
        const props =
          typeof row.properties === "string"
            ? JSON.parse(row.properties)
            : row.properties || {};

        const practice =
          props.practice_name || props.name || props.business_name || "A practice";

        // Extract Oz moments or notable findings
        if (props.ozMoments && Array.isArray(props.ozMoments)) {
          for (const oz of props.ozMoments) {
            findings.push({
              practice,
              finding: typeof oz === "string" ? oz : oz.text || oz.finding || JSON.stringify(oz),
              score: props.score || props.overall_score || null,
              created_at: row.created_at,
            });
          }
        } else if (props.findings && Array.isArray(props.findings)) {
          for (const f of props.findings.slice(0, 2)) {
            findings.push({
              practice,
              finding: typeof f === "string" ? f : f.text || f.finding || JSON.stringify(f),
              score: props.score || props.overall_score || null,
              created_at: row.created_at,
            });
          }
        } else if (props.score || props.overall_score) {
          findings.push({
            practice,
            finding: props.summary || props.headline || `Score: ${props.score || props.overall_score}`,
            score: props.score || props.overall_score || null,
            created_at: row.created_at,
          });
        }
      }

      // MRR from single source of truth
      let currentMrr = 0;
      let projectedMrr = 0;
      try {
        const mrrData = await getMRRFromDB();
        currentMrr = mrrData.total;
        projectedMrr = currentMrr;
      } catch {
        // If orgs table doesn't exist or query fails, use 0
      }

      return res.json({
        success: true,
        counts,
        recentEvents: formattedEvents,
        topFindings: findings.slice(0, 10),
        mrr: {
          current: currentMrr,
          projected: projectedMrr,
        },
      });
    } catch (error: any) {
      console.error("[AAEDashboard] Error:", error.message);
      return res
        .status(500)
        .json({ success: false, error: "Failed to load AAE dashboard data" });
    }
  },
);

export default aaeDashboardRoutes;
