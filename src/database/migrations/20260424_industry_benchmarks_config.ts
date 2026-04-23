import type { Knex } from "knex";

/**
 * Card L — Economic Calc Extension Point.
 *
 * Replaces the compiled-in BENCHMARKS object in
 * src/services/economic/industryBenchmarks.ts with a DB-backed table.
 * Adding a vertical is now a row insert, not a code change.
 *
 * Columns:
 *   id                         serial PK
 *   vertical                   unique text key (e.g. "endodontics")
 *   avg_case_value_usd         integer, USD
 *   avg_monthly_new_customers  integer
 *   referral_dependency_pct    decimal 0.000–1.000
 *   source                     provenance note
 *   created_at                 timestamp default now
 *
 * Seeded with the 7 verticals + "unknown" sentinel, preserving the exact
 * values and source strings from the previous compiled benchmarks file.
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("industry_benchmarks_config");
  if (exists) return;

  await knex.schema.createTable("industry_benchmarks_config", (t) => {
    t.increments("id").primary();
    t.text("vertical").notNullable().unique();
    t.integer("avg_case_value_usd").notNullable();
    t.integer("avg_monthly_new_customers").notNullable();
    t.decimal("referral_dependency_pct", 4, 3).notNullable();
    t.text("source").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_industry_benchmarks_config_vertical ON industry_benchmarks_config(vertical)"
  );

  await knex("industry_benchmarks_config").insert([
    {
      vertical: "endodontics",
      avg_case_value_usd: 1800,
      avg_monthly_new_customers: 45,
      referral_dependency_pct: 0.85,
      source: "ADA endodontic specialty report, 3-year average",
    },
    {
      vertical: "orthodontics",
      avg_case_value_usd: 5000,
      avg_monthly_new_customers: 18,
      referral_dependency_pct: 0.55,
      source: "AAO practice economics survey, category average",
    },
    {
      vertical: "oral_surgery",
      avg_case_value_usd: 2400,
      avg_monthly_new_customers: 30,
      referral_dependency_pct: 0.9,
      source: "AAOMS category survey",
    },
    {
      vertical: "general_dentistry",
      avg_case_value_usd: 850,
      avg_monthly_new_customers: 35,
      referral_dependency_pct: 0.25,
      source: "ADA general dentistry survey",
    },
    {
      vertical: "physical_therapy",
      avg_case_value_usd: 1200,
      avg_monthly_new_customers: 25,
      referral_dependency_pct: 0.6,
      source: "APTA practice report",
    },
    {
      vertical: "chiropractic",
      avg_case_value_usd: 700,
      avg_monthly_new_customers: 20,
      referral_dependency_pct: 0.35,
      source: "ACA practice economics benchmark",
    },
    {
      vertical: "veterinary",
      avg_case_value_usd: 550,
      avg_monthly_new_customers: 40,
      referral_dependency_pct: 0.2,
      source: "AVMA practice benchmark",
    },
    {
      vertical: "unknown",
      avg_case_value_usd: 0,
      avg_monthly_new_customers: 0,
      referral_dependency_pct: 0,
      source: "No vertical known; defer to org data",
    },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("industry_benchmarks_config");
}
