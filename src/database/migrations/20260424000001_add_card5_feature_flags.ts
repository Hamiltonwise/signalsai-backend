import type { Knex } from "knex";

/**
 * Card 5 (Standard Rubric) — per-organization feature flags. All default to
 * false so rollout is opt-in and the gates run in shadow mode until the flag
 * is flipped. Reversible <60s per Decision Guardrails v2.2.
 *
 *   freeform_concern_gate_enabled — Runtime rubric gate at end of siteQa,
 *     narrator, and reveal email/postcard pipelines.
 *   recognition_score_enabled    — Recognition Tri-Score section in the Checkup.
 *   discoverability_bake_enabled — Card 2 orchestrator Bake stage (SEO+AEO+CRO).
 */
export async function up(knex: Knex): Promise<void> {
  const columns = [
    "freeform_concern_gate_enabled",
    "recognition_score_enabled",
    "discoverability_bake_enabled",
  ];
  for (const col of columns) {
    const has = await knex.schema.hasColumn("organizations", col);
    if (!has) {
      await knex.schema.alterTable("organizations", (t) => {
        t.boolean(col).notNullable().defaultTo(false);
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const columns = [
    "freeform_concern_gate_enabled",
    "recognition_score_enabled",
    "discoverability_bake_enabled",
  ];
  for (const col of columns) {
    const has = await knex.schema.hasColumn("organizations", col);
    if (has) {
      await knex.schema.alterTable("organizations", (t) => t.dropColumn(col));
    }
  }
}
