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
  /** Founder context from weekly ritual (organizations.client_context) */
  clientContext: string | null;
  /** Proofline scan count from agent_results this week */
  prooflineScansThisWeek: number;
  /** Total DFY actions from behavioral_events this week */
  dfyActionsThisWeek: number;
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

  if (signals.length === 0) {
    // Cold-start fallback: always produce something from checkup_data
    return buildColdStartHero(snapshot);
  }

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
  const genericCompName = typeof topComp === "string" ? topComp : topComp?.name || null;
  const genericCompPlaceId = typeof topComp === "object" ? topComp?.placeId || null : null;
  const genericCompReviews = typeof topComp === "object" ? topComp?.reviewCount || null : null;
  const genericCompRating = typeof topComp === "object" ? topComp?.rating || null : null;

  // Target competitor override: when the client says "beat Centreville,"
  // that org's target_competitor fields take priority over whatever
  // checkup_data thinks the top competitor is.
  const hasTargetCompetitor = !!org.target_competitor_name;
  const competitorName = hasTargetCompetitor
    ? org.target_competitor_name
    : (genericCompName ? cleanCompetitorName(genericCompName) : null);
  const competitorPlaceId = hasTargetCompetitor
    ? org.target_competitor_place_id
    : genericCompPlaceId;

  // If we have a target competitor place_id but no review data from checkup_data,
  // try to pull their latest stats from weekly_ranking_snapshots
  let competitorReviews = hasTargetCompetitor ? null : genericCompReviews;
  let competitorRating = hasTargetCompetitor ? null : genericCompRating;

  if (hasTargetCompetitor) {
    try {
      const targetSnapshot = await db("weekly_ranking_snapshots")
        .where({ org_id: orgId })
        .whereRaw("LOWER(competitor_name) = LOWER(?)", [org.target_competitor_name])
        .orderBy("week_start", "desc")
        .first();
      if (targetSnapshot) {
        competitorReviews = targetSnapshot.competitor_review_count || null;
        competitorRating = targetSnapshot.competitor_rating || null;
      }
    } catch {
      // weekly_ranking_snapshots may not have this competitor yet
    }
  }

  const city = cd?.market?.city || null;
  const specialty = cd?.market?.specialty || null;
  const orgName = org.name || null;

  // Fetch proof-of-work counts for the receipt
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  let prooflineScansThisWeek = 0;
  let dfyActionsThisWeek = 0;

  try {
    const prooflineCount = await db("agent_results")
      .where({ organization_id: orgId })
      .where("agent_type", "proofline")
      .where("created_at", ">=", weekAgo)
      .count("id as cnt")
      .first();
    prooflineScansThisWeek = parseInt(String(prooflineCount?.cnt || 0), 10);
  } catch {
    // agent_results table may not exist yet
  }

  try {
    const dfyCount = await db("behavioral_events")
      .where({ org_id: orgId })
      .where("event_type", "like", "dfy.%")
      .where("created_at", ">=", weekAgo)
      .count("id as cnt")
      .first();
    dfyActionsThisWeek = parseInt(String(dfyCount?.cnt || 0), 10);
  } catch {
    // behavioral_events table may not exist yet
  }

  return {
    orgId,
    orgName,
    city,
    specialty,
    clientReviews: cd?.place?.reviewCount || cd?.reviewCount || 0,
    clientRating: cd?.place?.rating || cd?.rating || null,
    competitorName: competitorName || null,
    competitorReviews: competitorReviews,
    competitorRating: competitorRating,
    competitorPlaceId: competitorPlaceId,
    clientPlaceId: cd?.placeId || cd?.place?.placeId || null,
    googleSearchUrl: orgName
      ? `https://www.google.com/search?q=${encodeURIComponent(orgName)}`
      : null,
    marketSearchUrl: city && specialty
      ? `https://www.google.com/search?q=${encodeURIComponent(specialty + " " + city)}`
      : null,
    clientContext: org.client_context || null,
    prooflineScansThisWeek,
    dfyActionsThisWeek,
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

    // Steering correction: tell them exactly what to do, not just the data
    const contextWithSeason = s.clientContext
      ? `Alloro noticed the silence. ${s.clientContext.includes(gpName) ? "You mentioned them recently." : "A 5-minute call this week could reopen your highest-value relationship."}`
      : `A 5-minute call this week could reopen your highest-value relationship. They averaged ${Math.round(priorMonthly)} referrals per month before going quiet.`;

    return {
      headline: `Call ${gpName} this week. They stopped referring ${daysSilent} days ago.`,
      context: contextWithSeason,
      status: "critical",
      verifyUrl: null,
      surprise: 8,
      actionText: `Call ${gpName}`,
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

    // Steering correction: is action needed, or just monitoring?
    if (positionDrop > 0) {
      // Action needed: position lost
      return {
        headline: `${compName} is gaining ground. Send 3 review requests this week to hold your position.`,
        context: `They added ${compDelta} reviews while you added ${clientDelta}. Your position dropped. 3 reviews this week stops the slide.`,
        status: "critical",
        verifyUrl: s.marketSearchUrl,
        surprise: 8,
        actionText: "Send review requests",
        actionUrl: "/reviews",
        signalType: "competitor_surge",
      };
    }

    // Monitoring: competitor moved but position held
    return {
      headline: `${compName} added ${compDelta} review${compDelta !== 1 ? "s" : ""} this week. Your position held.`,
      context: `Alloro is watching this. No action needed yet, but matching their pace (${compDelta} per week) keeps you safe.`,
      status: "attention",
      verifyUrl: s.marketSearchUrl,
      surprise: 5,
      actionText: null,
      actionUrl: null,
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

  // Within striking distance: clear action, specific timeline
  if (daysToClose <= 14) {
    return {
      headline: `You pass ${s.competitorName} in ${daysToClose} days. Send ${Math.min(gap, 3)} review requests today.`,
      context: `You're ${gap} review${gap !== 1 ? "s" : ""} away. At your current pace this closes itself, but ${Math.min(gap, 3)} requests today could cut that in half.`,
      status: "attention",
      verifyUrl: s.googleSearchUrl,
      surprise: 7,
      actionText: "Send review requests",
      actionUrl: "/reviews",
      signalType: "closeable_gap",
    };
  }

  // Large gap: reframe as long game, not emergency
  if (gap > 100) {
    return {
      headline: `The gap with ${s.competitorName} is ${gap} reviews. This is a long game, not a sprint.`,
      context: `2 reviews per week is the formula. Alloro is tracking your pace. ${s.clientContext ? s.clientContext : "Consistency compounds."}`,
      status: "attention",
      verifyUrl: s.googleSearchUrl,
      surprise: 4,
      actionText: null,
      actionUrl: null,
      signalType: "review_gap",
    };
  }

  // Medium gap: connect effort to outcome
  const weeksToClose = Math.ceil(gap / Math.max(1, clientWeekly));
  return {
    headline: `${gap} reviews to close. Ask 2 patients this week.`,
    context: `At your current pace, you pass ${s.competitorName} in about ${Math.min(weeksToClose, 52)} weeks. Every review request this week accelerates that.`,
    status: "attention",
    verifyUrl: s.googleSearchUrl,
    surprise: 5,
    actionText: "Send review requests",
    actionUrl: "/reviews",
    signalType: "review_gap",
  };
}

// ── Signal 5: Rating Comparison ───────────────────────────────────────

async function checkRatingSignal(s: OrgSnapshot): Promise<OzEngineResult | null> {
  if (!s.clientRating || !s.competitorName) return null;

  // You lead in reviews: confirm the position, reinforce what's working
  if (s.competitorReviews && s.clientReviews > s.competitorReviews) {
    const lead = s.clientReviews - s.competitorReviews;
    return {
      headline: `Your lead over ${s.competitorName} is ${lead} reviews. Nothing to do here.`,
      context: s.clientRating > (s.competitorRating || 0)
        ? `Your ${s.clientRating}-star rating beats their ${s.competitorRating} too. Alloro is watching to alert you if that changes.`
        : `Keep doing what you're doing. Alloro will tell you if ${s.competitorName} starts closing the gap.`,
      status: "healthy",
      verifyUrl: s.googleSearchUrl,
      surprise: 3,
      actionText: null,
      actionUrl: null,
      signalType: "review_lead",
    };
  }

  // Rating advantage even if behind on count: acknowledge the strength
  if (s.competitorRating && s.clientRating > s.competitorRating) {
    const ratingDiff = (s.clientRating - s.competitorRating).toFixed(1);
    return {
      headline: `Your ${s.clientRating}-star rating beats ${s.competitorName} by ${ratingDiff} stars. That's your moat.`,
      context: `Higher stars mean higher click-through in Google and AI answers. Volume closes the rest of the gap. Alloro is tracking both.`,
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
      // The signature dish: proof we checked, nothing needed your attention.
      // This is the default state of confidence. Elevated from surprise:1 to surprise:6
      // because a confirmed clean week IS the product working.
      const totalActions = s.prooflineScansThisWeek + s.dfyActionsThisWeek;
      const proofLine = totalActions > 0
        ? `Alloro ran ${totalActions} check${totalActions !== 1 ? "s" : ""} this week${s.prooflineScansThisWeek > 0 ? ` (${s.prooflineScansThisWeek} market scans)` : ""}. Nothing needed your attention.`
        : `Alloro monitored your market this week. Nothing needed your attention.`;

      return {
        headline: `Clean week. Your business is on track.`,
        context: proofLine,
        status: "healthy",
        verifyUrl: null,
        surprise: 6,
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

// ── Cold-Start Hero (when all signal checks return null) ─────────────
//
// New accounts, accounts without weekly_ranking_snapshots, accounts where
// crons haven't fired yet. The hero card should NEVER be empty if the
// org has checkup_data. This produces a real, verifiable insight from
// whatever data exists at signup time.
//

function buildColdStartHero(s: OrgSnapshot): OzEngineResult | null {
  // Priority 1: Quantified review gap with competitor named -- frame as what Alloro will do
  if (s.competitorName && s.competitorReviews && s.clientReviews > 0) {
    const gap = s.competitorReviews - s.clientReviews;
    if (gap > 0) {
      return {
        headline: `Alloro found ${s.competitorName}. They have ${gap} more reviews than you.`,
        context: `Alloro is now watching them weekly. Your first Monday brief will tell you exactly what to do about it. No guessing.`,
        status: gap > 100 ? "attention" : "healthy",
        verifyUrl: s.googleSearchUrl,
        surprise: 4,
        actionText: "See the full comparison",
        actionUrl: "/compare",
        signalType: "cold_start_gap",
      };
    }
    // You lead
    return {
      headline: `You lead ${s.competitorName} by ${Math.abs(gap)} reviews. Alloro will make sure it stays that way.`,
      context: `Alloro is now monitoring ${s.competitorName} and your market in ${s.city || "your area"} every week. If anything changes, you'll know Monday morning.`,
      status: "healthy",
      verifyUrl: s.googleSearchUrl,
      surprise: 3,
      actionText: null,
      actionUrl: null,
      signalType: "cold_start_lead",
    };
  }

  // Priority 2: Rating advantage without review counts
  if (s.competitorName && s.clientRating && s.competitorRating) {
    if (s.clientRating > s.competitorRating) {
      return {
        headline: `Your ${s.clientRating}-star rating beats ${s.competitorName}. That's your edge.`,
        context: `Alloro is now tracking both ratings and review volume. Your Monday brief will show you if anything shifts.`,
        status: "healthy",
        verifyUrl: s.googleSearchUrl,
        surprise: 3,
        actionText: null,
        actionUrl: null,
        signalType: "cold_start_rating",
      };
    }
    return {
      headline: `${s.competitorName} has a higher rating. Alloro will show you how to close it.`,
      context: `Your Monday brief will include the specific steps. Volume is the fastest lever. 2 review requests this week starts the process.`,
      status: "attention",
      verifyUrl: s.googleSearchUrl,
      surprise: 3,
      actionText: "Send review requests",
      actionUrl: "/reviews",
      signalType: "cold_start_rating_gap",
    };
  }

  // Priority 3: Market context with competitor named
  if (s.competitorName && s.city) {
    return {
      headline: `Alloro is now watching your market in ${s.city}.`,
      context: `${s.competitorName} and every other competitor in your area are being tracked. Your first Monday brief arrives next week with what we found.`,
      status: "healthy",
      verifyUrl: s.marketSearchUrl,
      surprise: 2,
      actionText: null,
      actionUrl: null,
      signalType: "cold_start_market",
    };
  }

  // Priority 4: Basic org data only
  if (s.city || s.orgName) {
    return {
      headline: `Alloro is scanning your market. Your first brief arrives Monday.`,
      context: `Every week, Alloro checks your competitors, reviews, and visibility in ${s.city || "your area"}. If something needs your attention, you'll know.`,
      status: "healthy",
      verifyUrl: s.googleSearchUrl || s.marketSearchUrl,
      surprise: 1,
      actionText: null,
      actionUrl: null,
      signalType: "cold_start_basic",
    };
  }

  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────

function tryParse(str: string): any {
  try { return JSON.parse(str); } catch { return null; }
}
