/**
 * Compliance scan results storage.
 *
 * Stores findings from website marketing claim analysis.
 * Each scan captures: pages scanned, findings with severity, and timestamp.
 */

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("compliance_scans", (t) => {
    t.increments("id").primary();
    t.integer("organization_id")
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    t.string("domain", 255).notNullable();
    t.integer("pages_scanned").notNullable().defaultTo(0);
    t.integer("findings_count").notNullable().defaultTo(0);
    t.jsonb("findings").notNullable().defaultTo("[]");
    t.timestamp("scanned_at").notNullable().defaultTo(knex.fn.now());
    t.timestamps(true, true);
  });

  await knex.raw(
    "CREATE INDEX idx_compliance_scans_org ON compliance_scans(organization_id)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("compliance_scans");
}
