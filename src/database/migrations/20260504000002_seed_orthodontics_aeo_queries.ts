import type { Knex } from "knex";

/**
 * Card 4 — Orthodontics AEO query seed (May 4 2026).
 *
 * 25 patient-shaped queries approved in Card 4's Customer-Visible Strings
 * Approval section. Each row is inserted with vertical='orthodontics'
 * and specialty='orthodontics' so both the legacy specialty filter and
 * the Card-4 vertical filter resolve correctly.
 *
 * The query column has a UNIQUE constraint on aeo_test_queries.query, so
 * a re-run of this migration is a no-op for any rows that already exist.
 */

const ORTHODONTICS_QUERIES: Array<{ query: string; notes: string }> = [
  { query: "how long does Invisalign treatment take", notes: "patient buying intent, treatment duration" },
  { query: "clear aligners vs braces which is better", notes: "patient comparison query" },
  { query: "best orthodontist near me", notes: "high-intent local discovery" },
  { query: "how often to clean retainers", notes: "post-treatment patient care" },
  { query: "do clear aligners hurt", notes: "patient anxiety / objection handling" },
  { query: "Spark aligners vs Invisalign comparison", notes: "brand-comparison patient query" },
  { query: "orthodontist for adults", notes: "adult patient segment intent" },
  { query: "how much do braces cost", notes: "patient pricing intent" },
  { query: "how long does treatment with Spark clear aligners take", notes: "Spark-specific patient duration query" },
  { query: "ceramic braces vs metal braces", notes: "patient appearance preference" },
  { query: "when should my child see an orthodontist", notes: "parent decision query" },
  { query: "Invisalign for teens", notes: "teen segment with parent decision-maker" },
  { query: "how to fix crowded teeth", notes: "patient symptom / outcome query" },
  { query: "retainer types after braces", notes: "post-treatment options" },
  { query: "self-ligating braces vs traditional", notes: "patient/parent technology comparison" },
  { query: "orthodontic treatment for overbite", notes: "patient symptom / outcome query" },
  { query: "how to fix gap between teeth", notes: "patient symptom / outcome query" },
  { query: "early orthodontic treatment age", notes: "parent timing decision" },
  { query: "orthodontic emergency what to do", notes: "active patient triage query" },
  { query: "lingual braces cost and process", notes: "premium-segment patient research" },
  { query: "orthodontist consultation what to expect", notes: "first-visit patient query" },
  { query: "how often orthodontist appointments during treatment", notes: "active patient logistics" },
  { query: "what to eat with new braces", notes: "newly-bonded patient query" },
  { query: "how long do retainers need to be worn", notes: "post-treatment patient query" },
  { query: "orthodontist financing payment plans", notes: "patient affordability research" },
];

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("aeo_test_queries");
  if (!hasTable) {
    throw new Error(
      "[Card 4 seed] aeo_test_queries table missing. Run 20260502000004 first.",
    );
  }

  const rows = ORTHODONTICS_QUERIES.map((q) => ({
    query: q.query,
    specialty: "orthodontics",
    vertical: "orthodontics",
    active: true,
    notes: q.notes,
  }));

  // Insert with conflict-skip on the query unique constraint so re-runs are
  // safe and idempotent.
  await knex("aeo_test_queries").insert(rows).onConflict("query").ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex("aeo_test_queries")
    .where({ vertical: "orthodontics", specialty: "orthodontics" })
    .whereIn(
      "query",
      ORTHODONTICS_QUERIES.map((q) => q.query),
    )
    .del();
}
