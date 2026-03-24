/**
 * Behavioral Event Intelligence Layer -- WO-BEHAVIORAL-INTELLIGENCE
 *
 * Mines behavioral_events for patterns instead of just logging.
 * Two functions:
 *   getEngagementScore  -- weighted 0-100 score from last 30 days
 *   getMostSignificantEvent -- single most important event from last 7 days
 *
 * // Engagement score feeds account health agent, Monday email
 * // personalization, and CS expander criteria
 */

import { db } from "../database/connection";

// ─── Event Weights ───

const EVENT_WEIGHTS: Record<string, { weight: number; max?: number; oneTime?: boolean }> = {
  "dashboard.viewed":              { weight: 1, max: 20 },
  "one_action_card.clicked":       { weight: 3 },
  "referral_intelligence.viewed":  { weight: 4 },
  "review_request.sent":           { weight: 5 },
  "ttfv.yes":                      { weight: 10, oneTime: true },
  "first_win.achieved":            { weight: 15, oneTime: true },
  "billing.subscription_created":  { weight: 20, oneTime: true },
};

const MAX_RAW_SCORE = 80;

// ─── Event Priority (for most significant) ───

const EVENT_PRIORITY: string[] = [
  "first_win.achieved",
  "billing.subscription_created",
  "billing.subscription_cancelled",
  "billing.payment_failed",
  "review_request.sent",
  "referral_intelligence.viewed",
  "one_action_card.clicked",
  "dashboard.viewed",
];

// ─── Debounce: max once per hour per org ───

const lastComputeTime = new Map<number, number>();

function shouldDebounce(orgId: number): boolean {
  const last = lastComputeTime.get(orgId);
  if (!last) return false;
  return Date.now() - last < 60 * 60 * 1000; // 1 hour
}

// ─── Engagement Score ───

/**
 * Compute a 0-100 engagement score from the last 30 days of behavioral events.
 * Persists to organizations.engagement_score.
 */
export async function getEngagementScore(orgId: number): Promise<number> {
  if (shouldDebounce(orgId)) {
    // Return cached value
    const org = await db("organizations")
      .where({ id: orgId })
      .select("engagement_score")
      .first();
    return org?.engagement_score ?? 0;
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const events = await db("behavioral_events")
    .where({ org_id: orgId })
    .where("created_at", ">=", thirtyDaysAgo)
    .select("event_type")
    .orderBy("created_at", "desc");

  let rawScore = 0;
  const eventCounts: Record<string, number> = {};

  for (const event of events) {
    const config = EVENT_WEIGHTS[event.event_type];
    if (!config) continue;

    const count = (eventCounts[event.event_type] || 0) + 1;
    eventCounts[event.event_type] = count;

    // One-time events only count once
    if (config.oneTime && count > 1) continue;

    // Capped events respect max
    if (config.max && count > config.max) continue;

    rawScore += config.weight;
  }

  // Normalize to 0-100
  const normalized = Math.min(100, Math.round((rawScore / MAX_RAW_SCORE) * 100));

  // Persist
  await db("organizations")
    .where({ id: orgId })
    .update({
      engagement_score: normalized,
      engagement_score_updated_at: new Date(),
    });

  lastComputeTime.set(orgId, Date.now());

  return normalized;
}

// ─── Most Significant Event ───

/**
 * Return the single most significant behavioral event from the last 7 days.
 * Priority order defined in EVENT_PRIORITY.
 * Used by: Purpose Agent weekly impact signal, Founder Mode Panel 1.
 */
export async function getMostSignificantEvent(orgId: number): Promise<string | null> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const events = await db("behavioral_events")
    .where({ org_id: orgId })
    .where("created_at", ">=", sevenDaysAgo)
    .select("event_type")
    .orderBy("created_at", "desc");

  if (events.length === 0) return null;

  const eventTypes = new Set(events.map((e: any) => e.event_type));

  // Return highest priority event that exists in the last 7 days
  for (const priorityEvent of EVENT_PRIORITY) {
    if (eventTypes.has(priorityEvent)) return priorityEvent;
  }

  // Fallback: most recent event type
  return events[0].event_type;
}

/**
 * Fire-and-forget engagement score update. Call after any behavioral event is logged.
 * Respects 1-hour debounce per org.
 */
export function updateEngagementScoreAsync(orgId: number | null): void {
  if (!orgId) return;
  getEngagementScore(orgId).catch((err) => {
    console.error(`[BehavioralIntel] Score update failed for org ${orgId}:`, err.message);
  });
}
