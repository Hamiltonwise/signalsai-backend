import type { Knex } from "knex";

/**
 * Card 4 (Manifest v2): per-organization feature flag for Reveal Choreography.
 *
 * Gate Path on arrival: Shadow. Default is false so the hook runs in dry-run
 * mode (composes everything, logs to reveal_log, but does NOT call Mailgun or
 * Lob). Dave flips per org when confident.
 */
export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn(
    "organizations",
    "reveal_choreography_enabled"
  );
  if (has) return;

  await knex.schema.alterTable("organizations", (t) => {
    t.boolean("reveal_choreography_enabled").notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn(
    "organizations",
    "reveal_choreography_enabled"
  );
  if (has) {
    await knex.schema.alterTable("organizations", (t) =>
      t.dropColumn("reveal_choreography_enabled")
    );
  }
}
