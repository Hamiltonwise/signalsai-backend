/**
 * One Action Card — Deterministic Rule Engine
 *
 * The most important daily intelligence output in the product.
 * Each doctor sees exactly ONE recommended action. Selected deterministically.
 *
 * Priority waterfall (first condition met wins):
 * 1. GP drift alert (silent 60+ days, 3+ prior referrals)
 * 2. Review gap closeable in under 2 weeks at current velocity
 * 3. Ranking dropped 1+ position since last week
 * 4. PatientPath preview ready
 * 5. Steady state (no alerts, no drops, no drift)
 */

import { db } from "../database/connection";
import { cleanCompetitorName } from "../utils/textCleaning";

export interface OneActionCard {
  headline: string;
  body: string;
  action_text: string | null;
  action_url: string | null;
  priority_level: 0 | 1 | 2 | 3 | 4 | 5;
  clear?: boolean;
}

export interface OneActionIntelligence {
  card: OneActionCard;
  driftGP: { name: string; practice: string; monthsConsistent: number } | null;
  competitorVelocity: {
    competitorName: string;
    competitorReviewsThisMonth: number;
    clientReviewsThisMonth: number;
  } | null;
}

export async function getOneActionCardWithIntelligence(orgId: number): Promise<OneActionIntelligence> {
  const [card, driftGP, competitorVelocity] = await Promise.all([
    getOneActionCard(orgId),
    getGPDriftData(orgId),
    getCompetitorVelocityData(orgId),
  ]);
  return { card, driftGP, competitorVelocity };
}

export async function getOneActionCard(orgId: number): Promise<OneActionCard> {
  // ─── Rule 1: GP Drift Alert ─────────────────────────────────────

  const driftAlert = await checkGPDrift(orgId);
  if (driftAlert) return driftAlert;

  // ─── Rule 2: Review gap closeable in under 2 weeks ──────────────

  const reviewRace = await checkReviewGap(orgId);
  if (reviewRace) return reviewRace;

  // ─── Rule 3: Ranking dropped 1+ position ────────────────────────

  const rankingDrop = await checkRankingDrop(orgId);
  if (rankingDrop) return rankingDrop;

  // ─── Rule 4: PatientPath preview ready ──────────────────────────

  const patientpath = await checkPatientPath(orgId);
  if (patientpath) return patientpath;

  // ─── Rule 0: Clear state -- nothing needs attention ─────────────
  // If we reached here, no drift, no closeable gap, no ranking drop,
  // no PatientPath pending. Check if we have stable position data --
  // if so, this is genuinely a "nothing to do" moment. The gift.

  const clearCheck = await db("weekly_ranking_snapshots")
    .where({ org_id: orgId })
    .orderBy("week_start", "desc")
    .limit(2);

  if (clearCheck.length >= 2) {
    const curr = clearCheck[0];
    const prev = clearCheck[1];
    // Market stable, and we have data
    if (curr.position && prev.position && curr.position <= prev.position) {
      return {
        headline: "Your business is steady. Nothing needs you right now.",
        body: "No competitor gained ground this week. Alloro is watching your market and will tell you when something changes.",
        action_text: null,
        action_url: null,
        priority_level: 0,
        clear: true,
      };
    }
  }

  // ─── Rule 5: Steady state (new accounts, insufficient data) ────

  return getSteadyState(orgId);
}

// ─── Rule 1: GP Drift ──────────────────────────────────────────────

async function checkGPDrift(orgId: number): Promise<OneActionCard | null> {
  const hasTable = await db.schema.hasTable("referral_sources");
  if (!hasTable) return null;

  const driftingSources = await db("referral_sources")
    .where({ organization_id: orgId })
    .whereNull("surprise_catch_dismissed_at")
    .select("*");

  for (const source of driftingSources) {
    const priorMonthly = source.prior_3_month_avg ?? source.monthly_average ?? 0;
    const recentReferrals = source.recent_referral_count ?? source.referral_count_last_30d ?? 0;

    if (priorMonthly >= 3 && recentReferrals === 0) {
      const lastDate = source.last_referral_date || source.updated_at;
      const daysSilent = lastDate
        ? Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
        : 60;

      if (daysSilent >= 60) {
        // Get avg case value from vocabulary config
        const avgCaseValue = await getAvgCaseValue(orgId);
        const annualAtRisk = Math.round(priorMonthly * 12 * avgCaseValue);
        const gpName = source.gp_name || source.name || "A referring provider";
        const totalReferrals = source.total_referrals || Math.round(priorMonthly * 3);

        return {
          headline: `${gpName} sent you ${totalReferrals} referrals. They've been quiet for ${daysSilent} days.`,
          body: `A call this week could recover an estimated $${annualAtRisk.toLocaleString()}/year. This is your highest-value relationship at risk right now.`,
          action_text: "See referral details",
          action_url: "/dashboard/referrals",
          priority_level: 1,
        };
      }
    }
  }

  return null;
}

