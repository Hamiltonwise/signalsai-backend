import type { Knex } from "knex";

/**
 * Card D — Specialty-Aware Competitor Sets (May 4 2026 evening).
 *
 * Adds approved_adjacent_specialties JSONB column to vocabulary_configs
 * so each org's vertical has a customizable list of GBP categories that
 * count as same-specialty competitors. Default empty array (preserves
 * legacy behavior — the existing hardcoded filterBySpecialty still
 * gates discovery).
 *
 * Backfill seeds 7 healthcare verticals per Card D approval. Verticals
 * that don't exist in vocabulary_configs are silently skipped (the
 * column is added at the row level, so backfill is an UPDATE per
 * vertical match).
 */
export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn(
    "vocabulary_configs",
    "approved_adjacent_specialties",
  );
  if (!has) {
    await knex.raw(
      `ALTER TABLE vocabulary_configs
         ADD COLUMN approved_adjacent_specialties JSONB NOT NULL DEFAULT '[]'::jsonb`,
    );
  }

  // Backfill the 7 seeded healthcare verticals per Card D approval.
  const seeds: Array<[string, string[]]> = [
    ["endodontics", ["endodontist"]],
    ["orthodontics", ["orthodontist"]],
    ["oral_surgery", ["oral_surgeon", "maxillofacial_surgeon"]],
    ["general_dentistry", ["general_dentist", "family_dentist"]],
    ["physical_therapy", ["physical_therapist", "physiotherapist"]],
    ["chiropractic", ["chiropractor"]],
    ["veterinary", ["veterinarian", "animal_hospital"]],
  ];

  for (const [vertical, approved] of seeds) {
    await knex.raw(
      `UPDATE vocabulary_configs
         SET approved_adjacent_specialties = ?::jsonb
         WHERE vertical = ?`,
      [JSON.stringify(approved), vertical],
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn(
    "vocabulary_configs",
    "approved_adjacent_specialties",
  );
  if (has) {
    await knex.raw(
      `ALTER TABLE vocabulary_configs DROP COLUMN approved_adjacent_specialties`,
    );
  }
}
