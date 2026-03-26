/**
 * Migration: Vocabulary Config System
 *
 * DB-driven per-account vocabulary. Static defaults for 9 verticals.
 * Org-level overrides merge on top. Adding a vertical = one row, no code change.
 */

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // vocabulary_configs — per-org overrides
  await knex.schema.createTable("vocabulary_configs", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("org_id").notNullable().references("id").inTable("organizations").onDelete("CASCADE");
    t.string("vertical").notNullable();
    t.jsonb("overrides").notNullable().defaultTo("{}");
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    t.unique(["org_id"]);
  });

  await knex.raw("CREATE INDEX idx_vocabulary_configs_org_id ON vocabulary_configs(org_id)");

  // vocabulary_defaults — seed data for 9 verticals (Cluster A)
  await knex.schema.createTable("vocabulary_defaults", (t) => {
    t.string("vertical").primary();
    t.jsonb("config").notNullable();
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  // Seed all 9 verticals
  const verticals = [
    {
      vertical: "endodontics",
      config: {
        patientTerm: "patient",
        referralTerm: "referring GP",
        caseType: "root canal case",
        primaryMetric: "referral rate",
        healthScoreLabel: "Practice Health Score",
        competitorTerm: "endodontist",
        providerTerm: "doctor",
        locationTerm: "practice",
        avgCaseValue: 1500,
      },
    },
    {
      vertical: "orthodontics",
      config: {
        patientTerm: "patient",
        referralTerm: "referring dentist",
        caseType: "new start",
        primaryMetric: "new start rate",
        healthScoreLabel: "Practice Health Score",
        competitorTerm: "orthodontist",
        providerTerm: "doctor",
        locationTerm: "practice",
        avgCaseValue: 800,
      },
    },
    {
      vertical: "general_dentistry",
      config: {
        patientTerm: "patient",
        referralTerm: "patient referral",
        caseType: "new patient",
        primaryMetric: "new patient acquisition",
        healthScoreLabel: "Practice Health Score",
        competitorTerm: "dentist",
        providerTerm: "dentist",
        locationTerm: "practice",
        avgCaseValue: 500,
      },
    },
    {
      vertical: "chiropractic",
      config: {
        patientTerm: "patient",
        referralTerm: "referring provider",
        caseType: "new case",
        primaryMetric: "new case rate",
        healthScoreLabel: "Practice Health Score",
        competitorTerm: "chiropractor",
        providerTerm: "doctor",
        locationTerm: "practice",
        avgCaseValue: 400,
      },
    },
    {
      vertical: "physical_therapy",
      config: {
        patientTerm: "patient",
        referralTerm: "referring physician",
        caseType: "new case",
        primaryMetric: "new case rate",
        healthScoreLabel: "Practice Health Score",
        competitorTerm: "physical therapist",
        providerTerm: "therapist",
        locationTerm: "clinic",
        avgCaseValue: 350,
      },
    },
    {
      vertical: "optometry",
      config: {
        patientTerm: "patient",
        referralTerm: "patient referral",
        caseType: "new exam",
        primaryMetric: "new exam rate",
        healthScoreLabel: "Practice Health Score",
        competitorTerm: "optometrist",
        providerTerm: "doctor",
        locationTerm: "office",
        avgCaseValue: 300,
      },
    },
    {
      vertical: "legal",
      config: {
        patientTerm: "client",
        referralTerm: "referral source",
        caseType: "new matter",
        primaryMetric: "new matter rate",
        healthScoreLabel: "Business Health Score",
        competitorTerm: "firm",
        providerTerm: "attorney",
        locationTerm: "firm",
        avgCaseValue: 3000,
      },
    },
    {
      vertical: "veterinary",
      config: {
        patientTerm: "client",
        referralTerm: "referral source",
        caseType: "new patient",
        primaryMetric: "new patient rate",
        healthScoreLabel: "Business Health Score",
        competitorTerm: "veterinarian",
        providerTerm: "veterinarian",
        locationTerm: "clinic",
        avgCaseValue: 250,
      },
    },
    {
      vertical: "financial_advisor",
      config: {
        patientTerm: "client",
        referralTerm: "referral source",
        caseType: "new account",
        primaryMetric: "new account rate",
        healthScoreLabel: "Business Health Score",
        competitorTerm: "advisor",
        providerTerm: "advisor",
        locationTerm: "office",
        avgCaseValue: 5000,
      },
    },
  ];

  for (const v of verticals) {
    await knex("vocabulary_defaults").insert({
      vertical: v.vertical,
      config: JSON.stringify(v.config),
    });
  }

  console.log(`[Migration] Vocabulary configs: table created, ${verticals.length} vertical defaults seeded`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("vocabulary_configs");
  await knex.schema.dropTableIfExists("vocabulary_defaults");
}
