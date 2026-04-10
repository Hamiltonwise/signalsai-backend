/**
 * Oz Engine -- Deterministic Home Page Hero Selector
 *
 * Selects the single highest-surprise insight for the Home page hero card.
 * Unlike ozMoment.ts (which uses Claude API at checkup time), this engine
 * runs on every Home page load with zero API calls. Pure database reads.
 *
 * Named after Oz Pearlman: lead with what they didn't know.
 *
 * Signal priority by surprise value (highest first):
 * 1. Sentiment gap -- competitors praised for something you're not
 * 2. Referral drift -- a high-value provider went quiet
 * 3. Competitor surge -- a competitor gained ground this week
 * 4. Closeable review gap -- within striking distance
 * 5. Review trajectory -- gap context with time-to-close
 * 6. Rating edge -- stars comparison with context
 * 7. Clean week -- nothing needs attention (Known 9: the gift)
 *
 * Rules:
 * - Every headline names a competitor or uses a real number
 * - Status maps to: healthy (green), attention (amber), critical (red)
 * - verifyUrl links to where the client confirms the claim on Google
 * - Returns null when no signal exists. Frontend handles absence.
 */

import { db } from "../database/connection";
import { cleanCompetitorName } from "../utils/textCleaning";
// NOTE: compareReviewSentiment intentionally NOT imported here.
// It calls the Claude API + Google Places API, which is too expensive
// for every Home page load. Sentiment gap detection should be pre-computed
// at checkup scan time and stored in a column. Until that cache exists,
// checkSentimentSurprise returns null.

export interface OzEngineResult {
  headline: string;
  context: string;
  status: "healthy" | "attention" | "critical";
  verifyUrl: string | null;
  /** Surprise score 1-10. Higher = more unexpected to the client. */
  surprise: number;
  /** Optional action */
  actionText: string | null;
  actionUrl: string | null;
  /** Signal type for frontend rendering */
  signalType: string;
}

interface OrgSnapshot {
  orgId: number;
  orgName: string | null;
  city: string | null;
  specialty: string | null;
  clientReviews: number;
  clientRating: number | null;
  competitorName: string | null;
  competitorReviews: number | null;
  competitorRating: number | null;
  competitorPlaceId: string | null;
  clientPlaceId: string | null;
  googleSearchUrl: string | null;
  marketSearchUrl: string | null;
}

// ── Main Entry Point ──────────────────────────────────────────────────

export async function getOzEngineResult(orgId: number): Promise<OzEngineResult | null> {
  const snapshot = await buildOrgSnapshot(orgId);
  if (!snapshot) return null;

  // Run all signal checks in parallel
  const [sentiment, drift, surge, trajectory, rating, clean] = await Promise.all([
    checkSentimentSurprise(snapshot),
    checkReferralDrift(snapshot),
    checkCompetitorSurge(snapshot),
    checkReviewTrajectory(snapshot),
    checkRatingSignal(snapshot),
    checkCleanWeek(snapshot),
  ]);

  // Collect non-null signals, sort by surprise (descending)
  const signals = [sentiment, drift, surge, trajectory, rating, clean]
    .filter(Boolean) as OzEngineResult[];

  if (signals.length === 0) return null;

  signals.sort((a, b) => b.surprise - a.surprise);
  return signals[0];
}

// ── Build Org Snapshot ────────────────────────────────────────────────

async function buildOrgSnapshot(orgId: number): Promise<OrgSnapshot | null> {
  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) return null;

  const cd = org.checkup_data
    ? (typeof org.checkup_data === "string" ? tryParse(org.checkup_data) : org.checkup_data)
    : null;

  const topComp = cd?.topCompetitor || cd?.top_competitor || null;
  const competitorName = typeof topComp === "string" ? topComp : topComp?.name || null;
  const city = cd?.market?.city || null;
  const specialty = cd?.market?.specialty || null;
  const orgName = org.name || null;

  return {
    orgId,
    orgName,
    city,
    specialty,
    clientReviews: cd?.place?.reviewCount || cd?.reviewCount || 0,
    clientRating: cd?.place?.rating || cd?.rating || null,
    competitorName: competitorName ? cleanCompetitorName(competitorName) : null,
    competitorReviews: typeof topComp === "object" ? topComp?.reviewCount || null : null,
    competitorRating: typeof topComp === "object" ? topComp?.rating || null : null,
    competitorPlaceId: typeof topComp === "object" ? topComp?.placeId || null : null,
    clientPlaceId: cd?.placeId || cd?.place?.placeId || null,
    googleSearchUrl: orgName
      ? `https://www.google.com/search?q=${encodeURIComponent(orgName)}`
      : null,
    marketSearchUrl: city && specialty
      ? `https://www.google.com/search?q=${encodeURIComponent(specialty + " " + city)}`
      : null,
  };
}

