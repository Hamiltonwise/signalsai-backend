import type { Knex } from "knex";

/**
 * F1 — Multi-location support on `website_builder.projects`.
 *
 * Adds two columns:
 *   - `selected_place_ids TEXT[] NOT NULL DEFAULT '{}'` — full list of Google
 *     Business Profile `place_id`s the admin has attached to this project.
 *   - `primary_place_id TEXT NULL` — the `place_id` that drives `identity.business`,
 *     archetype classification, and content distillation.
 *
 * Legacy `selected_place_id` column is preserved (many consumers still read it)
 * and kept in sync as the "primary pointer" — this migration backfills both new
 * columns from it so existing projects are non-destructively upgraded.
 *
 * See `plans/04182026-no-ticket-identity-enrichments-and-post-imports/spec.md`
 * task F1. T8's `posts.source_url` column ships in a separate migration.
 */
export async function up(knex: Knex): Promise<void> {
  const hasIds = await knex.schema
    .withSchema("website_builder")
    .hasColumn("projects", "selected_place_ids");
  const hasPrimary = await knex.schema
    .withSchema("website_builder")
    .hasColumn("projects", "primary_place_id");

  if (!hasIds || !hasPrimary) {
    await knex.schema
      .withSchema("website_builder")
      .alterTable("projects", (t) => {
        if (!hasIds) {
          t.specificType("selected_place_ids", "TEXT[]")
            .notNullable()
            .defaultTo(knex.raw("'{}'::TEXT[]"));
        }
        if (!hasPrimary) {
          t.text("primary_place_id").nullable();
        }
      });
  }

  // Backfill: every existing project that already has a single selected_place_id
  // gets populated into both the array + the explicit primary pointer.
  await knex.raw(`
    UPDATE website_builder.projects
       SET selected_place_ids = ARRAY[selected_place_id],
           primary_place_id = selected_place_id
     WHERE selected_place_id IS NOT NULL
       AND selected_place_ids = '{}'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema
    .withSchema("website_builder")
    .alterTable("projects", (t) => {
      t.dropColumn("primary_place_id");
      t.dropColumn("selected_place_ids");
    });
}
