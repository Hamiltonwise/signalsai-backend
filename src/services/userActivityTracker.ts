/**
 * User Activity Tracker -- Makes the System See Its Customers
 *
 * The behavioral_events table only captured agent-generated events.
 * User actions (login, dashboard view, feature usage) were invisible.
 * Churn detection, engagement scoring, and the Monday email all depend
 * on seeing what users actually do.
 *
 * This service provides a single function to record user activity events.
 * Debounced to prevent flooding (max once per event type per org per 5 min).
 */

import { db } from "../database/connection";

const recentEvents = new Map<string, number>();
const DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes

export async function trackUserActivity(
  orgId: number,
  eventType: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  // Debounce: skip if same event fired within 5 minutes for this org
  const key = `${orgId}:${eventType}`;
  const now = Date.now();
  const last = recentEvents.get(key);
  if (last && now - last < DEBOUNCE_MS) return;
  recentEvents.set(key, now);

  // Clean old entries periodically (prevent memory leak)
  if (recentEvents.size > 1000) {
    for (const [k, v] of recentEvents) {
      if (now - v > DEBOUNCE_MS * 2) recentEvents.delete(k);
    }
  }

  try {
    await db("behavioral_events").insert({
      id: db.raw("gen_random_uuid()"),
      org_id: orgId,
      event_type: eventType,
      properties: properties ? JSON.stringify(properties) : null,
      created_at: new Date(),
    });
  } catch {
    // Non-blocking: if behavioral_events table doesn't exist or insert fails, silently continue
  }
}
