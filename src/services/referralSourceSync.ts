/**
 * Referral Source Sync -- The Pipe Between PMS Data and Intelligence
 *
 * PMS uploads contain rich referral data (source names, counts, production).
 * This service populates the referral_sources table that the Monday email,
 * GP discovery, drift detection, and dashboard all read from.
 *
 * Called after PMS upload (processFileUpload) and on PMS job approval.
 * Also called by the migration that backfills from existing PMS data.
 */

import { db } from "../database/connection";

export async function syncReferralSourcesFromPmsJob(
  orgId: number,
  rawData: Record<string, string>[],
): Promise<{ synced: number; skipped: number }> {
  const hasTable = await db.schema.hasTable("referral_sources");
  if (!hasTable) return { synced: 0, skipped: 0 };

  if (!Array.isArray(rawData) || rawData.length === 0) return { synced: 0, skipped: 0 };

  // Aggregate referral sources
  const sources = new Map<string, {
    count: number;
    production: number;
    lastDate: string | null;
    type: string;
    months: Record<string, { count: number; production: number }>;
  }>();

  for (const row of rawData) {
    const name = (
      row["Referral Source"] || row["referral_source"] ||
      row["Source"] || row["source"] || row["Referred By"] ||
      row["referred_by"] || ""
    ).trim();

    if (!name) continue;

    const production = parseFloat(
      String(row["Production"] || row["production"] || row["Amount"] || row["Fee"] || "0")
        .replace(/[$,]/g, "")
    ) || 0;

    const refs = parseInt(String(row["Number of Referrals"] || row["referral_count"] || "1")) || 1;

    const dateStr = row["Date"] || row["date"] || row["Appointment Date"] || null;
    const month = dateStr ? dateStr.substring(0, 7) : "unknown";

    const nameLower = name.toLowerCase();
    const isSelf = nameLower.includes("self") || nameLower.includes("direct") ||
      nameLower.includes("google") || nameLower.includes("yelp") ||
      nameLower.includes("website") || nameLower.includes("internet");

    if (!sources.has(name)) {
      sources.set(name, { count: 0, production: 0, lastDate: null, type: isSelf ? "self" : "doctor", months: {} });
    }
    const src = sources.get(name)!;
    src.count += refs;
    src.production += production;
    if (dateStr && (!src.lastDate || dateStr > src.lastDate)) src.lastDate = dateStr;
    if (!src.months[month]) src.months[month] = { count: 0, production: 0 };
    src.months[month].count += refs;
    src.months[month].production += production;
  }

  let synced = 0;
  let skipped = 0;

  for (const [name, data] of sources) {
    const monthKeys = Object.keys(data.months).filter(m => m !== "unknown").sort();
    const totalMonths = monthKeys.length || 1;
    const monthlyAvg = data.count / totalMonths;

    const lastMonth = monthKeys[monthKeys.length - 1];
    const recentCount = lastMonth ? (data.months[lastMonth]?.count || 0) : 0;

    const prior3 = monthKeys.slice(-4, -1);
    const prior3Total = prior3.reduce((sum, m) => sum + (data.months[m]?.count || 0), 0);
    const prior3Avg = prior3.length > 0 ? prior3Total / prior3.length : monthlyAvg;

    try {
      await db("referral_sources")
        .insert({
          organization_id: orgId,
          name,
          gp_name: name,
          referral_count: data.count,
          total_referrals: data.count,
          total_production: data.production,
          recent_referral_count: recentCount,
          monthly_average: Math.round(monthlyAvg * 10) / 10,
          prior_3_month_avg: Math.round(prior3Avg * 10) / 10,
          last_referral_date: data.lastDate ? new Date(data.lastDate) : null,
          source_type: data.type,
          monthly_breakdown: JSON.stringify(data.months),
        })
        .onConflict(["organization_id", "name"])
        .merge();
      synced++;
    } catch {
      skipped++;
    }
  }

  console.log(`[ReferralSourceSync] Org ${orgId}: synced ${synced}, skipped ${skipped}`);
  return { synced, skipped };
}
