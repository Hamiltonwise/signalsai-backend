/**
 * Follow-up to 20260424000004_org39_rollup_and_cancel_dups: that migration's
 * idempotency guard (skip if any rows exist) ran against a referral_sources
 * table that had been populated by the legacy syncReferralSourcesFromPmsJob.
 * Legacy sync counts raw rows, not unique patients -- so total_referrals for
 * org 39 came out to 436 (line items) instead of ~108 (unique patients).
 *
 * This migration deletes referral_sources for org 39 and re-runs the
 * preprocessor-based sync so Saif sees unique-patient counts on Tuesday.
 *
 * Idempotent: if any source already has line-item-style monthly_breakdown
 * counts (sum > 200 typical of pre-dedup data), reset and re-sync. After
 * a successful re-sync, total_referrals for the org should be close to the
 * unique-patient count from preprocessPmsData.
 */

import { Knex } from "knex";
import { preprocessPmsData } from "../../controllers/pms/pms-services/pms-preprocessor.service";

const ORG_ID = 39;
const SOURCE_JOB_ID = 125;

const DIGITAL_KEYWORDS = [
  "google", "yelp", "facebook", "instagram", "angi", "homeadvisor",
  "thumbtack", "nextdoor", "website", "internet", "online", "seo", "ppc",
];

function classifySourceType(name: string): "digital" | "self" | "partner" {
  const lower = name.toLowerCase();
  if (DIGITAL_KEYWORDS.some((k) => lower.includes(k))) return "digital";
  if (lower.includes("self") || lower.includes("direct") || lower.includes("walk-in") || lower.includes("walkin")) return "self";
  return "partner";
}

export async function up(knex: Knex): Promise<void> {
  const job = await knex("pms_jobs").where({ id: SOURCE_JOB_ID }).first();
  if (!job) {
    console.warn(`[org39-resync] pms_jobs#${SOURCE_JOB_ID} not found; aborting`);
    return;
  }
  if (!job.raw_input_data) {
    console.warn(`[org39-resync] pms_jobs#${SOURCE_JOB_ID} has no raw_input_data; aborting`);
    return;
  }

  const raw = typeof job.raw_input_data === "string"
    ? JSON.parse(job.raw_input_data)
    : job.raw_input_data;
  const rows = Array.isArray(raw) ? raw : [];
  console.log(`[org39-resync] processing ${rows.length} raw rows from pms_jobs#${SOURCE_JOB_ID}`);

  let preprocessed;
  try {
    preprocessed = preprocessPmsData(rows);
  } catch (err) {
    console.error(`[org39-resync] preprocessPmsData failed:`, err instanceof Error ? err.message : err);
    return;
  }

  console.log(`[org39-resync] preprocessed: ${preprocessed.stats.uniquePatients} unique patients, ${preprocessed.stats.uniqueSources} sources, $${preprocessed.stats.totalRevenue}`);

  // Idempotency: only reset if existing rows look line-item-style. We compare
  // current sum(total_referrals) against the unique-patient count we just
  // computed; if existing is materially higher, the data is line-count and
  // needs replacement. Otherwise leave it alone.
  const before = await knex("referral_sources")
    .where({ organization_id: ORG_ID })
    .select(
      knex.raw("count(*)::int as row_count"),
      knex.raw("coalesce(sum(total_referrals), 0)::int as sum_total_referrals"),
    )
    .first();
  const existingTotal = Number(before?.sum_total_referrals ?? 0);
  const targetTotal = preprocessed.referralSummary
    .filter((s) => s.name !== "Self / Direct" && s.name !== "Unknown")
    .reduce((sum, s) => sum + s.uniquePatients, 0);

  if (existingTotal > 0 && existingTotal <= targetTotal * 1.1) {
    console.log(`[org39-resync] existing sum (${existingTotal}) is within 10% of target (${targetTotal}); skipping reset`);
    return;
  }

  console.log(`[org39-resync] before reset: ${JSON.stringify(before)}, target sum=${targetTotal}`);

  await knex.transaction(async (trx) => {
    const deleted = await trx("referral_sources").where({ organization_id: ORG_ID }).del();
    console.log(`[org39-resync] deleted ${deleted} existing rows for org ${ORG_ID}`);

    let synced = 0;
    let skipped = 0;

    for (const src of preprocessed.referralSummary) {
      if (src.name === "Self / Direct" || src.name === "Unknown" || !src.name.trim()) {
        skipped++;
        continue;
      }

      const monthly: Record<string, { count: number; production: number }> = {};
      let lastDate: string | null = null;
      for (const detail of src.details) {
        const dateStr = (detail.date || "").trim();
        if (!dateStr) continue;
        const month = dateStr.slice(0, 7);
        if (!monthly[month]) monthly[month] = { count: 0, production: 0 };
        monthly[month].count += 1;
        monthly[month].production += detail.revenue || 0;
        if (!lastDate || dateStr > lastDate) lastDate = dateStr;
      }

      const monthKeys = Object.keys(monthly).filter((m) => m.length > 0).sort();
      const monthsCount = monthKeys.length || 1;
      const monthlyAvg = src.uniquePatients / monthsCount;
      const lastMonth = monthKeys[monthKeys.length - 1];
      const recentCount = lastMonth ? monthly[lastMonth].count : 0;
      const prior3 = monthKeys.slice(-4, -1);
      const prior3Total = prior3.reduce((sum, m) => sum + (monthly[m]?.count || 0), 0);
      const prior3Avg = prior3.length > 0 ? prior3Total / prior3.length : monthlyAvg;

      let lastReferralDate: Date | null = null;
      if (lastDate) {
        const d = new Date(lastDate.length === 7 ? `${lastDate}-01` : lastDate);
        if (!isNaN(d.getTime())) lastReferralDate = d;
      }

      try {
        await trx("referral_sources").insert({
          organization_id: ORG_ID,
          name: src.name,
          gp_name: src.name,
          referral_count: src.uniquePatients,
          total_referrals: src.uniquePatients,
          total_production: src.totalRevenue,
          recent_referral_count: recentCount,
          monthly_average: Math.round(monthlyAvg * 10) / 10,
          prior_3_month_avg: Math.round(prior3Avg * 10) / 10,
          last_referral_date: lastReferralDate,
          source_type: classifySourceType(src.name),
          monthly_breakdown: JSON.stringify(monthly),
        });
        synced++;
      } catch (err) {
        console.error(`[org39-resync] insert failed for "${src.name}":`, err instanceof Error ? err.message : err);
        skipped++;
      }
    }

    console.log(`[org39-resync] synced ${synced} sources, skipped ${skipped}`);
  });

  const after = await knex("referral_sources")
    .where({ organization_id: ORG_ID })
    .select(
      knex.raw("count(*)::int as row_count"),
      knex.raw("coalesce(sum(total_referrals), 0)::int as sum_total_referrals"),
      knex.raw("coalesce(sum(total_production), 0)::float as sum_total_production"),
    )
    .first();
  console.log(`[org39-resync] VERIFY: referral_sources for org ${ORG_ID} -> ${JSON.stringify(after)}`);
}

export async function down(_knex: Knex): Promise<void> {
  // Data fix; do not auto-revert.
}
