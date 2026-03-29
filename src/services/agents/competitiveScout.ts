/**
 * Competitive Scout Agent — Execution Service
 *
 * Runs weekly (Wednesday 8 AM ET, after Sunday ranking snapshots).
 * Compares the last 2 weekly_ranking_snapshots per org, detects
 * competitor movements, and writes signals to behavioral_events
 * and notifications.
 *
 * Data-driven (SQL queries only). No AI calls.
 */

import { db } from "../../database/connection";

// ─── Types ──────────────────────────────────────────────────────────

interface CompetitorMovement {
  type:
    | "competitor.reviews_surge"
    | "competitor.rating_changed"
    | "competitor.new_entrant"
    | "competitor.went_inactive";
  headline: string;
  details: string;
  severity: "low" | "medium" | "high";
  competitorName: string | null;
  metadata: Record<string, unknown>;
}

interface ScoutSummary {
  orgId: number;
  orgName: string;
  movements: CompetitorMovement[];
  scannedAt: string;
}

// ─── Thresholds ─────────────────────────────────────────────────────

const REVIEW_SURGE_THRESHOLD = 5; // 5+ new reviews in a week
const RATING_CHANGE_THRESHOLD = 0.2; // 0.2-star shift is notable

// ─── Core ───────────────────────────────────────────────────────────

/**
 * Run the Competitive Scout for a single org.
 * Returns a summary of all detected movements.
 */
export async function runCompetitiveScoutForOrg(
  orgId: number
): Promise<ScoutSummary | null> {
  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) return null;

  // Fetch last 2 snapshots (most recent first)
  const snapshots = await db("weekly_ranking_snapshots")
    .where({ org_id: orgId })
    .orderBy("week_start", "desc")
    .limit(2);

  if (snapshots.length < 2) {
    // Need at least 2 weeks of data to compare
    return null;
  }

  const current = snapshots[0];
  const previous = snapshots[1];

  const movements: CompetitorMovement[] = [];

  // 1. Competitor review surge (5+ reviews added in a week)
  detectReviewSurge(current, previous, movements);

  // 2. Competitor rating change
  detectRatingChange(current, previous, movements);

  // 3. New competitor entered market
  detectNewEntrant(current, previous, movements);

  // 4. Competitor went inactive (was present, now gone or reviews stalled)
  detectInactive(current, previous, movements);

  // Write movements to behavioral_events and notifications
  for (const movement of movements) {
    await writeMovementEvent(orgId, movement);
    await writeMovementNotification(orgId, org.name, movement);
  }

  const summary: ScoutSummary = {
    orgId,
    orgName: org.name,
    movements,
    scannedAt: new Date().toISOString(),
  };

  if (movements.length > 0) {
    console.log(
      `[CompetitiveScout] ${org.name}: ${movements.length} movement(s) detected`
    );
  }

  return summary;
}

/**
 * Run the Competitive Scout for ALL active orgs with ranking data.
 */
export async function runCompetitiveScoutForAll(): Promise<{
  scanned: number;
  withMovements: number;
  totalMovements: number;
}> {
  // Find orgs that have at least 2 snapshots
  const orgIds = await db("weekly_ranking_snapshots")
    .select("org_id")
    .groupBy("org_id")
    .havingRaw("count(*) >= 2");

  let scanned = 0;
  let withMovements = 0;
  let totalMovements = 0;

  for (const row of orgIds) {
    try {
      const summary = await runCompetitiveScoutForOrg(row.org_id);
      if (summary) {
        scanned++;
        if (summary.movements.length > 0) {
          withMovements++;
          totalMovements += summary.movements.length;
        }
      }
    } catch (err: any) {
      console.error(
        `[CompetitiveScout] Failed for org ${row.org_id}:`,
        err.message
      );
    }
  }

  console.log(
    `[CompetitiveScout] Scanned ${scanned} orgs, ${withMovements} with movements, ${totalMovements} total signals`
  );
  return { scanned, withMovements, totalMovements };
}

// ─── Detection Functions ────────────────────────────────────────────

function detectReviewSurge(
  current: any,
  previous: any,
  movements: CompetitorMovement[]
): void {
  const currentReviews = current.competitor_review_count || 0;
  const previousReviews = previous.competitor_review_count || 0;
  const delta = currentReviews - previousReviews;

  if (delta >= REVIEW_SURGE_THRESHOLD && current.competitor_name) {
    const severity = delta >= 15 ? "high" : delta >= 10 ? "medium" : "low";
    movements.push({
      type: "competitor.reviews_surge",
      headline: `${current.competitor_name} added ${delta} reviews this week`,
      details: `${current.competitor_name} went from ${previousReviews} to ${currentReviews} reviews. ${
        severity === "high"
          ? "This is an aggressive review acquisition campaign."
          : "This is above the normal pace for your market."
      }`,
      severity,
      competitorName: current.competitor_name,
      metadata: {
        previous_count: previousReviews,
        current_count: currentReviews,
        delta,
      },
    });
  }
}

