/**
 * Migration: Add Output Gate fields to behavioral_events
 *
 * Every agent output that logs to behavioral_events can now include
 * the biological-economic lens: which human need is at stake and
 * what the dollar consequence is at 30/90/365 days.
 *
 * These fields are nullable because not every event is an agent output.
 * Checkup flow events, login events, etc. don't carry the lens.
 * Agent outputs do.
 */

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("behavioral_events", (t) => {
    // Which core human need is threatened or served
    // Values: safety, belonging, purpose, status, or null for non-agent events
    t.string("human_need", 20).nullable();

    // Dollar consequence at 30, 90, and 365 days
    // Stored as cents to avoid floating point (e.g., 1800000 = $18,000)
    t.bigInteger("economic_consequence_30d").nullable();
    t.bigInteger("economic_consequence_90d").nullable();
    t.bigInteger("economic_consequence_365d").nullable();
  });

  // Index for querying by human need (Learning Agent pattern analysis)
  await knex.raw(
    "CREATE INDEX idx_behavioral_events_human_need ON behavioral_events(human_need) WHERE human_need IS NOT NULL"
  );

  console.log("[Migration] behavioral_events: added Output Gate fields (human_need, economic_consequence_30d/90d/365d)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS idx_behavioral_events_human_need");
  await knex.schema.alterTable("behavioral_events", (t) => {
    t.dropColumn("human_need");
    t.dropColumn("economic_consequence_30d");
    t.dropColumn("economic_consequence_90d");
    t.dropColumn("economic_consequence_365d");
  });
}