// ─── Rule 2: Review Gap Closeable in 2 Weeks ───────────────────────

async function checkReviewGap(orgId: number): Promise<OneActionCard | null> {
  const latest = await db("weekly_ranking_snapshots")
    .where({ org_id: orgId })
    .orderBy("week_start", "desc")
    .first();

  if (!latest) return null;

  const clientReviews = latest.client_review_count || 0;
  const compReviews = latest.competitor_review_count || 0;
  const compName = cleanCompetitorName(latest.competitor_name || "");

  if (!compName || compReviews <= clientReviews) return null;

  const gap = compReviews - clientReviews;

  // Estimate weekly velocity from review count (~2 year accumulation)
  const clientWeekly = Math.max(0.2, clientReviews / 104);

  // Days to close at current pace
  const daysToClose = clientWeekly > 0 ? Math.ceil((gap + 1) / clientWeekly * 7) : Infinity;

  if (daysToClose <= 14) {
    return {
      headline: `You're ${gap} review${gap !== 1 ? "s" : ""} from passing ${compName}.`,
      body: `At your current pace, you get there in ${daysToClose} days. Keep asking. Every review counts double when you're this close.`,
      action_text: "Request reviews",
      action_url: "/dashboard/reviews",
      priority_level: 2,
    };
  }

  return null;
}

// ─── Rule 3: Ranking Dropped ────────────────────────────────────────

async function checkRankingDrop(orgId: number): Promise<OneActionCard | null> {
  const snapshots = await db("weekly_ranking_snapshots")
    .where({ org_id: orgId })
    .orderBy("week_start", "desc")
    .limit(2);

  if (snapshots.length < 2) return null;

  const current = snapshots[0];
  const previous = snapshots[1];

  if (!current.position || !previous.position) return null;
  if (current.position <= previous.position) return null; // position went up or held

  const drop = current.position - previous.position;
  const compName = cleanCompetitorName(current.competitor_name || "") || "A competitor";
  const compReviews = current.competitor_review_count || 0;
  const clientReviews = current.client_review_count || 0;
  const reviewDiff = compReviews - clientReviews;

  return {
    headline: `${compName} gained ground on you this week.`,
    body: `${reviewDiff > 0 ? `They have ${reviewDiff} more reviews than you` : "They've been more active this week"}. The fastest recovery is reviews. Ask 3 customers this week.`,
    action_text: "See what changed",
    action_url: "/compare",
    priority_level: 3,
  };
}

// ─── Rule 4: PatientPath Preview Ready ──────────────────────────────

async function checkPatientPath(orgId: number): Promise<OneActionCard | null> {
  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) return null;

  if (org.patientpath_status === "preview_ready") {
    return {
      headline: "Your website is ready to review.",
      body: "We built it from your Google reviews, your market data, and what makes your business stand out. Take a look.",
      action_text: "Preview your site",
      action_url: "/dashboard/website",
      priority_level: 4,
    };
  }

  return null;
}

// ─── Rule 5: Steady State ───────────────────────────────────────────

