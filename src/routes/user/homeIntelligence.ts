/**
 * Home Intelligence API
 *
 * GET /api/user/home-intelligence
 *
 * Returns structured intelligence for the Home page:
 * 1. watchline -- single highest-priority true signal from the 4-level waterfall
 * 2. weeklyFinding -- finding headline + bullets from most recent snapshot
 * 3. recentActions -- last 5 behavioral_events as proof of work (no generic fallbacks)
 *
 * Waterfall priorities:
 *   P1: Material changes (new review, competitor surge, referral silence)
 *   P2: Competitive landscape (weekly snapshot findings, position shifts)
 *   P3: Patterns worth naming (review velocity, recurring agent signals)
 *   P4: Business context (what Alloro is monitoring, data freshness)
 *
 * Rules:
 * - Every signal is specific and true. No generic fallbacks.
 * - If there is no signal, the field is null. The frontend handles absence.
 * - Names competitors, uses real numbers, plain English.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware } from "../../middleware/rbac";
import { db } from "../../database/connection";

const homeIntelligenceRoutes = express.Router();

interface OrgContext {
  city: string | null;
  specialty: string | null;
  totalComp: number | null;
  reviewCount: number | null;
  competitorName: string | null;
  competitorReviews: number | null;
  orgName: string | null;
  clientRating: number | null;
  competitorRating: number | null;
  orgCreatedAt: string | null;
}

interface WatchlineSignal {
  priority: number;
  text: string;
  type: string;
}

/** Describe a behavioral_event as proof of work. Returns null if undescribable. */
function describeEvent(
  event: { event_type: string; properties: any; created_at: string },
  ctx: OrgContext,
): string | null {
  const props =
    typeof event.properties === "string"
      ? JSON.parse(event.properties)
      : event.properties || {};

  switch (event.event_type) {
    case "ranking.snapshot":
    case "ranking_snapshot":
      if (props.competitor) {
        return `Scanned ${props.competitor} and ${ctx.totalComp || "other"} competitors in ${ctx.city || "your market"}`;
      }
      return ctx.city
        ? `Scanned ${ctx.totalComp || "competitors"} in ${ctx.city}`
        : null;

    case "review.synced":
    case "review_synced":
      return ctx.reviewCount
        ? `Checked ${ctx.reviewCount} Google reviews for changes`
        : "Checked your Google reviews for changes";

    case "gbp.checked":
    case "gbp_checked":
      return "Verified your Google Business Profile fields are complete";

    case "monday_email.sent":
    case "monday_email_sent":
      return "Delivered your Monday intelligence brief";

    case "competitor.review_surge":
      return props.competitor
        ? `Detected ${props.competitor} added ${props.reviews_added || "new"} reviews`
        : null;

    case "one_action.completed":
      return props.action ? `You completed: ${props.action}` : null;

    case "monday_email.opened":
      return "You opened your Monday brief";

    case "cro_engine_run":
      return "Analyzed your website for conversion opportunities";

    default:
      return null;
  }
}

/** P1: Material changes -- things that happened since last check */
async function getMaterialChange(
  orgId: number,
  ctx: OrgContext,
): Promise<WatchlineSignal | null> {
  // 1a. New reviews in the last 7 days
  try {
    const recentReviews = await db("review_notifications")
      .where("organization_id", orgId)
      .where("created_at", ">", db.raw("NOW() - INTERVAL '7 days'"))
      .orderBy("created_at", "desc")
      .select("star_rating", "reviewer_name", "review_text")
      .limit(3);

    if (recentReviews.length > 0) {
      const latest = recentReviews[0];
      const name = latest.reviewer_name || "A patient";
      const stars = latest.star_rating;
      if (recentReviews.length === 1 && stars) {
        const sentiment = stars >= 4 ? "left a positive review" : "left a review";
        return {
          priority: 1,
          type: "new_review",
          text: `${name} ${sentiment} this week. ${stars} stars.`,
        };
      }
      if (recentReviews.length > 1) {
        return {
          priority: 1,
          type: "review_batch",
          text: `${recentReviews.length} new reviews this week. Latest from ${name}.`,
        };
      }
    }
  } catch {
    // table may not exist
  }

  // 1b. Competitor review surge (from behavioral_events)
  try {
    const surge = await db("behavioral_events")
      .where("org_id", orgId)
      .where("event_type", "competitor.review_surge")
      .where("created_at", ">", db.raw("NOW() - INTERVAL '7 days'"))
      .orderBy("created_at", "desc")
      .first("properties");

    if (surge?.properties) {
      const props =
        typeof surge.properties === "string"
          ? JSON.parse(surge.properties)
          : surge.properties;
      if (props.competitor && props.reviews_added) {
        return {
          priority: 1,
          type: "competitor_surge",
          text: `${props.competitor} gained ${props.reviews_added} reviews this week.`,
        };
      }
    }
  } catch {
    // behavioral_events query failed
  }

  return null;
}

