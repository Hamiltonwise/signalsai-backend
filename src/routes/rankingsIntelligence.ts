/**
 * Rankings Intelligence Agent — Weekly Snapshot Generator
 *
 * WO20 / T3-B: Generates weekly ranking snapshots for each org.
 * Called by BullMQ cron Sunday night, or manually via admin endpoint.
 *
 * For each org:
 * 1. Get current ranking from practice_rankings
 * 2. Compare to last week's snapshot
 * 3. Generate 3 plain-English bullets (WHAT + RESULT, never HOW)
 * 4. Generate competitor note
 * 5. Calculate dollar figure
 * 6. Store to weekly_ranking_snapshots
 *
 * Also includes GP drift detection (T3-F) and first win attribution (T3-C).
 */

import express from "express";
import { authenticateToken } from "../middleware/auth";
import { superAdminMiddleware } from "../middleware/superAdmin";
import { rbacMiddleware, type RBACRequest } from "../middleware/rbac";
import { db } from "../database/connection";

const rankingsIntelligenceRoutes = express.Router();

// ─── Admin: Generate snapshots for all orgs (Sunday night cron) ─────

rankingsIntelligenceRoutes.post(
  "/generate-snapshots",
  authenticateToken,
  superAdminMiddleware,
  async (_req, res) => {
    try {
      const orgs = await db("organizations")
        .whereNotNull("subscription_status")
        .select("id", "name");

      const weekStart = getWeekStart();
      let generated = 0;

      for (const org of orgs) {
        try {
          await generateSnapshotForOrg(org.id, weekStart);
          await checkFirstWinAttribution(org.id);
          generated++;
        } catch (err: any) {
          console.error(`[RankingsIntel] Failed for org ${org.id}:`, err.message);
        }
      }

      console.log(`[RankingsIntel] Generated ${generated}/${orgs.length} snapshots for week ${weekStart}`);
      return res.json({ success: true, generated, total: orgs.length, weekStart });
    } catch (error: any) {
      console.error("[RankingsIntel] Snapshot generation error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to generate snapshots" });
    }
  },
);

// ─── Client: Get ranking snapshots for my org ───────────────────────

rankingsIntelligenceRoutes.get(
  "/snapshots",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) {
        return res.json({ success: true, snapshots: [] });
      }

      const snapshots = await db("weekly_ranking_snapshots")
        .where({ org_id: orgId })
        .orderBy("week_start", "desc")
        .limit(12);

      return res.json({ success: true, snapshots });
    } catch (error: any) {
      console.error("[RankingsIntel] Snapshots fetch error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to load snapshots" });
    }
  },
);

// ─── Client: Get GP drift alerts for my org ─────────────────────────

rankingsIntelligenceRoutes.get(
  "/drift-alerts",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) {
        return res.json({ success: true, alerts: [] });
      }

      const hasTable = await db.schema.hasTable("referral_sources");
      if (!hasTable) {
        return res.json({ success: true, alerts: [] });
      }

      // Gone Dark: had referrals in each of prior 3 months, now 0 for 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const allSources = await db("referral_sources")
        .where({ organization_id: orgId })
        .whereNull("surprise_catch_dismissed_at")
        .select("*");

      const alerts: any[] = [];

      for (const source of allSources) {
        const recentReferrals = source.recent_referral_count ?? source.referral_count_last_30d ?? 0;
        const priorMonthly = source.prior_3_month_avg ?? source.monthly_average ?? 0;

        // Gone Dark: was active, now zero for 30 days
        if (priorMonthly > 0 && recentReferrals === 0) {
          const lastReferralDate = source.last_referral_date || source.updated_at;
          const daysSilent = lastReferralDate
            ? Math.floor((Date.now() - new Date(lastReferralDate).getTime()) / (1000 * 60 * 60 * 24))
            : 30;

          if (daysSilent >= 30) {
            alerts.push({
              type: "gone_dark",
              gpName: source.gp_name || source.name,
              gpPractice: source.gp_practice || source.practice_name,
              priorMonthlyAvg: Math.round(priorMonthly),
              daysSilent,
              sourceId: source.id,
            });
          }
        }

        // Drift: 30%+ decline over 60 days (not yet zero)
        if (
          priorMonthly > 0 &&
          recentReferrals > 0 &&
          recentReferrals < priorMonthly * 0.7 &&
          !source.gp_drift_dismissed_at
        ) {
          const declinePct = Math.round((1 - recentReferrals / priorMonthly) * 100);
          alerts.push({
            type: "drift",
            gpName: source.gp_name || source.name,
            gpPractice: source.gp_practice || source.practice_name,
            declinePct,
            currentRate: recentReferrals,
            priorRate: Math.round(priorMonthly),
            sourceId: source.id,
          });
        }
      }

      return res.json({ success: true, alerts });
    } catch (error: any) {
      console.error("[RankingsIntel] Drift alerts error:", error.message);
      return res.json({ success: true, alerts: [] });
    }
  },
);

