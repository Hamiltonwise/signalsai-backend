/**
 * Create referral_sources table and populate from PMS data
 *
 * This table was referenced by 26 files but never created. The Monday email,
 * GP discovery, dashboard context, one action card, and drift detection all
 * query it. Every query guards with hasTable() checks and silently returns
 * nothing when the table doesn't exist.
 *
 * The PMS preprocessor already computes referral summaries locally
 * (response_log has monthly breakdowns with source names, counts, and
 * production values). This migration creates the table and populates it
 * from existing pms_jobs data.
 */

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("referral_sources");
  if (!exists) {
    await knex.schema.createTable("referral_sources", (table) => {
      table.increments("id").primary();
      table.integer("organization_id").notNullable().references("id").inTable("organizations");
      table.string("name").notNullable(); // Display name (e.g. "Heart of Texas Dentistry")
      table.string("gp_name").nullable(); // Standardized GP name for matching
      table.string("gp_practice").nullable(); // Practice name if different
      table.string("npi").nullable(); // NPI number for verified GPs
      table.integer("referral_count").defaultTo(0); // Total referrals all time
      table.integer("total_referrals").defaultTo(0); // Alias for compatibility
      table.decimal("total_production", 12, 2).defaultTo(0); // Total $ production
      table.integer("recent_referral_count").defaultTo(0); // Last 30 days
      table.decimal("prior_3_month_avg", 8, 2).defaultTo(0); // For drift detection
      table.decimal("monthly_average", 8, 2).defaultTo(0);
      table.timestamp("last_referral_date").nullable();
      table.string("source_type").defaultTo("doctor"); // doctor, self, insurance, web, unknown
      table.timestamp("surprise_catch_dismissed_at").nullable(); // Drift detection
      table.timestamp("gp_drift_dismissed_at").nullable();
      table.jsonb("monthly_breakdown").nullable(); // Per-month data for trend analysis
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());

      table.index(["organization_id"]);
      table.unique(["organization_id", "name"]);
    });
  }

  // Populate from existing PMS data
  const approvedJobs = await knex("pms_jobs")
    .whereNotNull("organization_id")
    .whereNotNull("raw_input_data")
    .whereIn("status", ["approved", "completed", "pending_retry"])
    .select("id", "organization_id", "raw_input_data", "response_log");

  for (const job of approvedJobs) {
    const orgId = job.organization_id;
    const rawData: Record<string, string>[] = typeof job.raw_input_data === "string"
      ? JSON.parse(job.raw_input_data)
      : job.raw_input_data || [];

    if (!Array.isArray(rawData) || rawData.length === 0) continue;

    // Aggregate referral sources from raw PMS data
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
        row["referred_by"] || "Unknown"
      ).trim();

      if (!name || name === "Unknown") continue;

      const production = parseFloat(
        String(row["Production"] || row["production"] || row["Amount"] || row["Fee"] || "0")
          .replace(/[$,]/g, "")
      ) || 0;

      const refs = parseInt(String(row["Number of Referrals"] || row["referral_count"] || "1")) || 1;

      const dateStr = row["Date"] || row["date"] || row["Appointment Date"] || null;
      const month = dateStr ? dateStr.substring(0, 7) : "unknown"; // YYYY-MM

      // Classify source type
      const nameLower = name.toLowerCase();
      const isSelf = nameLower.includes("self") || nameLower.includes("direct") ||
        nameLower.includes("google") || nameLower.includes("yelp") ||
        nameLower.includes("website") || nameLower.includes("internet");
      const type = isSelf ? "self" : "doctor";

      if (!sources.has(name)) {
        sources.set(name, { count: 0, production: 0, lastDate: null, type, months: {} });
      }
      const src = sources.get(name)!;
      src.count += refs;
      src.production += production;
      if (dateStr && (!src.lastDate || dateStr > src.lastDate)) src.lastDate = dateStr;
      if (!src.months[month]) src.months[month] = { count: 0, production: 0 };
      src.months[month].count += refs;
      src.months[month].production += production;
    }

    // Write to referral_sources
    for (const [name, data] of sources) {
      const monthKeys = Object.keys(data.months).filter(m => m !== "unknown").sort();
      const totalMonths = monthKeys.length || 1;
      const monthlyAvg = data.count / totalMonths;

      // Recent = last 30 days worth of data (approximate: last month in data)
      const lastMonth = monthKeys[monthKeys.length - 1];
      const recentCount = lastMonth ? (data.months[lastMonth]?.count || 0) : 0;

      // Prior 3-month average (for drift detection)
      const prior3 = monthKeys.slice(-4, -1); // 3 months before the most recent
      const prior3Total = prior3.reduce((sum, m) => sum + (data.months[m]?.count || 0), 0);
      const prior3Avg = prior3.length > 0 ? prior3Total / prior3.length : monthlyAvg;

      try {
        await knex("referral_sources")
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
      } catch (insertErr: any) {
        // Skip duplicates silently
        if (!insertErr.message?.includes("duplicate")) {
          console.error(`[ReferralSources] Failed to insert ${name} for org ${orgId}:`, insertErr.message);
        }
      }
    }

    console.log(`[ReferralSources] Populated ${sources.size} sources for org ${orgId} from PMS job ${job.id}`);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("referral_sources");
}
