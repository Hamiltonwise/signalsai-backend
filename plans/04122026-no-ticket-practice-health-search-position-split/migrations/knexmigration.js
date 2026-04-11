/**
 * Migration: add Search Position columns to practice_rankings
 *
 * Spec: plans/04122026-no-ticket-practice-health-search-position-split/spec.md
 *
 * This is the scaffold. The real migration file lives at:
 *   src/database/migrations/20260412000001_add_search_position_to_practice_rankings.ts
 *
 * Port this scaffold to TypeScript during T1 execution, matching the pattern
 * of src/database/migrations/20260129000002_add_location_params_to_practice_rankings.ts
 * (closest existing analog — previous "add columns to practice_rankings" migration).
 */

exports.up = async function up(knex) {
  // TODO: fill during execution — confirm useTz behavior matches existing migrations
  await knex.schema.alterTable("practice_rankings", (t) => {
    t.integer("search_position").nullable();
    t.text("search_query").nullable();
    t.decimal("search_lat", 10, 7).nullable();
    t.decimal("search_lng", 10, 7).nullable();
    t.integer("search_radius_meters").nullable();
    t.jsonb("search_results").nullable();
    t.timestamp("search_checked_at", { useTz: true }).nullable();
    t.string("search_status", 32).nullable();
  });

  // Enum-like constraint on search_status (Revision 1, Gap C)
  // TODO: confirm CHECK constraint syntax for the target DB driver
  await knex.raw(`
    ALTER TABLE practice_rankings
      ADD CONSTRAINT practice_rankings_search_status_check
        CHECK (search_status IS NULL OR search_status IN (
          'ok',
          'not_in_top_20',
          'bias_unavailable',
          'api_error'
        ))
  `);
};

exports.down = async function down(knex) {
  // TODO: fill during execution
  await knex.raw(`
    ALTER TABLE practice_rankings
      DROP CONSTRAINT IF EXISTS practice_rankings_search_status_check
  `);

  await knex.schema.alterTable("practice_rankings", (t) => {
    t.dropColumn("search_status");
    t.dropColumn("search_checked_at");
    t.dropColumn("search_results");
    t.dropColumn("search_radius_meters");
    t.dropColumn("search_lng");
    t.dropColumn("search_lat");
    t.dropColumn("search_query");
    t.dropColumn("search_position");
  });
};