// ─── Client: Dismiss a drift alert ──────────────────────────────────

rankingsIntelligenceRoutes.post(
  "/dismiss-alert",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const { sourceId, alertType } = req.body;
      if (!sourceId) {
        return res.status(400).json({ success: false, error: "sourceId required" });
      }

      const field = alertType === "drift" ? "gp_drift_dismissed_at" : "surprise_catch_dismissed_at";
      await db("referral_sources").where({ id: sourceId }).update({ [field]: new Date() });

      return res.json({ success: true });
    } catch (error: any) {
      console.error("[RankingsIntel] Dismiss error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to dismiss" });
    }
  },
);

// ─── Helpers ─────────────────────────────────────────────────────────

function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split("T")[0];
}

async function generateSnapshotForOrg(orgId: number, weekStart: string) {
  // Check if snapshot already exists for this week
  const existing = await db("weekly_ranking_snapshots")
    .where({ org_id: orgId, week_start: weekStart })
    .first();
  if (existing) return;

  // Get latest completed ranking
  const latestRanking = await db("practice_rankings")
    .where({ organization_id: orgId, status: "completed" })
    .orderBy("created_at", "desc")
    .first();

  if (!latestRanking) return;

  // Get previous week's snapshot
  const prevSnapshot = await db("weekly_ranking_snapshots")
    .where({ org_id: orgId })
    .where("week_start", "<", weekStart)
    .orderBy("week_start", "desc")
    .first();

  const currentPosition = latestRanking.rank_position;
  const prevPosition = prevSnapshot?.position || null;
  const rawData = typeof latestRanking.raw_data === "string"
    ? JSON.parse(latestRanking.raw_data)
    : latestRanking.raw_data;

  const clientReviews = rawData?.client_gbp?.totalReviewCount || 0;
  const competitors = rawData?.competitors || [];
  const topCompetitor = competitors[0];
  const compName = topCompetitor?.name || topCompetitor?.displayName?.text || null;
  const compReviews = topCompetitor?.userRatingCount || topCompetitor?.reviewCount || 0;

  // Get org's avg_case_value from vocab config or default
  const vocabConfig = await db("vocabulary_configs").where({ org_id: orgId }).first();
  const vocabDefaults = vocabConfig?.vertical
    ? await db("vocabulary_defaults").where({ vertical: vocabConfig.vertical }).first()
    : null;
  const defaults = vocabDefaults?.config
    ? typeof vocabDefaults.config === "string" ? JSON.parse(vocabDefaults.config) : vocabDefaults.config
    : {};
  const avgCaseValue = defaults.avgCaseValue || 1500;

  // Generate bullets: WHAT happened + RESULT
  const bullets: string[] = [];

  if (prevPosition && currentPosition < prevPosition) {
    bullets.push(`Your ranking moved from #${prevPosition} to #${currentPosition}. More patients see you first.`);
  } else if (prevPosition && currentPosition > prevPosition) {
    bullets.push(`Your ranking dropped from #${prevPosition} to #${currentPosition}. A competitor gained ground.`);
  } else if (prevPosition) {
    bullets.push(`Your ranking held at #${currentPosition}. Position maintained.`);
  } else {
    bullets.push(`First ranking recorded: #${currentPosition} in your market.`);
  }

  if (clientReviews > 0 && prevSnapshot?.client_review_count) {
    const reviewDelta = clientReviews - prevSnapshot.client_review_count;
    if (reviewDelta > 0) {
      bullets.push(`You gained ${reviewDelta} new review${reviewDelta !== 1 ? "s" : ""} this week. Each one strengthens your position.`);
    } else {
      bullets.push(`No new reviews this week. Your competitors are still collecting.`);
    }
  } else {
    bullets.push(`You have ${clientReviews} Google reviews. The market leader has ${compReviews}.`);
  }

  if (compName) {
    bullets.push(`${compName} holds the #1 position with ${compReviews} reviews.`);
  }

  // Competitor note
  const competitorNote = compName
    ? `${compName} remains at #1 with ${compReviews} reviews.`
    : null;

  // Known 4: dollar_figure zeroed. Was a projection from review velocity, not real revenue data.
  const dollarFigure = 0;

  // Finding headline (no position claims per Known 3)
  const findingHeadline = compName
    ? `${compName} is the most visible competitor in your market`
    : "Your market is being tracked";

  await db("weekly_ranking_snapshots").insert({
    org_id: orgId,
    week_start: weekStart,
    position: currentPosition,
    keyword: latestRanking.specialty || latestRanking.rank_keywords || null,
    bullets: JSON.stringify(bullets.slice(0, 3)),
    competitor_note: competitorNote,
    finding_headline: findingHeadline,
    dollar_figure: dollarFigure,
    competitor_position: 1,
    competitor_name: compName,
    competitor_review_count: compReviews,
    client_review_count: clientReviews,
  });
}

