/**
 * Review Velocity Tracker -- WO-REVIEW-VELOCITY
 *
 * Computes reviews-per-week from weekly_ranking_snapshots for both
 * the client org and their top competitor. These numbers power:
 * - Monday email dollar figure (already uses them -- now accurate)
 * - Gap-closing timeline in competitor drawer (T1-A)
 * - Tuesday disruption alert threshold
 *
 * // T2 registers any endpoints if needed
 */

import { db } from "../database/connection";

interface VelocityResult {
  reviews_per_week: number;
  snapshots_used: number;
  oldest_count: number;
  newest_count: number;
  weeks_elapsed: number;
}

/**
 * Compute review velocity for an org from its last 4 weekly snapshots.
 * Returns reviews per week (decimal, can be 0 or negative).
 */
export async function computeReviewVelocity(orgId: number): Promise<VelocityResult> {
  const snapshots = await db("weekly_ranking_snapshots")
    .where({ org_id: orgId })
    .whereNotNull("client_review_count")
    .orderBy("week_start", "desc")
    .limit(4)
    .select("client_review_count", "week_start");

  if (snapshots.length < 2) {
    return { reviews_per_week: 0, snapshots_used: snapshots.length, oldest_count: 0, newest_count: 0, weeks_elapsed: 0 };
  }

  const newest = snapshots[0];
  const oldest = snapshots[snapshots.length - 1];

  const newestDate = new Date(newest.week_start);
  const oldestDate = new Date(oldest.week_start);
  const msElapsed = newestDate.getTime() - oldestDate.getTime();
  const weeksElapsed = msElapsed / (7 * 24 * 60 * 60 * 1000);

  if (weeksElapsed <= 0) {
    return { reviews_per_week: 0, snapshots_used: snapshots.length, oldest_count: oldest.client_review_count, newest_count: newest.client_review_count, weeks_elapsed: 0 };
  }

  const velocity = (newest.client_review_count - oldest.client_review_count) / weeksElapsed;
  const rounded = Math.round(velocity * 100) / 100;

  // Persist on org
  await db("organizations")
    .where({ id: orgId })
    .update({ review_velocity_per_week: rounded });

  return {
    reviews_per_week: rounded,
    snapshots_used: snapshots.length,
    oldest_count: oldest.client_review_count,
    newest_count: newest.client_review_count,
    weeks_elapsed: Math.round(weeksElapsed * 10) / 10,
  };
}

/**
 * Compute review velocity for the org's top competitor.
 * Uses competitor_review_count and competitor_name from snapshots.
 */
export async function computeCompetitorVelocity(orgId: number): Promise<VelocityResult> {
  const snapshots = await db("weekly_ranking_snapshots")
    .where({ org_id: orgId })
    .whereNotNull("competitor_review_count")
    .orderBy("week_start", "desc")
    .limit(4)
    .select("competitor_review_count", "competitor_name", "week_start");

  if (snapshots.length < 2) {
    return { reviews_per_week: 0, snapshots_used: snapshots.length, oldest_count: 0, newest_count: 0, weeks_elapsed: 0 };
  }

  const newest = snapshots[0];
  const oldest = snapshots[snapshots.length - 1];

  const newestDate = new Date(newest.week_start);
  const oldestDate = new Date(oldest.week_start);
  const msElapsed = newestDate.getTime() - oldestDate.getTime();
  const weeksElapsed = msElapsed / (7 * 24 * 60 * 60 * 1000);

  if (weeksElapsed <= 0) {
    return { reviews_per_week: 0, snapshots_used: snapshots.length, oldest_count: oldest.competitor_review_count, newest_count: newest.competitor_review_count, weeks_elapsed: 0 };
  }

  const velocity = (newest.competitor_review_count - oldest.competitor_review_count) / weeksElapsed;
  const rounded = Math.round(velocity * 100) / 100;

  // Persist on org
  await db("organizations")
    .where({ id: orgId })
    .update({ competitor_review_velocity_per_week: rounded });

  return {
    reviews_per_week: rounded,
    snapshots_used: snapshots.length,
    oldest_count: oldest.competitor_review_count,
    newest_count: newest.competitor_review_count,
    weeks_elapsed: Math.round(weeksElapsed * 10) / 10,
  };
}

/**
 * Compute both velocities for an org. Called at end of every snapshot generation.
 */
export async function computeAllVelocities(orgId: number): Promise<void> {
  try {
    const client = await computeReviewVelocity(orgId);
    const competitor = await computeCompetitorVelocity(orgId);
    console.log(
      `[ReviewVelocity] org ${orgId}: client ${client.reviews_per_week}/wk, competitor ${competitor.reviews_per_week}/wk (${client.snapshots_used} snapshots)`
    );
  } catch (err: any) {
    console.error(`[ReviewVelocity] Failed for org ${orgId}:`, err.message);
  }
}