/** P2: Competitive landscape -- weekly snapshot intelligence */
async function getCompetitiveLandscape(
  orgId: number,
  ctx: OrgContext,
): Promise<WatchlineSignal | null> {
  try {
    const snapshot = await db("weekly_ranking_snapshots")
      .where("org_id", orgId)
      .orderBy("created_at", "desc")
      .first();

    if (snapshot?.finding_headline) {
      return {
        priority: 2,
        type: "weekly_finding",
        text: snapshot.finding_headline,
      };
    }

    // If snapshot exists but no finding_headline, use competitor data
    if (snapshot?.competitor_name && snapshot?.competitor_review_count != null) {
      const gap =
        snapshot.competitor_review_count - (snapshot.client_review_count || 0);
      if (gap > 0) {
        return {
          priority: 2,
          type: "review_gap",
          text: `${snapshot.competitor_name} has ${snapshot.competitor_review_count} reviews. You have ${snapshot.client_review_count || 0}. Gap: ${gap}.`,
        };
      }
    }
  } catch {
    // table may not exist
  }

  return null;
}

/** P3: Patterns worth naming -- proofline narrative or recurring signals */
async function getPattern(
  orgId: number,
  ctx: OrgContext,
): Promise<WatchlineSignal | null> {
  // Proofline narrative from agent_results
  try {
    const prooflineRow = await db("agent_results")
      .where({ organization_id: orgId, agent_type: "proofline" })
      .whereNot("status", "archived")
      .orderBy("created_at", "desc")
      .first("agent_output");

    if (prooflineRow?.agent_output) {
      const output =
        typeof prooflineRow.agent_output === "string"
          ? JSON.parse(prooflineRow.agent_output)
          : prooflineRow.agent_output;
      if (output?.trajectory && !output?.skipped) {
        return {
          priority: 3,
          type: "proofline",
          text: output.trajectory.replace(/<\/?hl>/g, ""),
        };
      }
    }
  } catch {
    // agent_results query failed
  }

  return null;
}

/** P4: Business context -- specific competitive insight from checkup data.
 *  This is the cold-start signal. A new client with zero longitudinal data
 *  should still see something specific and true, not "Monitoring X in Y."
 *  Uses review gap, rating comparison, or market position to generate
 *  a quantified insight from day one.
 */
function getBusinessContext(ctx: OrgContext): WatchlineSignal | null {
  // 4a. Quantified review gap -- the most concrete competitive signal
  if (
    ctx.competitorName &&
    ctx.competitorReviews &&
    ctx.reviewCount != null
  ) {
    const gap = ctx.competitorReviews - ctx.reviewCount;
    if (gap > 0) {
      // How long to close at 2 reviews per week (realistic ask rate)
      const weeksToClose = Math.ceil(gap / 2);
      const timeframe =
        weeksToClose <= 4
          ? `${weeksToClose} week${weeksToClose !== 1 ? "s" : ""}`
          : weeksToClose <= 52
            ? `${Math.ceil(weeksToClose / 4)} months`
            : `${(weeksToClose / 52).toFixed(1)} years`;
      return {
        priority: 4,
        type: "review_gap",
        text: `${ctx.competitorName} has ${gap} more reviews than you. At 2 per week, you close that gap in ${timeframe}.`,
      };
    }
    if (gap <= 0) {
      return {
        priority: 4,
        type: "review_lead",
        text: `You lead ${ctx.competitorName} by ${Math.abs(gap)} reviews in ${ctx.city || "your market"}.`,
      };
    }
  }

  // 4b. Rating comparison -- if reviews are close but ratings differ
  if (
    ctx.competitorName &&
    ctx.clientRating &&
    ctx.competitorRating &&
    ctx.clientRating !== ctx.competitorRating
  ) {
    if (ctx.clientRating > ctx.competitorRating) {
      return {
        priority: 4,
        type: "rating_advantage",
        text: `Your ${ctx.clientRating}-star rating beats ${ctx.competitorName} at ${ctx.competitorRating}. Patients notice.`,
      };
    }
    return {
      priority: 4,
      type: "rating_gap",
      text: `${ctx.competitorName} has a ${ctx.competitorRating}-star rating to your ${ctx.clientRating}. Review quality matters for AI search results.`,
    };
  }

  // 4c. Market position with competitor named -- at minimum, name names
  if (ctx.competitorName && ctx.city) {
    return {
      priority: 4,
      type: "market_position",
      text: `Your top competitor in ${ctx.city} is ${ctx.competitorName}. Alloro is tracking their reviews, rankings, and visibility weekly.`,
    };
  }

  // 4d. City only -- weakest signal, but still better than nothing
  if (ctx.city && ctx.totalComp) {
    return {
      priority: 4,
      type: "market_scan",
      text: `Tracking ${ctx.totalComp} competitors in ${ctx.city}. Your first competitive report arrives Monday.`,
    };
  }

  return null;
}