async function checkFirstWinAttribution(orgId: number) {
  // Check if already attributed
  const org = await db("organizations").where({ id: orgId }).first();
  if (org?.first_win_attributed_at) return;

  // Get all snapshots for this org
  const snapshots = await db("weekly_ranking_snapshots")
    .where({ org_id: orgId })
    .orderBy("week_start", "asc");

  if (snapshots.length < 2) return;

  const first = snapshots[0];
  const latest = snapshots[snapshots.length - 1];

  // Condition 1: Ranking improved 2+ positions
  if (first.position && latest.position && first.position - latest.position >= 2) {
    await db("first_win_attribution_events").insert({
      org_id: orgId,
      event_type: "ranking_improvement",
      description: `Ranking improved from #${first.position} to #${latest.position}`,
    });
    await db("organizations").where({ id: orgId }).update({
      first_win_attributed_at: new Date(),
    });
    console.log(`[RankingsIntel] First win attributed for org ${orgId}: ranking improvement`);
    return;
  }

  // Condition 2: Review count increased 5+
  if (first.client_review_count && latest.client_review_count &&
      latest.client_review_count - first.client_review_count >= 5) {
    await db("first_win_attribution_events").insert({
      org_id: orgId,
      event_type: "review_growth",
      description: `Reviews grew from ${first.client_review_count} to ${latest.client_review_count}`,
    });
    await db("organizations").where({ id: orgId }).update({
      first_win_attributed_at: new Date(),
    });
    console.log(`[RankingsIntel] First win attributed for org ${orgId}: review growth`);
  }
}

// ─── GET /activity-feed — What Alloro Did This Week ──────────────────

const FEED_EVENT_TYPES = [
  "ranking_improvement",
  "review_growth",
  "review_request.sent",
  "first_win.achieved",
  "clearpath.build_triggered",
  "competitor.disruption_detected",
  "one_action.completed",
  "referral.submitted",
  "weekly_digest.posted",
  "gp.gone_dark",
  "gp.drift_detected",
  "result_email.sent",
  "welcome_intelligence.sent",
];