async function getSteadyState(orgId: number): Promise<OneActionCard> {
  const latest = await db("weekly_ranking_snapshots")
    .where({ org_id: orgId })
    .orderBy("week_start", "desc")
    .first();

  if (latest?.position && latest.competitor_name) {
    const gap = (latest.competitor_review_count || 0) - (latest.client_review_count || 0);
    // keyword may be "Artful Orthodontics in Winter Garden" or just "orthodontist"
    // Extract the city: take everything after " in " if present, otherwise use org's checkup data
    const rawKeyword = latest.keyword || "";
    let city = "your market";
    if (rawKeyword.includes(" in ")) {
      city = rawKeyword.split(" in ").pop()!.trim();
    } else {
      // Fall back to org's checkup data for city
      const orgData = await db("organizations").where({ id: orgId }).select("checkup_data").first();
      const parsed = orgData?.checkup_data ? (typeof orgData.checkup_data === "string" ? tryParseJSON(orgData.checkup_data) : orgData.checkup_data) : null;
      city = parsed?.market?.city || parsed?.city || "your market";
    }
    const compName = cleanCompetitorName(latest.competitor_name || "");

    return {
      headline: `Steady week in ${city}. No competitor gained ground.`,
      body: gap > 0 && gap <= 50
        ? `${compName} is ${gap} reviews ahead. Consistent reviews close that gap.`
        : `${compName} is ${gap > 0 ? `${gap} reviews ahead` : "close behind"}. Consistent week.`,
      action_text: null,
      action_url: null,
      priority_level: 5,
    };
  }

  // For new accounts from checkup: use checkup data for a personalized first impression
  const org = await db("organizations").where({ id: orgId }).first();
  const checkup = org?.checkup_data
    ? (typeof org.checkup_data === "string" ? tryParseJSON(org.checkup_data) : org.checkup_data)
    : null;

  if (checkup?.score && checkup?.market) {
    const scores = checkup.score;
    const comp = checkup.topCompetitor;
    const city = checkup.market.city || "your market";

    // Find the weakest sub-score and give a specific action the checkup didn't show
    const subScores = [
      { key: "localVisibility", score: scores.localVisibility || 0, max: 40, label: "local visibility" },
      { key: "onlinePresence", score: scores.onlinePresence || 0, max: 40, label: "online presence" },
      { key: "reviewHealth", score: scores.reviewHealth || 0, max: 20, label: "review health" },
    ];
    subScores.sort((a, b) => (a.score / a.max) - (b.score / b.max));
    const weakest = subScores[0];

    // Velocity projection (new intelligence the checkup didn't show)
    const gap = comp ? (comp.reviewCount || 0) - (checkup.reviewCount || 0) : 0;
    const avgMarketReviews = checkup.market.avgReviews || 0;
    const estimatedMonthlyGrowth = avgMarketReviews > 0 ? Math.round(avgMarketReviews / 24) : 2;

    if (weakest.key === "localVisibility" && comp?.name) {
      return {
        headline: `${comp.name} is outranking you because of one thing you can fix today.`,
        body: `Your local visibility score is ${weakest.score}/${weakest.max}. The fastest fix: add your complete services list to your Google Business Profile. It takes 10 minutes and directly impacts how you appear in "${checkup.market.city} specialist" searches.`,
        action_text: "Fix this now",
        action_url: "/settings/integrations",
        priority_level: 4,
      };
    }

    if (weakest.key === "reviewHealth" && gap > 0 && comp?.name) {
      const weeksToClose = Math.ceil(gap / Math.max(1, estimatedMonthlyGrowth / 4));
      return {
        headline: `${gap} reviews between you and ${comp.name}. Closeable in ${Math.min(weeksToClose, 52)} weeks.`,
        body: `Your competitors in ${city} add roughly ${estimatedMonthlyGrowth} reviews per month. Match that pace and the gap starts closing this quarter. Text the review link to your last 3 customers today.`,
        action_text: "Send review requests",
        action_url: "/dashboard/reviews",
        priority_level: 4,
      };
    }

    if (comp?.name) {
      return {
        headline: `Your online presence is the gap between you and ${comp.name}.`,
        body: comp.rating && checkup.market.avgRating
          ? `The ${city} market average rating is ${checkup.market.avgRating.toFixed(1)}. ${comp.name} has ${comp.rating}. Every 0.1-star improvement changes how Google ranks you. Connect your profile to start tracking automatically.`
          : `Connect your Google Business Profile so Alloro can monitor your visibility against ${comp.name} every week.`,
        action_text: "Connect Google",
        action_url: "/settings/integrations",
        priority_level: 4,
      };
    }
  }

  // Even the fallback should use real data, not generic copy.
  // Pull from checkup_score or checkup_data on the org to give a personalized first impression.
  const orgForFallback = org || await db("organizations").where({ id: orgId }).first();
  const fallbackCheckup = orgForFallback?.checkup_data
    ? (typeof orgForFallback.checkup_data === "string" ? tryParseJSON(orgForFallback.checkup_data) : orgForFallback.checkup_data)
    : null;
  const fallbackScore = orgForFallback?.checkup_score || fallbackCheckup?.score?.total || null;

  // If we have a checkup score, lead with it
  if (fallbackScore) {
    const fallbackComp = fallbackCheckup?.topCompetitor;
    if (fallbackComp?.name && fallbackComp?.reviewCount) {
      return {
        headline: `Your top competitor is ${fallbackComp.name} with ${fallbackComp.reviewCount} reviews.`,
        body: `Connect your Google Business Profile so Alloro can track them weekly and alert you when the gap changes.`,
        action_text: "Connect Google",
        action_url: "/settings/integrations",
        priority_level: 5,
      };
    }

    return {
      headline: `Your Business Clarity Score is ${fallbackScore}.`,
      body: `Connect Google to start tracking your market in real time. Your Monday brief will show exactly where you stand and what to do next.`,
      action_text: "Connect Google",
      action_url: "/settings/integrations",
      priority_level: 5,
    };
  }

  // Absolute last resort: still reference the Monday brief, but no fake agent count
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const nextMonday = new Date();
  nextMonday.setDate(nextMonday.getDate() + ((8 - nextMonday.getDay()) % 7 || 7));
  const mondayStr = `${dayNames[nextMonday.getDay()]}, ${nextMonday.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`;

  return {
    headline: "Your first Monday brief arrives " + mondayStr + " at 7am.",
    body: "Connect your Google Business Profile so we can scan your market and find your first insight. One finding. One action. See you Monday.",
    action_text: "Connect Google",
    action_url: "/settings/integrations",
    priority_level: 5,
  };
}

