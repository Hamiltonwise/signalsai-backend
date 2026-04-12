/**
 * Business Metrics -- Single Source of Truth
 *
 * EVERY calculation that produces a dollar figure, health status, or score
 * benchmark MUST live in this file. If it's not here, it's wrong.
 *
 * This file is enforced by preflight-check.sh: any ORG_MONTHLY_RATE
 * definition outside this file fails the build.
 */

import { db } from "../database/connection";

// ---- Per-Org Pricing (actual contracted rates) --------------------------------
// Update this map when pricing changes. It is the ONLY place pricing lives.

export const ORG_MONTHLY_RATE: Record<number, number> = {
  5: 2000,   // Garrison Orthodontics
  6: 3500,   // DentalEMR
  8: 1500,   // Artful Orthodontics
  21: 0,     // McPherson Endodontics (beta)
  25: 5000,  // Caswell Orthodontics (3 locations)
  34: 0,     // Alloro (team org)
  39: 1500,  // One Endodontics
  42: 0,     // Valley Endodontics (demo)
};

// Default burn rate -- overridden by system_config "monthly_burn" when set
export const MONTHLY_BURN_DEFAULT = 9500;

// Synchronous access for components that can't await (uses cached/default value)
export let MONTHLY_BURN = MONTHLY_BURN_DEFAULT;

// Call this at startup or when config changes to refresh the burn rate
export async function refreshBurnRate(): Promise<void> {
  try {
    const { getConfig } = await import("./configStore");
    MONTHLY_BURN = await getConfig("monthly_burn", MONTHLY_BURN_DEFAULT);
  } catch {
    // configStore not available (e.g., frontend import) -- keep default
  }
}

// ---- MRR Calculations ---------------------------------------------------------

export function getOrgMRR(orgId: number): number {
  return ORG_MONTHLY_RATE[orgId] ?? 0;
}

export function getTotalMRR(orgs: { id: number }[]): number {
  return orgs.reduce((sum, o) => sum + getOrgMRR(o.id), 0);
}

export interface MRRBreakdown {
  total: number;
  byOrg: Record<number, number>;
  burn: number;
  delta: number;
  isProfitable: boolean;
  payingCount: number;
}

export function getMRRBreakdown(orgs: { id: number }[]): MRRBreakdown {
  const byOrg: Record<number, number> = {};
  let total = 0;
  let payingCount = 0;

  for (const org of orgs) {
    const rate = getOrgMRR(org.id);
    byOrg[org.id] = rate;
    total += rate;
    if (rate > 0) payingCount++;
  }

  return {
    total,
    byOrg,
    burn: MONTHLY_BURN,
    delta: total - MONTHLY_BURN,
    isProfitable: total >= MONTHLY_BURN,
    payingCount,
  };
}

// ---- Database-backed MRR (for backend services) --------------------------------

export async function getMRRFromDB(): Promise<MRRBreakdown> {
  const orgs = await db("organizations")
    .where(function (this: any) {
      this.where("subscription_status", "active")
        .orWhereNotNull("subscription_tier");
    })
    .select("id");

  return getMRRBreakdown(orgs);
}

// ---- Per-Specialty Benchmarks --------------------------------------------------
// Derived from verticalProfiles.ts -- the single source of truth for all verticals.
// These maps are built at import time for backward compatibility with existing consumers.

import { buildReviewBenchmarksMap, buildCompetitiveRadiiMap } from "../config/verticalProfiles";

export const REVIEW_VOLUME_BENCHMARKS: Record<string, number> = buildReviewBenchmarksMap();
export const COMPETITIVE_RADII_MILES: Record<string, number> = buildCompetitiveRadiiMap();

// Score label thresholds (used by clarity scoring and checkup)
export function getScoreLabel(score: number): string {
  if (score >= 80) return "Strong Position";
  if (score >= 60) return "Building Momentum";
  return "Your Starting Point";
}
