/**
 * Add target_competitor fields to organizations.
 *
 * When Saif says "beat Centreville," this is where it gets stored.
 * The Oz Engine and DFY Engine read these to direct all output
 * at the specific competitor the client named.
 *
 * Blast radius: Yellow (DB migration)
 */

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (table) => {
    // The competitor the client wants to beat
    table.string("target_competitor_place_id").nullable();
    table.string("target_competitor_name").nullable();

    // Founder context from weekly ritual (2.5 min)
    // "Dr. Martinez just opened across the street" -- the thing only the owner knows
    table.text("client_context").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (table) => {
    table.dropColumn("target_competitor_place_id");
    table.dropColumn("target_competitor_name");
    table.dropColumn("client_context");
  });
}
