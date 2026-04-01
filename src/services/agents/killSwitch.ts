/**
 * Agent Kill Switch -- Emergency Stop
 *
 * One-click emergency stop that halts ALL agent execution immediately.
 * Uses Redis for instant state propagation (no DB latency).
 *
 * When active: every agent checks isKillSwitchActive() before running.
 * If active, the agent logs "kill switch active, skipping" and returns.
 * Does NOT stop in-progress agents. Prevents new runs from starting.
 */

import { db } from "../../database/connection";

let redisClient: any = null;

const REDIS_KEY = "alloro:kill_switch";

/**
 * Lazily load Redis. If Redis is unavailable, fall back to in-memory state.
 */
async function getRedis(): Promise<any> {
  if (redisClient) return redisClient;
  try {
    const { getSharedRedis } = await import("../redis");
    redisClient = getSharedRedis();
    return redisClient;
  } catch {
    return null;
  }
}

// In-memory fallback when Redis is unavailable
let inMemoryState: {
  active: boolean;
  reason?: string;
  activatedAt?: string;
  activatedBy?: string;
} = { active: false };

/**
 * Activate the kill switch. All agents will stop starting new runs.
 */
export async function activateKillSwitch(
  reason: string,
  activatedBy: string
): Promise<void> {
  const state = {
    active: true,
    reason,
    activatedAt: new Date().toISOString(),
    activatedBy,
  };

  // Write to Redis (primary)
  const redis = await getRedis();
  if (redis) {
    try {
      await redis.set(REDIS_KEY, JSON.stringify(state));
    } catch (err: unknown) {
      console.error("[KillSwitch] Redis write failed, using in-memory fallback:", err instanceof Error ? err.message : err);
    }
  }

  // Always update in-memory fallback
  inMemoryState = state;

  // Log to behavioral_events
  try {
    await db("behavioral_events").insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "kill_switch.activated",
      org_id: null,
      properties: JSON.stringify({
        reason,
        activated_by: activatedBy,
        timestamp: state.activatedAt,
      }),
      created_at: new Date(),
    });
  } catch (err: unknown) {
    console.error("[KillSwitch] Failed to log activation:", err instanceof Error ? err.message : err);
  }

  console.log(`[KillSwitch] ACTIVATED by ${activatedBy}: ${reason}`);
}

/**
 * Deactivate the kill switch. Agents resume normal operation.
 */
export async function deactivateKillSwitch(): Promise<void> {
  const previousState = await isKillSwitchActive();

  // Clear Redis
  const redis = await getRedis();
  if (redis) {
    try {
      await redis.del(REDIS_KEY);
    } catch (err: unknown) {
      console.error("[KillSwitch] Redis delete failed:", err instanceof Error ? err.message : err);
    }
  }

  // Clear in-memory fallback
  inMemoryState = { active: false };

  // Log to behavioral_events
  try {
    await db("behavioral_events").insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "kill_switch.deactivated",
      org_id: null,
      properties: JSON.stringify({
        previous_reason: previousState.reason || null,
        previous_activated_by: previousState.activatedBy || null,
        deactivated_at: new Date().toISOString(),
      }),
      created_at: new Date(),
    });
  } catch (err: unknown) {
    console.error("[KillSwitch] Failed to log deactivation:", err instanceof Error ? err.message : err);
  }

  console.log("[KillSwitch] DEACTIVATED");
}

/**
 * Check if the kill switch is currently active.
 * Reads from Redis first, falls back to in-memory state.
 */
export async function isKillSwitchActive(): Promise<{
  active: boolean;
  reason?: string;
  activatedAt?: Date;
  activatedBy?: string;
}> {
  // Try Redis first
  const redis = await getRedis();
  if (redis) {
    try {
      const raw = await redis.get(REDIS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          active: true,
          reason: parsed.reason,
          activatedAt: parsed.activatedAt ? new Date(parsed.activatedAt) : undefined,
          activatedBy: parsed.activatedBy,
        };
      }
      // Redis says no kill switch
      return { active: false };
    } catch {
      // Redis read failed, fall through to in-memory
    }
  }

  // Fallback to in-memory state
  if (inMemoryState.active) {
    return {
      active: true,
      reason: inMemoryState.reason,
      activatedAt: inMemoryState.activatedAt ? new Date(inMemoryState.activatedAt) : undefined,
      activatedBy: inMemoryState.activatedBy,
    };
  }

  return { active: false };
}

/**
 * Synchronous check for use in hot paths. Uses cached in-memory state.
 * For the most accurate check, use isKillSwitchActive() (async).
 */
export function isKillSwitchActiveSync(): boolean {
  return inMemoryState.active;
}
