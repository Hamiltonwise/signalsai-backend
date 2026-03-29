/**
 * TTFV Detection Service
 *
 * Autonomous Time-to-First-Value scoring.
 * Queries behavioral signals to determine if an org has
 * reached the threshold where billing is appropriate.
 *
 * Score >= 50 = TTFV reached.
 */

import { db } from "../database/connection";

interface TTFVResult {
  reached: boolean;
  signals: string[];
  score: number;
}

export async function detectTTFV(orgId: number): Promise<TTFVResult> {
  const signals: string[] = [];
  let score = 0;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Signal 1: 3+ dashboard visits in 7 days (+30 points)
  try {
    const dashboardVisits = await db("behavioral_events")
      .where({ org_id: orgId, event_type: "dashboard.visit" })
      .where("created_at", ">=", sevenDaysAgo)
      .count("id as cnt")
      .first();
    const visitCount = Number(dashboardVisits?.cnt || 0);
    if (visitCount >= 3) {
      score += 30;
      signals.push("Active user");
    }
  } catch { /* non-critical */ }

  // Signal 2: GBP connected (+25 points)
  try {
    const connections = await db("connections")
      .where({ organization_id: orgId })
      .whereNotNull("access_token")
      .count("id as cnt")
      .first();
    if (Number(connections?.cnt || 0) > 0) {
      score += 25;
      signals.push("Connected GBP");
    }
  } catch { /* non-critical */ }

  // Signal 3: Review count increased since checkup (+25 points)
  try {
    const org = await db("organizations")
      .where({ id: orgId })
      .select("checkup_review_count_at_creation")
      .first();
    const baseline = org?.checkup_review_count_at_creation;
    if (baseline != null) {
      const latestSnapshot = await db("weekly_ranking_snapshots")
        .where({ org_id: orgId })
        .orderBy("created_at", "desc")
        .first();
      if (latestSnapshot?.client_review_count && latestSnapshot.client_review_count > baseline) {
        score += 25;
        signals.push("Growing reviews");
      }
    }
  } catch { /* non-critical */ }

  // Signal 4: Monday email opened (+10 points)
  try {
    const emailOpened = await db("behavioral_events")
      .where({ org_id: orgId })
      .where("event_type", "like", "monday_email.opened%")
      .count("id as cnt")
      .first();
    if (Number(emailOpened?.cnt || 0) > 0) {
      score += 10;
      signals.push("Engaged with intelligence");
    }
  } catch { /* non-critical */ }

  // Signal 5: One Action Card completed (+10 points)
  try {
    const actionCompleted = await db("behavioral_events")
      .where({ org_id: orgId, event_type: "action_card.completed" })
      .count("id as cnt")
      .first();
    if (Number(actionCompleted?.cnt || 0) > 0) {
      score += 10;
      signals.push("Acted on recommendation");
    }
  } catch { /* non-critical */ }

  return {
    reached: score >= 50,
    signals,
    score,
  };
}