homeIntelligenceRoutes.get(
  "/",
  authenticateToken,
  rbacMiddleware,
  async (req: any, res) => {
    try {
      const orgId = req.user?.organizationId;
      if (!orgId) return res.status(400).json({ error: "No organization" });

      // Get org context
      const org = await db("organizations").where({ id: orgId }).first();
      const cd = org?.checkup_data
        ? typeof org.checkup_data === "string"
          ? JSON.parse(org.checkup_data)
          : org.checkup_data
        : null;

      const topComp = cd?.topCompetitor || cd?.top_competitor || null;

      const ctx: OrgContext = {
        city: cd?.market?.city || null,
        specialty: cd?.market?.specialty || null,
        totalComp: cd?.market?.totalCompetitors || null,
        reviewCount: cd?.place?.reviewCount || cd?.reviewCount || null,
        competitorName:
          typeof topComp === "string" ? topComp : topComp?.name || null,
        competitorReviews:
          typeof topComp === "object" ? topComp?.reviewCount : null,
        orgName: org?.name || null,
        clientRating: cd?.place?.rating || cd?.rating || null,
        competitorRating:
          typeof topComp === "object" ? topComp?.rating || null : null,
        orgCreatedAt: org?.created_at || null,
      };

      // 1. Watchline: run waterfall, take highest priority signal
      const signals = await Promise.all([
        getMaterialChange(orgId, ctx),
        getCompetitiveLandscape(orgId, ctx),
        getPattern(orgId, ctx),
      ]);

      // Add P4 synchronously (no DB query)
      const p4 = getBusinessContext(ctx);

      const allSignals = [...signals, p4].filter(
        Boolean,
      ) as WatchlineSignal[];
      allSignals.sort((a, b) => a.priority - b.priority);

      const watchline = allSignals.length > 0 ? allSignals[0].text : null;
      const watchlineType =
        allSignals.length > 0 ? allSignals[0].type : null;

      // 2. Weekly finding from most recent snapshot
      let weeklyFinding: {
        headline: string;
        bullets: string[];
      } | null = null;
      try {
        const snapshot = await db("weekly_ranking_snapshots")
          .where("org_id", orgId)
          .orderBy("created_at", "desc")
          .first();

        if (snapshot?.finding_headline) {
          const bullets =
            typeof snapshot.bullets === "string"
              ? JSON.parse(snapshot.bullets)
              : snapshot.bullets || [];

          weeklyFinding = {
            headline: snapshot.finding_headline,
            bullets: Array.isArray(bullets) ? bullets.filter(Boolean) : [],
          };
        }
      } catch {
        // Snapshot table may not exist
      }

      // 3. Recent actions: real events only, no generic fallbacks
      let recentActions: string[] = [];
      try {
        const events = await db("behavioral_events")
          .where("org_id", orgId)
          .orderBy("created_at", "desc")
          .limit(10) // fetch extra to filter nulls
          .select("event_type", "properties", "created_at");

        recentActions = events
          .map((e: any) => describeEvent(e, ctx))
          .filter(Boolean)
          .slice(0, 5) as string[];
      } catch {
        // Table may not exist or be empty
      }

      return res.json({
        success: true,
        watchline,
        watchlineType,
        weeklyFinding,
        recentActions,
      });
    } catch (err: any) {
      console.error("[HomeIntelligence] Error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to load intelligence" });
    }
  },
);

export default homeIntelligenceRoutes;