// ── Signal 1: Sentiment Surprise (highest possible surprise) ──────────
//
// DISABLED for real-time use. compareReviewSentiment calls Claude API +
// Google Places on every invocation. Running it per page load would add
// 3-10s latency and significant API cost.
//
// TODO: Pre-compute sentiment gaps at checkup scan time, store in a
// `sentiment_gap` column on organizations or weekly_ranking_snapshots,
// then read that column here. Until then, this returns null.
//

async function checkSentimentSurprise(_s: OrgSnapshot): Promise<OzEngineResult | null> {
  return null;
}

// ── Signal 2: Referral Drift ──────────────────────────────────────────

async function checkReferralDrift(s: OrgSnapshot): Promise<OzEngineResult | null> {
  try {
    const hasTable = await db.schema.hasTable("referral_sources");
    if (!hasTable) return null;

    const source = await db("referral_sources")
      .where({ organization_id: s.orgId })
      .whereNull("surprise_catch_dismissed_at")
      .orderByRaw("COALESCE(prior_3_month_avg, monthly_average, 0) DESC")
      .first();

    if (!source) return null;

    const priorMonthly = source.prior_3_month_avg ?? source.monthly_average ?? 0;
    const recentReferrals = source.recent_referral_count ?? source.referral_count_last_30d ?? 0;

    if (priorMonthly < 3 || recentReferrals > 0) return null;

    const lastDate = source.last_referral_date || source.updated_at;
    const daysSilent = lastDate
      ? Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
      : 60;

    if (daysSilent < 60) return null;

    const gpName = source.gp_name || source.name || "A referring provider";
    const totalReferrals = source.total_referrals || Math.round(priorMonthly * 3);

    return {
      headline: `${gpName} sent you ${totalReferrals} referrals, then went quiet ${daysSilent} days ago.`,
      context: `They averaged ${Math.round(priorMonthly)} per month before stopping. A call this week could reopen your highest-value relationship.`,
      status: "critical",
      verifyUrl: null,
      surprise: 8,
      actionText: "See referral details",
      actionUrl: "/dashboard/referrals",
      signalType: "referral_drift",
    };
  } catch {
    return null;
  }
}

// ── Signal 3: Competitor Surge (this week) ────────────────────────────

async function checkCompetitorSurge(s: OrgSnapshot): Promise<OzEngineResult | null> {
  try {
    const snapshots = await db("weekly_ranking_snapshots")
      .where({ org_id: s.orgId })
      .orderBy("week_start", "desc")
      .limit(2);

    if (snapshots.length < 2) return null;

    const current = snapshots[0];
    const previous = snapshots[1];
    const compName = cleanCompetitorName(current.competitor_name || "");
    if (!compName) return null;

    const compDelta = (current.competitor_review_count || 0) - (previous.competitor_review_count || 0);
    const clientDelta = (current.client_review_count || 0) - (previous.client_review_count || 0);

    if (compDelta <= 0 || compDelta <= clientDelta) return null;

    const positionDrop = current.position && previous.position
      ? current.position - previous.position
      : 0;

    const headline = positionDrop > 0
      ? `${compName} gained ${compDelta} reviews this week. You dropped ${positionDrop} position${positionDrop !== 1 ? "s" : ""}.`
      : `${compName} added ${compDelta} review${compDelta !== 1 ? "s" : ""} this week. You added ${clientDelta}.`;

    return {
      headline,
      context: `They now have ${current.competitor_review_count || 0} total reviews to your ${current.client_review_count || 0}. The gap ${compDelta > clientDelta ? "widened" : "held steady"}.`,
      status: positionDrop > 0 ? "critical" : "attention",
      verifyUrl: s.marketSearchUrl,
      surprise: positionDrop > 0 ? 8 : 6,
      actionText: "See what changed",
      actionUrl: "/compare",
      signalType: "competitor_surge",
    };
  } catch {
    return null;
  }
}

// ── Signal 4: Review Gap Trajectory ───────────────────────────────────

