/**
 * Migration: Add candidate_lattice_entry to knowledge_sources
 * Stores auto-generated Knowledge Lattice candidate from Intelligence Intake.
 */

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("knowledge_sources", "candidate_lattice_entry");
  if (!has) {
    await knex.schema.alterTable("knowledge_sources", (t) => {
      t.jsonb("candidate_lattice_entry");
    });
  }
  console.log("[Migration] candidate_lattice_entry added to knowledge_sources");
}

export async function down(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("knowledge_sources", "candidate_lattice_entry");
  if (has) {
    await knex.schema.alterTable("knowledge_sources", (t) => {
      t.dropColumn("candidate_lattice_entry");
    });
  }
}