function tryParseJSON(str: string): any {
  try { return JSON.parse(str); } catch { return null; }
}

// ─── Intelligence Data for Frontend Rules ───────────────────────

async function getGPDriftData(orgId: number): Promise<OneActionIntelligence["driftGP"]> {
  const hasTable = await db.schema.hasTable("referral_sources");
  if (!hasTable) return null;

  const source = await db("referral_sources")
    .where({ organization_id: orgId })
    .whereNull("surprise_catch_dismissed_at")
    .orderByRaw("COALESCE(prior_3_month_avg, monthly_average, 0) DESC")
    .first();

  if (!source) return null;

  const priorMonthly = source.prior_3_month_avg ?? source.monthly_average ?? 0;
  const recentReferrals = source.recent_referral_count ?? source.referral_count_last_30d ?? 0;

  if (priorMonthly >= 3 && recentReferrals === 0) {
    const lastDate = source.last_referral_date || source.updated_at;
    const daysSilent = lastDate
      ? Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
      : 60;

    if (daysSilent >= 60) {
      return {
        name: source.gp_name || source.name || "A referring provider",
        practice: source.gp_practice || "",
        monthsConsistent: Math.round(priorMonthly),
      };
    }
  }

  return null;
}

async function getCompetitorVelocityData(orgId: number): Promise<OneActionIntelligence["competitorVelocity"]> {
  const snapshots = await db("weekly_ranking_snapshots")
    .where({ org_id: orgId })
    .orderBy("week_start", "desc")
    .limit(2);

  if (snapshots.length < 2) return null;

  const current = snapshots[0];
  const previous = snapshots[1];

  const compName = cleanCompetitorName(current.competitor_name || "");
  if (!compName) return null;

  const compReviewsCurrent = current.competitor_review_count || 0;
  const compReviewsPrev = previous.competitor_review_count || 0;
  const clientReviewsCurrent = current.client_review_count || 0;
  const clientReviewsPrev = previous.client_review_count || 0;

  const compDelta = compReviewsCurrent - compReviewsPrev;
  const clientDelta = clientReviewsCurrent - clientReviewsPrev;

  if (compDelta <= 0) return null;

  return {
    competitorName: compName,
    competitorReviewsThisMonth: compDelta,
    clientReviewsThisMonth: Math.max(0, clientDelta),
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

async function getAvgCaseValue(orgId: number): Promise<number> {
  const config = await db("vocabulary_configs").where({ org_id: orgId }).first();
  if (config?.vertical) {
    const defaults = await db("vocabulary_defaults").where({ vertical: config.vertical }).first();
    if (defaults?.config) {
      const parsed = typeof defaults.config === "string" ? JSON.parse(defaults.config) : defaults.config;
      if (parsed.avgCaseValue) return parsed.avgCaseValue;
    }
  }
  return 500; // universal fallback
}
