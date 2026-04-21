import type { Knex } from "knex";

/**
 * Manifest v2 Card 3 — narrator_enabled feature flag.
 *
 * Shadow mode default (false). When flipped to true per-org, Narrator outputs
 * begin reaching dashboard tiles, Monday email intelligence blocks, and
 * in-app notifications.
 */
export async function up(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn("organizations", "narrator_enabled");
  if (!hasCol) {
    await knex.schema.alterTable("organizations", (t) => {
      t.boolean("narrator_enabled").notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn("organizations", "narrator_enabled");
  if (hasCol) {
    await knex.schema.alterTable("organizations", (t) => t.dropColumn("narrator_enabled"));
  }
}
