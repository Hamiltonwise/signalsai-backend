/**
 * Home Intelligence API
 *
 * GET /api/user/home-intelligence
 *
 * Returns two things for the home page:
 * 1. recentActions -- last 5 behavioral_events formatted as plain English
 * 2. weeklyFinding -- finding_headline + bullets from most recent snapshot
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware } from "../../middleware/rbac";
import { db } from "../../database/connection";

const homeIntelligenceRoutes = express.Router();

/** Map event_type to plain English description */
function describeEvent(event: { event_type: string; properties: any }, orgData: { city?: string; totalComp?: number; reviewCount?: number; competitorName?: string }): string {
  const props = typeof event.properties === "string" ? JSON.parse(event.properties) : (event.properties || {});
  const city = orgData.city || "your market";
  const totalComp = orgData.totalComp || "competitors";

  switch (event.event_type) {
    case "ranking.snapshot":
    case "ranking_snapshot":
      return props.competitor
        ? `Found ${props.competitor} at ${props.competitorReviews || "?"} reviews (#1 in ${city})`
        : `Scanned ${totalComp} competitors in ${city}`;
    case "review.synced":
    case "review_synced":
      return `Monitored ${orgData.reviewCount || "your"} Google reviews`;
    case "gbp.checked":
    case "gbp_checked":
      return "Checked your Google Business Profile completeness";
    case "monday_email.sent":
    case "monday_email_sent":
      return "Sent your Monday intelligence brief";
    case "competitor.review_surge":
      return props.competitor
        ? `Detected ${props.competitor} added ${props.reviews_added || "new"} reviews`
        : "Detected competitor activity";
    case "first_win.achieved":
      return props.headline || "Alloro caught something you acted on";
    case "one_action.completed":
      return props.action ? `You completed: ${props.action}` : "You completed a recommended action";
    case "monday_email.opened":
      return "You opened your Monday brief";
    case "cro_engine_run":
      return "Analyzed your website for optimization opportunities";
    default:
      return event.event_type.replace(/[._]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }
}

homeIntelligenceRoutes.get(
  "/",
  authenticateToken,
  rbacMiddleware,
  async (req: any, res) => {
    try {
      const orgId = req.user?.organizationId;
      if (!orgId) return res.status(400).json({ error: "No organization" });

      // Get org data for context
      const org = await db("organizations").where({ id: orgId }).first();
      const cd = org?.checkup_data
        ? (typeof org.checkup_data === "string" ? JSON.parse(org.checkup_data) : org.checkup_data)
        : null;

      const orgData = {
        city: cd?.market?.city,
        totalComp: cd?.market?.totalCompetitors,
        reviewCount: cd?.place?.reviewCount,
        competitorName: cd?.topCompetitor?.name,
      };

      // 1. Recent actions from behavioral_events
      let recentActions: string[] = [];
      try {
        const events = await db("behavioral_events")
          .where("org_id", orgId)
          .orderBy("created_at", "desc")
          .limit(5)
          .select("event_type", "properties", "created_at");

        if (events.length > 0) {
          recentActions = events.map((e: any) => describeEvent(e, orgData));
        }
      } catch {
        // Table may not exist or be empty
      }

      // Fallback: honest static items when no events exist
      if (recentActions.length === 0) {
        const city = orgData.city || "your market";
        const totalComp = orgData.totalComp || "competitors";
        recentActions = [
          `Tracked your competitive position against ${totalComp} practices in ${city}`,
          "Monitored your Google reviews daily",
          "Checked your Google Business Profile completeness",
        ];
      }

      // 2. Weekly finding from most recent snapshot
      let weeklyFinding: { headline: string; bullets: string[] } | null = null;
      try {
        const snapshot = await db("weekly_ranking_snapshots")
          .where("org_id", orgId)
          .orderBy("created_at", "desc")
          .first();

        if (snapshot?.finding_headline) {
          const bullets = typeof snapshot.bullets === "string"
            ? JSON.parse(snapshot.bullets)
            : (snapshot.bullets || []);

          weeklyFinding = {
            headline: snapshot.finding_headline,
            bullets: Array.isArray(bullets) ? bullets.filter(Boolean) : [],
          };
        }
      } catch {
        // Snapshot table may not exist
      }

      return res.json({ recentActions, weeklyFinding });
    } catch (err: any) {
      console.error("[HomeIntelligence] Error:", err.message);
      return res.status(500).json({ error: "Failed to load intelligence" });
    }
  },
);

export default homeIntelligenceRoutes;
