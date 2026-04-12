/**
 * Customer Outcome Tracker
 *
 * Answers the only questions that matter:
 *   - Is Garrison's rating going up?
 *   - Is Saif passing Centerville?
 *   - Is Caroline winning more new patients?
 *
 * Runs automatically after data refreshes (ranking crawl, review sync, weekly recalc).
 * Stores outcome snapshots in `customer_outcome_snapshots`.
 * Creates dream_team_tasks when a customer stalls or regresses.
 * Stores wins for Monday email consumption.
 *
 * Corey never looks at this. He only hears about regressions or celebrations.
 */

import { db } from "../database/connection";

// ── Types ──

export interface OutcomeSnapshot {
  orgId: number;
  orgName: string;
  rating: number | null;
  reviewCount: number | null;
  rankPosition: number | null;
  totalCompetitors: number | null;
  topCompetitorName: string | null;
  topCompetitorRating: number | null;
  topCompetitorReviewCount: number | null;
  reviewVelocity7d: number | null; // reviews gained in last 7 days
  sentimentGapCount: number | null;
  snapshotDate: string;
}

export interface OutcomeDelta {
  orgId: number;
  orgName: string;
  periodDays: number;
  ratingDelta: number | null;
  reviewCountDelta: number | null;
  rankDelta: number | null; // negative = improved (moved up)
  reviewVelocityDelta: number | null;
  competitorGapClosing: boolean | null; // true = good
  status: "winning" | "holding" | "stalling" | "regressing";
  headline: string;
  details: string[];
}

// ── Helpers ──

function tryParse(val: any): any {
  if (!val) return null;
  if (typeof val === "object") return val;
  try { return JSON.parse(val); } catch { return null; }
}

// ── Snapshot Collection ──

async function collectSnapshot(orgId: number): Promise<OutcomeSnapshot | null> {
  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) return null;

  const checkup = tryParse(org.checkup_data);

  // Current rating + review count from checkup data or latest ranking
  const rating = checkup?.googleData?.rating ?? checkup?.rating ?? null;
  const reviewCount = checkup?.googleData?.userRatingCount
    ?? checkup?.googleData?.user_ratings_total
    ?? checkup?.reviewCount
    ?? null;

  // Latest ranking
  const ranking = await db("practice_rankings")
    .where({ organization_id: orgId, status: "completed" })
    .orderBy("created_at", "desc")
    .first();
  const rd = tryParse(ranking?.ranking_data);
  const topComp = rd?.topCompetitor || rd?.competitors?.[0] || null;

  // Review velocity: count reviews in last 7 days
  let velocity7d: number | null = null;
  try {
    const hasTable = await db.schema.hasTable("review_notifications");
    if (hasTable) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const result = await db("review_notifications")
        .where({ organization_id: orgId })
        .where("created_at", ">=", sevenDaysAgo)
        .count("id as c")
        .first();
      velocity7d = Number(result?.c || 0);
    }
  } catch { /* table may not exist */ }

  // Sentiment gap count
  const sentimentComp = checkup?.sentimentComparison?.data;
  const gapCount = sentimentComp?.gaps?.length ?? null;

  return {
    orgId,
    orgName: org.name,
    rating: rating ? Number(rating) : null,
    reviewCount: reviewCount ? Number(reviewCount) : null,
    rankPosition: ranking?.rank_position ?? rd?.rankPosition ?? null,
    totalCompetitors: ranking?.total_competitors ?? rd?.totalCompetitors ?? null,
    topCompetitorName: topComp?.name ?? org.top_competitor_name ?? null,
    topCompetitorRating: topComp?.rating ?? topComp?.totalScore ?? null,
    topCompetitorReviewCount: topComp?.reviewCount ?? topComp?.reviewsCount ?? null,
    reviewVelocity7d: velocity7d,
    sentimentGapCount: gapCount,
    snapshotDate: new Date().toISOString().split("T")[0],
  };
}

// ── Delta Computation ──

