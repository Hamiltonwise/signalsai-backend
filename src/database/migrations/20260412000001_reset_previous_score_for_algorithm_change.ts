/**
 * Reset previous_clarity_score to null for all orgs.
 *
 * WHY: The scoring algorithm in clarityScoring.ts changed from binary
 * (healthy=1, not=0) to weighted (healthy=1.0, attention=0.5, critical=0).
 * This means every org's score will shift on the next weekly recalc.
 * Without this reset, the Monday email would report a fake delta
 * ("Your Google Health Check improved 33 -> 67") when nothing about
 * the business actually changed. Nulling previous_clarity_score makes
 * the email say "holding steady" for the first week after the change.
 *
 * The next recalc will store the new score as current AND previous,
 * so future deltas will be real.
 */

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex("organizations")
    .whereNotNull("previous_clarity_score")
    .update({ previous_clarity_score: null });
}

export async function down(knex: Knex): Promise<void> {
  // Cannot restore previous values. This is a one-way data operation.
  // The next weekly recalc will populate previous_clarity_score naturally.
}
