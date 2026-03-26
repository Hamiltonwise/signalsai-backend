import { db } from "../database/connection";

/**
 * Feature Flag Service
 *
 * Simple flag check: global enable OR per-org enable.
 * Cached in memory for 60 seconds to avoid DB hits on every request.
 */

interface FeatureFlag {
  flag_name: string;
  is_enabled: boolean;
  enabled_for_orgs: number[];
}

let cache: Map<string, FeatureFlag> = new Map();
let cacheExpiry = 0;
const CACHE_TTL = 60_000; // 60 seconds

async function loadFlags(): Promise<void> {
  if (Date.now() < cacheExpiry && cache.size > 0) return;

  try {
    const rows = await db("feature_flags").select("flag_name", "is_enabled", "enabled_for_orgs");
    cache = new Map();
    for (const row of rows) {
      let enabledOrgs: number[] = [];
      if (row.enabled_for_orgs) {
        const parsed = typeof row.enabled_for_orgs === "string"
          ? JSON.parse(row.enabled_for_orgs)
          : row.enabled_for_orgs;
        if (Array.isArray(parsed)) enabledOrgs = parsed;
      }
      cache.set(row.flag_name, {
        flag_name: row.flag_name,
        is_enabled: row.is_enabled,
        enabled_for_orgs: enabledOrgs,
      });
    }
    cacheExpiry = Date.now() + CACHE_TTL;
  } catch (err: any) {
    console.warn("[FEATURE-FLAGS] Failed to load flags:", err.message);
    // On error, keep stale cache rather than blocking
  }
}

/**
 * Check if a feature flag is enabled.
 * Returns true if:
 *   - Global flag is_enabled = true, OR
 *   - orgId is in the enabled_for_orgs array
 *
 * Returns false if flag doesn't exist (safe default).
 */
export async function isEnabled(flagName: string, orgId?: number): Promise<boolean> {
  await loadFlags();

  const flag = cache.get(flagName);
  if (!flag) return false;

  if (flag.is_enabled) return true;

  if (orgId && flag.enabled_for_orgs.includes(orgId)) return true;

  return false;
}

/**
 * Force-refresh the cache (used after admin updates a flag).
 */
export function invalidateCache(): void {
  cacheExpiry = 0;
}