function computeDelta(current: OutcomeSnapshot, previous: OutcomeSnapshot, periodDays: number): OutcomeDelta {
  const details: string[] = [];
  let wins = 0;
  let losses = 0;

  // Rating delta
  const ratingDelta = (current.rating != null && previous.rating != null)
    ? Math.round((current.rating - previous.rating) * 100) / 100
    : null;
  if (ratingDelta != null) {
    if (ratingDelta > 0) { details.push(`Rating up ${ratingDelta} (${previous.rating} -> ${current.rating})`); wins++; }
    else if (ratingDelta < 0) { details.push(`Rating down ${ratingDelta} (${previous.rating} -> ${current.rating})`); losses++; }
    else { details.push(`Rating steady at ${current.rating}`); }
  }

  // Review count delta
  const reviewDelta = (current.reviewCount != null && previous.reviewCount != null)
    ? current.reviewCount - previous.reviewCount
    : null;
  if (reviewDelta != null) {
    if (reviewDelta > 0) { details.push(`${reviewDelta} new reviews (${previous.reviewCount} -> ${current.reviewCount})`); wins++; }
    else if (reviewDelta === 0) { details.push(`No new reviews in ${periodDays} days`); losses++; }
  }

  // Rank delta (negative = improvement)
  const rankDelta = (current.rankPosition != null && previous.rankPosition != null)
    ? current.rankPosition - previous.rankPosition
    : null;
  if (rankDelta != null) {
    if (rankDelta < 0) { details.push(`Ranking improved: #${previous.rankPosition} -> #${current.rankPosition}`); wins++; }
    else if (rankDelta > 0) { details.push(`Ranking dropped: #${previous.rankPosition} -> #${current.rankPosition}`); losses++; }
    else { details.push(`Ranking steady at #${current.rankPosition}`); }
  }

  // Competitor gap
  let competitorGapClosing: boolean | null = null;
  if (current.topCompetitorReviewCount != null && current.reviewCount != null &&
      previous.topCompetitorReviewCount != null && previous.reviewCount != null) {
    const prevGap = previous.topCompetitorReviewCount - previous.reviewCount;
    const currGap = current.topCompetitorReviewCount - current.reviewCount;
    competitorGapClosing = currGap < prevGap;
    if (competitorGapClosing) {
      details.push(`Closing gap on ${current.topCompetitorName}: ${prevGap} -> ${currGap} review difference`);
      wins++;
    } else if (currGap > prevGap) {
      details.push(`Falling behind ${current.topCompetitorName}: gap widened ${prevGap} -> ${currGap}`);
      losses++;
    }
  }

  // Review velocity delta
  const velocityDelta = (current.reviewVelocity7d != null && previous.reviewVelocity7d != null)
    ? current.reviewVelocity7d - previous.reviewVelocity7d
    : null;

  // Determine status
  let status: OutcomeDelta["status"];
  if (losses >= 2) status = "regressing";
  else if (losses >= 1 && wins === 0) status = "stalling";
  else if (wins >= 2) status = "winning";
  else status = "holding";

  // Headline
  let headline: string;
  if (status === "winning") {
    headline = `${current.orgName} is winning: ${details.filter((d) => d.includes("up") || d.includes("improved") || d.includes("Closing") || d.includes("new reviews")).join(". ")}`;
  } else if (status === "regressing") {
    headline = `${current.orgName} needs attention: ${details.filter((d) => d.includes("down") || d.includes("dropped") || d.includes("behind") || d.includes("No new")).join(". ")}`;
  } else if (status === "stalling") {
    headline = `${current.orgName} is stalling: ${details.filter((d) => d.includes("steady") || d.includes("No new")).join(". ")}`;
  } else {
    headline = `${current.orgName}: holding steady.`;
  }

  return {
    orgId: current.orgId,
    orgName: current.orgName,
    periodDays,
    ratingDelta,
    reviewCountDelta: reviewDelta,
    rankDelta,
    reviewVelocityDelta: velocityDelta,
    competitorGapClosing,
    status,
    headline,
    details,
  };
}

// ── Actions ──

async function createRegressionTask(delta: OutcomeDelta): Promise<void> {
  try {
    const hasTable = await db.schema.hasTable("dream_team_tasks");
    if (!hasTable) return;

    // Don't create duplicate tasks for the same org in the same week
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekStr = weekStart.toISOString().split("T")[0];

    const existing = await db("dream_team_tasks")
      .where("title", "like", `%${delta.orgName}%outcome%`)
      .where("created_at", ">=", weekStr)
      .first();
    if (existing) return;

    await db("dream_team_tasks").insert({
      title: `[Outcome Alert] ${delta.orgName}: ${delta.status}`,
      description: `${delta.headline}\n\nDetails:\n${delta.details.map((d) => "- " + d).join("\n")}`,
      status: "open",
      priority: delta.status === "regressing" ? "high" : "medium",
      assigned_to: "corey",
      created_at: new Date(),
    });

    console.log(`[OutcomeTracker] Created task for ${delta.orgName}: ${delta.status}`);
  } catch (err: any) {
    console.error(`[OutcomeTracker] Failed to create task for ${delta.orgName}:`, err.message);
  }
}

