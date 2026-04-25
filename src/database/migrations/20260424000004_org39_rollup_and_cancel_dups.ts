/**
 * One-shot data fix for One Endo (org 39) ahead of Saif's review on 2026-04-28:
 *
 *   1. pms_jobs#125 has 436 raw rows but referral_sources has zero rows for
 *      org 39 -- syncReferralSourcesFromPmsJob never ran for that job.
 *      This migration populates referral_sources from job 125's raw data,
 *      using preprocessPmsData so total_referrals reflects unique patient
 *      counts (not raw row counts).
 *
 *   2. pms_jobs 127/128/129/130 are duplicate re-uploads stuck at status
 *      'pending'. Cancel them before they create duplicate source rows on
 *      future processing.
 *
 * Idempotent: skips the sync if referral_sources already has rows for org 39.
 * Idempotent: only cancels jobs that are still 'pending' and in the id list.
 */

import { Knex } from "knex";
import { preprocessPmsData } from "../../controllers/pms/pms-services/pms-preprocessor.service";

const ORG_ID = 39;
const SOURCE_JOB_ID = 125;
const DUPLICATE_JOB_IDS = [127, 128, 129, 130];

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
  // ============================================================
  // Step 1: Sync referral_sources for org 39 from job 125
  // ============================================================
  const existing = await knex("referral_sources")
    .where({ organization_id: ORG_ID })
    .count("* as c")
    .first();
  const existingCount = Number(existing?.c ?? 0);

  if (existingCount > 0) {
    console.log(`[org39-rollup] referral_sources already has ${existingCount} rows for org ${ORG_ID}, skipping sync`);
  } else {
    const job = await knex("pms_jobs").where({ id: SOURCE_JOB_ID }).first();
    if (!job) {
      console.warn(`[org39-rollup] pms_jobs#${SOURCE_JOB_ID} not found, skipping sync`);
    } else if (!job.raw_input_data) {
      console.warn(`[org39-rollup] pms_jobs#${SOURCE_JOB_ID} has no raw_input_data, skipping sync`);
    } else {
      const raw = typeof job.raw_input_data === "string"
        ? JSON.parse(job.raw_input_data)
        : job.raw_input_data;
      const rows = Array.isArray(raw) ? raw : [];
      console.log(`[org39-rollup] processing ${rows.length} raw rows from pms_jobs#${SOURCE_JOB_ID}`);

      let preprocessed;
      try {
        preprocessed = preprocessPmsData(rows);
      } catch (err) {
        console.error(`[org39-rollup] preprocessPmsData failed:`, err instanceof Error ? err.message : err);
        return;
      }

      console.log(`[org39-rollup] preprocessed: ${preprocessed.stats.uniquePatients} unique patients, ${preprocessed.stats.uniqueSources} sources, $${preprocessed.stats.totalRevenue} revenue`);

      let synced = 0;
      let skipped = 0;

      for (const src of preprocessed.referralSummary) {
        // Skip non-doctor sources -- the dashboard treats Self/Direct separately
        if (src.name === "Self / Direct" || src.name === "Unknown" || !src.name.trim()) {
          skipped++;
          continue;
        }

        // Build monthly_breakdown from line-item details, plus track lastDate
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

        // Best-effort date parsing -- preprocessor leaves YYYY-MM-DD and YYYY-MM forms; otherwise null.
        let lastReferralDate: Date | null = null;
        if (lastDate) {
          const d = new Date(lastDate.length === 7 ? `${lastDate}-01` : lastDate);
          if (!isNaN(d.getTime())) lastReferralDate = d;
        }

        try {
          await knex("referral_sources")
            .insert({
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
            })
            .onConflict(["organization_id", "name"])
            .merge();
          synced++;
        } catch (err) {
          console.error(`[org39-rollup] insert failed for source "${src.name}":`, err instanceof Error ? err.message : err);
          skipped++;
        }
      }

      console.log(`[org39-rollup] synced ${synced} sources, skipped ${skipped}`);
    }
  }

  // ============================================================
  // Step 2: Cancel duplicate pending jobs
  // ============================================================
  const cancelled = await knex("pms_jobs")
    .whereIn("id", DUPLICATE_JOB_IDS)
    .where("status", "pending")
    .update({ status: "cancelled" });
  console.log(`[org39-rollup] cancelled ${cancelled} duplicate pending jobs (of candidates ${DUPLICATE_JOB_IDS.join(", ")})`);

  // ============================================================
  // Verification: print final state for the deploy log
  // ============================================================
  const final = await knex("referral_sources")
    .where({ organization_id: ORG_ID })
    .select(
      knex.raw("count(*)::int as row_count"),
      knex.raw("coalesce(sum(total_referrals), 0)::int as sum_total_referrals"),
      knex.raw("coalesce(sum(total_production), 0)::float as sum_total_production"),
    )
    .first();
  console.log(`[org39-rollup] VERIFY: referral_sources for org ${ORG_ID} -> ${JSON.stringify(final)}`);
}

export async function down(_knex: Knex): Promise<void> {
  // Data fix is one-shot; do not auto-revert. If the sync needs to be re-run,
  // delete the referral_sources rows for org 39 manually and re-run the
  // migration after rolling back its row in knex_migrations.
}
