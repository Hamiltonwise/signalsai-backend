import type { Knex } from "knex";

/**
 * Card G-foundation (May 4 2026, re-scoped) — Multi-Location ordering.
 *
 * Adds organizations.location_display_order JSONB array storing
 * user-defined location ordering. Default empty array — service layer
 * falls back to alphabetical-by-name when empty.
 *
 * Re-scope correction: original Card G spec targeted practice_profile,
 * which does not exist in the database. Same correction applied here
 * as Card E used (organizations is the actual home for per-org JSONB
 * fields like tracked_competitors, referral_column_mapping, etc.).
 *
 * The column carries an array of location IDs in user-defined order.
 * Missing IDs (added after the order was set) get appended alphabetically
 * by getOrderedLocations.
 */
export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn(
    "organizations",
    "location_display_order",
  );
  if (!has) {
    await knex.raw(
      `ALTER TABLE organizations
         ADD COLUMN location_display_order JSONB NOT NULL DEFAULT '[]'::jsonb`,
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn(
    "organizations",
    "location_display_order",
  );
  if (has) {
    await knex.raw(
      `ALTER TABLE organizations DROP COLUMN location_display_order`,
    );
  }
}