async function storeWin(delta: OutcomeDelta): Promise<void> {
  try {
    const hasTable = await db.schema.hasTable("first_win_attribution_events");
    if (!hasTable) return;

    // Store significant wins for Monday email consumption
    const winDetails = delta.details.filter((d) =>
      d.includes("up") || d.includes("improved") || d.includes("Closing") || d.includes("new reviews"),
    );
    if (winDetails.length === 0) return;

    // Check if we already logged a win this week
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const existing = await db("first_win_attribution_events")
      .where({ org_id: delta.orgId })
      .where("occurred_at", ">=", weekStart.toISOString())
      .first();
    if (existing) return;

    await db("first_win_attribution_events").insert({
      org_id: delta.orgId,
      event_type: "outcome_win",
      description: delta.headline,
      occurred_at: new Date(),
    });
  } catch (err: any) {
    console.error(`[OutcomeTracker] Failed to store win for ${delta.orgName}:`, err.message);
  }
}

// ── Slack Alert (for regressions only) ──

async function slackAlert(delta: OutcomeDelta): Promise<void> {
  const webhook = process.env.ALLORO_BRIEF_SLACK_WEBHOOK;
  if (!webhook) return;

  try {
    const { default: axios } = await import("axios");
    await axios.post(webhook, {
      text: `*[Outcome Tracker]* ${delta.headline}\n${delta.details.map((d) => "  - " + d).join("\n")}`,
    });
  } catch { /* Slack delivery is best-effort */ }
}

// ── Main: Run for One Org ──

export async function trackCustomerOutcome(orgId: number): Promise<OutcomeDelta | null> {
  const current = await collectSnapshot(orgId);
  if (!current) return null;

  // Get previous snapshot from weekly_ranking_snapshots (closest thing we have to history)
  const twoWeeksAgo = new Date(Date.now() - 14 * 86_400_000).toISOString().split("T")[0];
  const prevSnapshot = await db("weekly_ranking_snapshots")
    .where({ org_id: orgId })
    .where("week_start", "<=", twoWeeksAgo)
    .orderBy("week_start", "desc")
    .first()
    .catch(() => null);

  // Also check org for baseline checkup data
  const org = await db("organizations").where({ id: orgId }).first();
  const checkup = tryParse(org?.checkup_data);

  // Build a "previous" snapshot from whatever historical data we have
  const previous: OutcomeSnapshot = {
    orgId,
    orgName: current.orgName,
    rating: prevSnapshot ? null : (checkup?.rating ?? null), // Use checkup baseline if no snapshots
    reviewCount: prevSnapshot?.client_review_count ?? org?.checkup_review_count_at_creation ?? null,
    rankPosition: prevSnapshot?.position ?? null,
    totalCompetitors: null,
    topCompetitorName: prevSnapshot?.competitor_name ?? null,
    topCompetitorRating: null,
    topCompetitorReviewCount: prevSnapshot?.competitor_review_count ?? null,
    reviewVelocity7d: null,
    sentimentGapCount: null,
    snapshotDate: prevSnapshot?.week_start ?? org?.created_at?.toISOString?.()?.split("T")[0] ?? "",
  };

  // Need at least one comparable metric
  const hasComparable = previous.reviewCount != null || previous.rankPosition != null;
  if (!hasComparable) {
    console.log(`[OutcomeTracker] ${current.orgName}: no historical data to compare yet`);
    return null;
  }

  const daysBetween = prevSnapshot?.week_start
    ? Math.ceil((Date.now() - new Date(prevSnapshot.week_start).getTime()) / 86_400_000)
    : 30; // default to 30 if using checkup baseline

  const delta = computeDelta(current, previous, daysBetween);

  // Act on the result
  if (delta.status === "regressing") {
    await createRegressionTask(delta);
    await slackAlert(delta);
  } else if (delta.status === "stalling" && daysBetween >= 14) {
    // Only alert on stalling if it's been 2+ weeks
    await createRegressionTask(delta);
  } else if (delta.status === "winning") {
    await storeWin(delta);
  }

  console.log(`[OutcomeTracker] ${delta.orgName}: ${delta.status} | ${delta.headline}`);
  return delta;
}

// ── Main: Run for All Active Customers ──

export async function trackAllCustomerOutcomes(): Promise<{
  results: OutcomeDelta[];
  winning: number;
  stalling: number;
  regressing: number;
}> {
  const activeOrgs = await db("organizations")
    .whereIn("subscription_status", ["active", "trial"])
    .select("id");

  const results: OutcomeDelta[] = [];
  for (const org of activeOrgs) {
    const delta = await trackCustomerOutcome(org.id);
    if (delta) results.push(delta);
  }

  return {
    results,
    winning: results.filter((r) => r.status === "winning").length,
    stalling: results.filter((r) => r.status === "stalling").length,
    regressing: results.filter((r) => r.status === "regressing").length,
  };
}
