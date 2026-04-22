/**
 * Per-practice feature flag resolvers for the Run 4 surfaces. Matches the
 * existing pattern in src/services/rubric/gateFlag.ts: per-org column on
 * organizations, 60s in-memory cache, env-var fast-on for tests + scripts.
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
      const row = await db("organizations").where({ id: orgId }).first(flag);
      value = Boolean(row?.[flag]);
    } catch {
      value = false;
    }
  }
  flagCache.set(key, { value, expires: now + CACHE_TTL_MS });
  return value;
}

export function _resetRewriteFlagCache(): void {
  flagCache.clear();
}

function envFlagIsTrue(envVar: string): boolean {
  const v = process.env[envVar];
  if (!v) return false;
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
}

export async function isCopyRewriteEnabled(orgId?: number): Promise<boolean> {
  if (envFlagIsTrue("COPY_REWRITE_ENABLED")) return true;
  return isOrgFlagEnabled("copy_rewrite_enabled", orgId);
}

export async function isMaterialEventAlertsEnabled(orgId?: number): Promise<boolean> {
  if (envFlagIsTrue("MATERIAL_EVENT_ALERTS_ENABLED")) return true;
  return isOrgFlagEnabled("material_event_alerts_enabled", orgId);
}

export async function isUpgradeExistingEnabled(orgId?: number): Promise<boolean> {
  if (envFlagIsTrue("UPGRADE_EXISTING_ENABLED")) return true;
  return isOrgFlagEnabled("upgrade_existing_enabled", orgId);
}
