/**
 * Market Intelligence Aggregator -- WO-MARKET-INTELLIGENCE
 *
 * Cross-client insights no individual client can see.
 * Powers "THE PATTERN" section of the Weekly Digest Agent.
 *
 * Used by: Weekly Digest Agent, Intelligence Agent, Founder Mode Panel 1
 */

import { db } from "../database/connection";

// ─── Types ───

export interface MarketPattern {
  pattern_type: "regional_ranking_pressure" | "review_velocity_gap" | "gp_drift_clustering" | "conversion_signal";
  description: string;
  affected_org_count: number;
  economic_implication: string;
}

// ─── Pattern 1: Regional Ranking Pressure ───

/**
 * 3+ practices in same city lost ranking position this week.
 */
async function detectRegionalRankingPressure(): Promise<MarketPattern[]> {
  const hasTable = await db.schema.hasTable("weekly_ranking_snapshots");
  if (!hasTable) return [];

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Get this week's snapshots with position decline
  const snapshots = await db("weekly_ranking_snapshots as current")
    .join("weekly_ranking_snapshots as prev", function () {
      this.on("current.org_id", "=", "prev.org_id")
        .andOn(db.raw("prev.week_start < current.week_start"));
    })
    .join("organizations as o", "current.org_id", "o.id")
    .where("current.created_at", ">=", sevenDaysAgo)
    .whereNotNull("current.position")
    .whereNotNull("prev.position")
    .whereRaw("current.position > prev.position") // higher number = worse ranking
    .select(
      "current.org_id",
      "o.operational_jurisdiction",
      "current.position as current_pos",
      "prev.position as prev_pos",
    )
    .orderBy("prev.week_start", "desc")
    .groupBy("current.org_id", "o.operational_jurisdiction", "current.position", "prev.position");

  // Group by city (extract first part of operational_jurisdiction)
  const cityGroups: Record<string, number[]> = {};
  for (const snap of snapshots) {
    const city = snap.operational_jurisdiction
      ? snap.operational_jurisdiction.split(",")[0].trim()
      : "Unknown";
    if (!cityGroups[city]) cityGroups[city] = [];
    if (!cityGroups[city].includes(snap.org_id)) {
      cityGroups[city].push(snap.org_id);
    }
  }

  const patterns: MarketPattern[] = [];
  for (const [city, orgIds] of Object.entries(cityGroups)) {
    if (orgIds.length >= 3) {
      patterns.push({
        pattern_type: "regional_ranking_pressure",
        description: `${orgIds.length} practices in ${city} lost ranking position this week`,
        affected_org_count: orgIds.length,
        economic_implication: `Competitive pressure increasing in ${city}. Clients in this market need proactive review velocity guidance.`,
      });
    }
  }

  return patterns;
}

// ─── Pattern 2: Review Velocity Gap Widening ───

/**
 * Competitor review velocity > client review velocity across 3+ orgs, widening 10%+.
 */
async function detectReviewVelocityGap(): Promise<MarketPattern[]> {
  const orgs = await db("organizations")
    .whereNotNull("review_velocity_per_week")
    .whereNotNull("competitor_review_velocity_per_week")
    .where("competitor_review_velocity_per_week", ">", 0)
    .select(
      "id",
      "organization_type",
      "review_velocity_per_week",
      "competitor_review_velocity_per_week",
    );

  // Find orgs where competitor velocity exceeds client velocity by 10%+
  const gapOrgs = orgs.filter((o) => {
    const clientVel = Number(o.review_velocity_per_week) || 0;
    const compVel = Number(o.competitor_review_velocity_per_week) || 0;
    if (compVel <= 0) return false;
    return compVel > clientVel * 1.1;
  });

  if (gapOrgs.length < 3) return [];

  // Group by specialty
  const specialtyGroups: Record<string, typeof gapOrgs> = {};
  for (const org of gapOrgs) {
    const specialty = org.organization_type || "business";
    if (!specialtyGroups[specialty]) specialtyGroups[specialty] = [];
    specialtyGroups[specialty].push(org);
  }

  const patterns: MarketPattern[] = [];
  for (const [specialty, group] of Object.entries(specialtyGroups)) {
    if (group.length >= 3) {
      const avgCompVel = group.reduce((s, o) => s + Number(o.competitor_review_velocity_per_week), 0) / group.length;
      patterns.push({
        pattern_type: "review_velocity_gap",
        description: `Top competitors in ${specialty} are adding reviews faster than clients -- ${avgCompVel.toFixed(1)} reviews/week average`,
        affected_org_count: group.length,
        economic_implication: `${group.length} clients falling behind on review velocity. Each unmatched review represents approximately $45 in lost annual revenue.`,
      });
    }
  }

  return patterns;
}