async function checkReviewTrajectory(s: OrgSnapshot): Promise<OzEngineResult | null> {
  if (!s.competitorName || !s.competitorReviews) return null;

  const gap = s.competitorReviews - s.clientReviews;
  if (gap <= 0) return null;

  const clientWeekly = Math.max(0.2, s.clientReviews / 104);
  const daysToClose = clientWeekly > 0 ? Math.ceil((gap + 1) / clientWeekly * 7) : Infinity;

  if (daysToClose <= 14) {
    return {
      headline: `You're ${gap} review${gap !== 1 ? "s" : ""} from passing ${s.competitorName}.`,
      context: `At your current pace, you close that in about ${daysToClose} days. Every review counts double when you're this close.`,
      status: "attention",
      verifyUrl: s.googleSearchUrl,
      surprise: 7,
      actionText: "Request reviews",
      actionUrl: "/reviews",
      signalType: "closeable_gap",
    };
  }

  if (gap > 100) {
    const monthsToClose = Math.ceil(gap / (clientWeekly * 4));
    return {
      headline: `${s.competitorName} has ${gap} more reviews than you in ${s.city || "your market"}.`,
      context: `At current pace, that closes in about ${Math.min(monthsToClose, 36)} months. 2 reviews per week cuts that in half.`,
      status: "attention",
      verifyUrl: s.googleSearchUrl,
      surprise: 4,
      actionText: null,
      actionUrl: null,
      signalType: "review_gap",
    };
  }

  const weeksToClose = Math.ceil(gap / Math.max(1, clientWeekly));
  return {
    headline: `${gap} reviews between you and ${s.competitorName}.`,
    context: `At current pace, about ${Math.min(weeksToClose, 52)} weeks to close. Ask 2 customers this week.`,
    status: "attention",
    verifyUrl: s.googleSearchUrl,
    surprise: 5,
    actionText: null,
    actionUrl: null,
    signalType: "review_gap",
  };
}

// ── Signal 5: Rating Comparison ───────────────────────────────────────

async function checkRatingSignal(s: OrgSnapshot): Promise<OzEngineResult | null> {
  if (!s.clientRating || !s.competitorName) return null;

  // You lead in reviews
  if (s.competitorReviews && s.clientReviews > s.competitorReviews) {
    const lead = s.clientReviews - s.competitorReviews;
    return {
      headline: `You lead ${s.competitorName} by ${lead} reviews in ${s.city || "your market"}.`,
      context: s.clientRating > (s.competitorRating || 0)
        ? `And your ${s.clientRating}-star rating beats their ${s.competitorRating}. Strong position.`
        : `Keep the momentum. One review per week compounds into a moat.`,
      status: "healthy",
      verifyUrl: s.googleSearchUrl,
      surprise: 3,
      actionText: null,
      actionUrl: null,
      signalType: "review_lead",
    };
  }

  // Rating advantage even if behind on count
  if (s.competitorRating && s.clientRating > s.competitorRating) {
    const ratingDiff = (s.clientRating - s.competitorRating).toFixed(1);
    return {
      headline: `Your ${s.clientRating}-star rating beats ${s.competitorName} by ${ratingDiff} stars.`,
      context: `Higher stars mean higher click-through in Google results and AI answers. That's earned trust.`,
      status: "healthy",
      verifyUrl: s.googleSearchUrl,
      surprise: 4,
      actionText: null,
      actionUrl: null,
      signalType: "rating_advantage",
    };
  }

  return null;
}

// ── Signal 6: Clean Week (Known 9) ────────────────────────────────────

async function checkCleanWeek(s: OrgSnapshot): Promise<OzEngineResult | null> {
  try {
    const snapshots = await db("weekly_ranking_snapshots")
      .where({ org_id: s.orgId })
      .orderBy("week_start", "desc")
      .limit(2);

    if (snapshots.length < 2) return null;

    const current = snapshots[0];
    const previous = snapshots[1];

    const positionStable = current.position && previous.position && current.position <= previous.position;
    const compDelta = (current.competitor_review_count || 0) - (previous.competitor_review_count || 0);

    if (positionStable && compDelta <= 0) {
      return {
        headline: `Quiet week in ${s.city || "your market"}. No competitor gained ground.`,
        context: "Your position held steady. Alloro is watching and will tell you when something changes.",
        status: "healthy",
        verifyUrl: null,
        surprise: 1,
        actionText: null,
        actionUrl: null,
        signalType: "clean_week",
      };
    }

    return null;
  } catch {
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function tryParse(str: string): any {
  try { return JSON.parse(str); } catch { return null; }
}