// Dharmesh/Flanagan principle: every action framed as "Alloro did this FOR you"
// Not "[metric] changed" but "Alloro [verb]" -- amplifier, not reporter
const EVENT_LABELS: Record<string, (props: Record<string, any>) => string> = {
  "ranking_improvement": (p) =>
    `Alloro tracked your move from #${p.from || "?"} to #${p.to || "?"} for '${p.keyword || "your market"}'.`,
  "review_growth": (p) =>
    `Alloro counted ${p.count || "new"} new review${p.count !== 1 ? "s" : ""} this week.`,
  "review_request.sent": () =>
    "Alloro sent a review request to a recent customer.",
  "first_win.achieved": (p) =>
    p.description || "Alloro caught something. You acted. It worked.",
  "clearpath.build_triggered": () =>
    "Alloro started building your website from your market data.",
  "competitor.disruption_detected": (p) =>
    `Alloro spotted ${p.competitor_name || "a competitor"} making a move. ${p.detail || ""}`,
  "one_action.completed": () =>
    "You completed the action Alloro recommended. That matters.",
  "referral.submitted": (p) =>
    `Alloro logged a new referral from ${p.referrer_name || "a colleague"}.`,
  "weekly_digest.posted": () =>
    "Alloro assembled your weekly intelligence digest.",
  "gp.gone_dark": (p) =>
    `Alloro noticed ${p.gp_name || "a referral source"} has been quiet for ${p.days_silent || "60+"} days.`,
  "gp.drift_detected": (p) =>
    `Alloro detected declining referrals from ${p.gp_name || "a source"}.`,
  "result_email.sent": () =>
    "Alloro sent your competitive analysis results.",
  "welcome_intelligence.sent": () =>
    "Alloro delivered your welcome intelligence package.",
};

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 1) return "just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return days[date.getDay()];
  }
  return "last week";
}

rankingsIntelligenceRoutes.get(
  "/activity-feed",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) {
        return res.json({ success: true, entries: [], nearMiss: null });
      }

      const events = await db("behavioral_events")
        .where({ org_id: orgId })
        .whereIn("event_type", FEED_EVENT_TYPES)
        .where("created_at", ">=", db.raw("NOW() - INTERVAL '7 days'"))
        .orderBy("created_at", "desc")
        .limit(20);

      const entries = events.map((e: any) => {
        const props = typeof e.properties === "string"
          ? JSON.parse(e.properties)
          : e.properties || {};
        const labelFn = EVENT_LABELS[e.event_type];
        const label = labelFn ? labelFn(props) : e.event_type;
        const isNotable = [
          "ranking_improvement", "competitor.disruption_detected",
          "first_win.achieved", "gp.gone_dark",
        ].includes(e.event_type);

        return {
          id: e.id,
          type: e.event_type,
          label,
          relativeTime: formatRelativeTime(new Date(e.created_at)),
          isNotable,
        };
      });

      // Near-miss line from latest snapshot
      let nearMiss: string | null = null;
      const latest = await db("weekly_ranking_snapshots")
        .where({ org_id: orgId })
        .orderBy("week_start", "desc")
        .first();

      if (latest?.position && latest.competitor_name) {
        const gap = Math.abs(
          (latest.competitor_review_count || 0) - (latest.client_review_count || 0)
        );
        if (latest.position === 1) {
          nearMiss = `${gap} reviews ahead of ${latest.competitor_name} at position 2.`;
        } else {
          nearMiss = `${gap} reviews separate you from ${latest.competitor_name} at position ${(latest.position || 2) - 1}.`;
        }
      }

      return res.json({ success: true, entries, nearMiss });
    } catch (error: any) {
      console.error("[RankingsIntel] Activity feed error:", error.message);
      return res.json({ success: true, entries: [], nearMiss: null });
    }
  }
);

export default rankingsIntelligenceRoutes;