function detectRatingChange(
  current: any,
  previous: any,
  movements: CompetitorMovement[]
): void {
  // Rating data may not always be stored in the snapshot,
  // but if competitor_position shifted it indicates a change.
  // We check if the competitor name is the same and position changed.
  if (
    current.competitor_name &&
    previous.competitor_name &&
    current.competitor_name === previous.competitor_name
  ) {
    // Check review count ratios as a proxy for rating health
    const currentReviews = current.competitor_review_count || 0;
    const previousReviews = previous.competitor_review_count || 0;

    // If competitor lost reviews (indicates removed/flagged reviews), that is notable
    if (previousReviews > 0 && currentReviews < previousReviews) {
      const lost = previousReviews - currentReviews;
      movements.push({
        type: "competitor.rating_changed",
        headline: `${current.competitor_name} lost ${lost} reviews`,
        details: `${current.competitor_name} went from ${previousReviews} to ${currentReviews} reviews. Reviews may have been flagged or removed.`,
        severity: lost >= 5 ? "medium" : "low",
        competitorName: current.competitor_name,
        metadata: {
          previous_count: previousReviews,
          current_count: currentReviews,
          delta: -lost,
        },
      });
    }
  }
}

function detectNewEntrant(
  current: any,
  previous: any,
  movements: CompetitorMovement[]
): void {
  // A new competitor entered if the competitor name changed and
  // the previous competitor still had reviews (not just a data gap)
  if (
    current.competitor_name &&
    previous.competitor_name &&
    current.competitor_name !== previous.competitor_name &&
    previous.competitor_review_count > 0
  ) {
    movements.push({
      type: "competitor.new_entrant",
      headline: `New #1 competitor: ${current.competitor_name}`,
      details: `${current.competitor_name} displaced ${previous.competitor_name} as the top-ranked competitor in your market. They have ${current.competitor_review_count || 0} reviews.`,
      severity: "high",
      competitorName: current.competitor_name,
      metadata: {
        new_competitor: current.competitor_name,
        new_reviews: current.competitor_review_count,
        displaced_competitor: previous.competitor_name,
        displaced_reviews: previous.competitor_review_count,
      },
    });
  }
}

function detectInactive(
  current: any,
  previous: any,
  movements: CompetitorMovement[]
): void {
  // Competitor went inactive: had a name before, now no competitor data
  if (previous.competitor_name && !current.competitor_name) {
    movements.push({
      type: "competitor.went_inactive",
      headline: `${previous.competitor_name} no longer appearing in rankings`,
      details: `${previous.competitor_name} was previously ranked in your market but is no longer appearing. They may have closed, moved, or lost their listing.`,
      severity: "medium",
      competitorName: previous.competitor_name,
      metadata: {
        last_known_reviews: previous.competitor_review_count,
        last_known_position: previous.competitor_position,
      },
    });
  }

  // Competitor stagnated: same review count for both weeks (zero growth)
  if (
    current.competitor_name &&
    previous.competitor_name &&
    current.competitor_name === previous.competitor_name &&
    current.competitor_review_count === previous.competitor_review_count &&
    current.competitor_review_count > 0
  ) {
    // Only flag stagnation if the org itself is growing (opportunity signal)
    const clientGrew =
      (current.client_review_count || 0) > (previous.client_review_count || 0);
    if (clientGrew) {
      movements.push({
        type: "competitor.went_inactive",
        headline: `${current.competitor_name} review count stagnant`,
        details: `${current.competitor_name} held at ${current.competitor_review_count} reviews while you gained ground. Their review acquisition has stalled.`,
        severity: "low",
        competitorName: current.competitor_name,
        metadata: {
          stagnant_count: current.competitor_review_count,
          client_previous: previous.client_review_count,
          client_current: current.client_review_count,
        },
      });
    }
  }
}

// ─── Writers ────────────────────────────────────────────────────────

async function writeMovementEvent(
  orgId: number,
  movement: CompetitorMovement
): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "competitor.movement",
      org_id: orgId,
      properties: JSON.stringify({
        movement_type: movement.type,
        headline: movement.headline,
        details: movement.details,
        severity: movement.severity,
        competitor_name: movement.competitorName,
        ...movement.metadata,
      }),
    });
  } catch (err: any) {
    console.error(
      `[CompetitiveScout] Failed to write behavioral_event for org ${orgId}:`,
      err.message
    );
  }
}

async function writeMovementNotification(
  orgId: number,
  orgName: string,
  movement: CompetitorMovement
): Promise<void> {
  try {
    await db("notifications").insert({
      organization_id: orgId,
      title: movement.headline,
      message: movement.details,
      type: "competitive",
      read: false,
      metadata: JSON.stringify({
        source: "competitive_scout",
        movement_type: movement.type,
        severity: movement.severity,
        competitor_name: movement.competitorName,
        ...movement.metadata,
      }),
      created_at: new Date(),
      updated_at: new Date(),
    });
  } catch (err: any) {
    console.error(
      `[CompetitiveScout] Failed to write notification for org ${orgId}:`,
      err.message
    );
  }
}
