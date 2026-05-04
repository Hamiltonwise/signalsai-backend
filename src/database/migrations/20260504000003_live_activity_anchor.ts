import type { Knex } from "knex";

/**
 * Card 6 — Anchor Live Activity entry on practice flip (May 4 2026).
 *
 * Adds an `is_anchor_entry` boolean to live_activity_entries so the
 * Phase 4 feed renderer can pin the temporal anchor (the "Alloro began
 * watching {N} questions for {practice} today" line) at the bottom of
 * the timeline. New signals stack on top; the anchor stays as the
 * oldest visible entry.
 *
 * Partial index on (practice_id) WHERE is_anchor_entry = TRUE supports
 * the idempotency check ("does this practice already have an anchor?")
 * with an O(1) lookup.
 */
export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("live_activity_entries");
  if (!hasTable) {
    throw new Error(
      "[Card 6] live_activity_entries missing. Run 20260502000003 first.",
    );
  }

  const hasCol = await knex.schema.hasColumn(
    "live_activity_entries",
    "is_anchor_entry",
  );
  if (!hasCol) {
    await knex.schema.alterTable("live_activity_entries", (t) => {
      t.boolean("is_anchor_entry").notNullable().defaultTo(false);
    });
  }

  await knex.raw(
    `CREATE INDEX IF NOT EXISTS idx_live_activity_anchor
       ON live_activity_entries(practice_id)
       WHERE is_anchor_entry = TRUE`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_live_activity_anchor`);
  const hasCol = await knex.schema.hasColumn(
    "live_activity_entries",
    "is_anchor_entry",
  );
  if (hasCol) {
    await knex.schema.alterTable("live_activity_entries", (t) => {
      t.dropColumn("is_anchor_entry");
    });
  }
}
