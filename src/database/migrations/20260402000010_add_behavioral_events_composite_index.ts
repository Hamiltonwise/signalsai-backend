/**
 * Add composite index on behavioral_events for the most common query pattern.
 *
 * Every agent query, Monday email, dashboard load, and client health check
 * filters by (org_id, event_type, created_at). Three separate single-column
 * indexes force the planner to pick one and scan the rest. At 2,776 rows
 * this is invisible. At 50K+ (a few months of real traffic) it's a wall.
 */

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Check if index already exists
  const exists = await knex.raw(`
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'behavioral_events'
    AND indexname = 'idx_behavioral_events_org_type_created'
  `);
  if (exists.rows.length === 0) {
    await knex.raw(`
      CREATE INDEX idx_behavioral_events_org_type_created
      ON behavioral_events (org_id, event_type, created_at DESC)
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS idx_behavioral_events_org_type_created");
}
