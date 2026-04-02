/**
 * Config Store -- Editable business values, backed by system_config table.
 *
 * Every hardcoded business value that Corey should be able to change
 * from the dashboard lives here. Clean station, sharp knives.
 *
 * Pattern: getConfig("monthly_burn", 9500) reads from DB with fallback.
 * If the DB doesn't have it yet, the default is used and the value
 * works exactly as before. When Corey edits it in the UI, it's instant.
 *
 * Cache: 60-second in-memory TTL. Reads are fast. Writes bust the cache.
 */

import { db } from "../database/connection";

// ---- In-memory cache --------------------------------------------------------

interface CacheEntry {
  value: any;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 60_000; // 60 seconds

function getCached(key: string): any | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCache(key: string, value: any): void {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL });
}

// ---- Public API -------------------------------------------------------------

/**
 * Get a config value. Falls back to defaultValue if not in DB.
 * Cached for 60 seconds.
 */
export async function getConfig<T>(key: string, defaultValue: T): Promise<T> {
  // Check cache first
  const cached = getCached(key);
  if (cached !== undefined) return cached as T;

  try {
    const row = await db("system_config").where({ key }).first();
    if (row && row.value !== null && row.value !== undefined) {
      const val = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
      setCache(key, val);
      return val as T;
    }
  } catch (err: any) {
    console.warn(`[ConfigStore] Failed to read "${key}":`, err.message);
  }

  // Return default (don't cache defaults -- let DB writes take effect immediately)
  return defaultValue;
}

/**
 * Set a config value. Upserts into system_config and busts cache.
 */
export async function setConfig(key: string, value: any): Promise<void> {
  try {
    const existing = await db("system_config").where({ key }).first();
    if (existing) {
      await db("system_config").where({ key }).update({
        value: JSON.stringify(value),
        updated_at: new Date(),
      });
    } else {
      await db("system_config").insert({
        key,
        value: JSON.stringify(value),
        updated_at: new Date(),
      });
    }
    // Bust cache
    cache.delete(key);
  } catch (err: any) {
    console.error(`[ConfigStore] Failed to write "${key}":`, err.message);
    throw err;
  }
}

/**
 * Get all config values. Used by the admin UI to show everything.
 */
export async function getAllConfig(): Promise<Record<string, any>> {
  try {
    const rows = await db("system_config").orderBy("key");
    const result: Record<string, any> = {};
    for (const row of rows) {
      result[row.key] = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
    }
    return result;
  } catch (err: any) {
    console.warn("[ConfigStore] Failed to read all config:", err.message);
    return {};
  }
}

/**
 * Delete a config value. Returns to using the code default.
 */
export async function deleteConfig(key: string): Promise<void> {
  try {
    await db("system_config").where({ key }).del();
    cache.delete(key);
  } catch (err: any) {
    console.error(`[ConfigStore] Failed to delete "${key}":`, err.message);
  }
}

/**
 * Bust all cached config values. Used after bulk updates.
 */
export function bustCache(): void {
  cache.clear();
}

// ---- Config Key Registry ----------------------------------------------------
// Documents every config key, its default, and what it controls.
// This is the "menu" that the admin UI renders.

export interface ConfigDefinition {
  key: string;
  label: string;
  category: "financial" | "scoring" | "thresholds" | "marketing" | "operations";
  description: string;
  defaultValue: any;
  type: "number" | "string" | "json" | "boolean";
  unit?: string;
}

export const CONFIG_REGISTRY: ConfigDefinition[] = [
  // ---- Financial ----
  {
    key: "monthly_burn",
    label: "Monthly Burn Rate",
    category: "financial",
    description: "Fixed monthly operational costs. Used in runway and profitability calculations.",
    defaultValue: 9500,
    type: "number",
    unit: "$/month",
  },
  {
    key: "org_monthly_rates",
    label: "Per-Client Monthly Rates",
    category: "financial",
    description: "Contracted rate per org ID. Format: {\"5\": 2000, \"6\": 3500, ...}",
    defaultValue: { 5: 2000, 6: 3500, 8: 1500, 21: 0, 25: 5000, 34: 0, 39: 1500, 42: 0 },
    type: "json",
    unit: "$/month per org",
  },
  {
    key: "tier_pricing_dwy",
    label: "DWY Tier Price",
    category: "financial",
    description: "Monthly price for Do-With-You (Clarity) tier.",
    defaultValue: 997,
    type: "number",
    unit: "$/month",
  },
  {
    key: "tier_pricing_dfy",
    label: "DFY Tier Price",
    category: "financial",
    description: "Monthly price for Done-For-You (Clarity + Freedom) tier.",
    defaultValue: 2497,
    type: "number",
    unit: "$/month",
  },

  // ---- Scoring ----
  {
    key: "clarity_score_strong",
    label: "Clarity Score: Strong Threshold",
    category: "scoring",
    description: "Score >= this value = 'Strong first impression'",
    defaultValue: 80,
    type: "number",
  },
  {
    key: "clarity_score_solid",
    label: "Clarity Score: Solid Threshold",
    category: "scoring",
    description: "Score >= this value = 'Solid foundation'",
    defaultValue: 60,
    type: "number",
  },
  {
    key: "clarity_score_grow",
    label: "Clarity Score: Room to Grow Threshold",
    category: "scoring",
    description: "Score >= this value = 'Room to grow'. Below = 'Needs attention'",
    defaultValue: 40,
    type: "number",
  },

  // ---- Thresholds ----
  {
    key: "cs_stalled_onboarding_hours",
    label: "CS: Stalled Onboarding (hours)",
    category: "thresholds",
    description: "Hours before a stalled onboarding triggers a CS intervention.",
    defaultValue: 48,
    type: "number",
    unit: "hours",
  },
  {
    key: "cs_trial_expiry_warning_days",
    label: "CS: Trial Expiry Warning (days)",
    category: "thresholds",
    description: "Days before trial end to send a warning.",
    defaultValue: 7,
    type: "number",
    unit: "days",
  },
  {
    key: "health_red_no_login_days",
    label: "Health: Red (no login days)",
    category: "thresholds",
    description: "Days without login before org health goes red.",
    defaultValue: 14,
    type: "number",
    unit: "days",
  },
  {
    key: "health_amber_no_login_days",
    label: "Health: Amber (no login days)",
    category: "thresholds",
    description: "Days without login before org health goes amber.",
    defaultValue: 7,
    type: "number",
    unit: "days",
  },

  // ---- Marketing ----
  {
    key: "avg_case_value_default",
    label: "Default Average Case Value",
    category: "marketing",
    description: "Default per-patient case value for economic modeling.",
    defaultValue: 1200,
    type: "number",
    unit: "$",
  },
  {
    key: "referral_loss_per_month",
    label: "Monthly Referral Loss Estimate",
    category: "marketing",
    description: "Average referrals lost to competitors per month (used in outreach copy).",
    defaultValue: 4,
    type: "number",
    unit: "referrals",
  },
];
