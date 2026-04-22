/**
 * Feature-flag resolver for the Freeform Concern Gate and its siblings.
 *
 * Consistent with the existing pattern (organizations.<flag>_enabled columns
 * + in-memory 60s cache in src/services/featureFlags.ts for global flags).
 * This file wraps the per-org column check with a graceful env-var override
 * so local tests and scripts can force-enable without a DB round-trip.
 */

import { db } from "../../database/connection";

const CACHE_TTL_MS = 60_000;
interface FlagCache {
  value: boolean;
  expires: number;
}
const flagCache = new Map<string, FlagCache>();

function cacheKey(flag: string, orgId?: number): string {
  return `${flag}:${orgId ?? "global"}`;
}

async function isOrgFlagEnabled(flag: string, orgId?: number): Promise<boolean> {
  const key = cacheKey(flag, orgId);
  const now = Date.now();
  const cached = flagCache.get(key);
  if (cached && cached.expires > now) return cached.value;

  let value = false;

  if (orgId != null) {
    try {
      const row = await db("organizations")
        .where({ id: orgId })
        .first(flag);
      value = Boolean(row?.[flag]);
    } catch {
      value = false;
    }
  }

  flagCache.set(key, { value, expires: now + CACHE_TTL_MS });
  return value;
}

/** Test hook — clears the in-memory cache. */
export function _resetFlagCache(): void {
  flagCache.clear();
}

function envFlagIsTrue(envVar: string): boolean {
  const v = process.env[envVar];
  if (!v) return false;
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
}

export async function isFreeformConcernGateEnabled(orgId?: number): Promise<boolean> {
  if (envFlagIsTrue("FREEFORM_CONCERN_GATE_ENABLED")) return true;
  return isOrgFlagEnabled("freeform_concern_gate_enabled", orgId);
}

export async function isRecognitionScoreEnabled(orgId?: number): Promise<boolean> {
  if (envFlagIsTrue("RECOGNITION_SCORE_ENABLED")) return true;
  return isOrgFlagEnabled("recognition_score_enabled", orgId);
}

export async function isDiscoverabilityBakeEnabled(orgId?: number): Promise<boolean> {
  if (envFlagIsTrue("DISCOVERABILITY_BAKE_ENABLED")) return true;
  return isOrgFlagEnabled("discoverability_bake_enabled", orgId);
}