// ─── Pattern 3: GP Drift Clustering ───

/**
 * 2+ orgs with new gone_dark events in same week.
 */
async function detectGPDriftClustering(): Promise<MarketPattern[]> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const goneDarkEvents = await db("behavioral_events")
    .where({ event_type: "gp.gone_dark" })
    .where("created_at", ">=", sevenDaysAgo)
    .select("org_id", "created_at");

  const uniqueOrgs = new Set(goneDarkEvents.map((e: any) => e.org_id));

  if (uniqueOrgs.size < 2) return [];

  const currentMonth = new Date().toLocaleString("en-US", { month: "long" });

  return [{
    pattern_type: "gp_drift_clustering",
    description: `Multiple practices seeing GP drift in ${currentMonth}`,
    affected_org_count: uniqueOrgs.size,
    economic_implication: `Seasonal pattern -- referrals typically drop in ${currentMonth}. Alert clients proactively before they notice the silence.`,
  }];
}

// ─── Pattern 4: Conversion Signal ───

/**
 * Compare 30-day conversion by PMS data upload status.
 */
async function detectConversionSignal(): Promise<MarketPattern[]> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Orgs created in last 30 days
  const recentOrgs = await db("organizations")
    .where("created_at", ">=", thirtyDaysAgo)
    .select("id", "subscription_status");

  if (recentOrgs.length < 5) return []; // need enough data

  // Check which orgs have PMS upload events
  const pmsUploadOrgs = await db("behavioral_events")
    .whereIn("event_type", ["pms.upload_completed", "clearpath.build_triggered"])
    .whereIn("org_id", recentOrgs.map((o) => o.id))
    .distinct("org_id")
    .select("org_id");

  const pmsOrgIds = new Set(pmsUploadOrgs.map((r: any) => r.org_id));

  const withPMS = recentOrgs.filter((o) => pmsOrgIds.has(o.id));
  const withoutPMS = recentOrgs.filter((o) => !pmsOrgIds.has(o.id));

  if (withPMS.length === 0 || withoutPMS.length === 0) return [];

  const pmsConversion = withPMS.filter((o) => o.subscription_status === "active").length / withPMS.length;
  const noPmsConversion = withoutPMS.filter((o) => o.subscription_status === "active").length / withoutPMS.length;

  if (noPmsConversion <= 0 || pmsConversion <= noPmsConversion) return [];

  const multiplier = Math.round((pmsConversion / noPmsConversion) * 10) / 10;

  if (multiplier < 1.5) return []; // not significant enough

  return [{
    pattern_type: "conversion_signal",
    description: `Practices that uploaded PMS data converted at ${multiplier}x the rate of those who didn't`,
    affected_org_count: recentOrgs.length,
    economic_implication: `PMS upload is the strongest conversion predictor. Trial accounts without PMS data should receive proactive outreach to upload.`,
  }];
}

// ─── Main Export ───

/**
 * Get all market patterns detected in the last 7 days.
 * Returns array sorted by affected_org_count descending.
 */
export async function getMarketPatterns(): Promise<MarketPattern[]> {
  const [ranking, velocity, drift, conversion] = await Promise.all([
    detectRegionalRankingPressure().catch(() => [] as MarketPattern[]),
    detectReviewVelocityGap().catch(() => [] as MarketPattern[]),
    detectGPDriftClustering().catch(() => [] as MarketPattern[]),
    detectConversionSignal().catch(() => [] as MarketPattern[]),
  ]);

  const all = [...ranking, ...velocity, ...drift, ...conversion];
  all.sort((a, b) => b.affected_org_count - a.affected_org_count);

  console.log(`[MarketIntel] Detected ${all.length} patterns: ${all.map((p) => p.pattern_type).join(", ") || "none"}`);

  return all;
}
