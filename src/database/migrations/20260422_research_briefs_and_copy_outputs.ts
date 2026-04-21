import type { Knex } from "knex";

/**
 * Manifest v2 Card 2: Build Orchestrator storage tables.
 *
 * research_briefs: one row per Research stage run. brief_json mirrors the
 *   ResearchBrief contract from agents/patientpathResearch.ts.
 * copy_outputs: one row per Copy stage run, linked to the brief that fed
 *   it. status transitions pending -> qa_passed | qa_failed | retried.
 *
 * Idempotency key is stored on both tables so duplicate trigger events no-op.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("research_briefs", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .integer("org_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    table.string("idempotency_key", 128).nullable();
    table.jsonb("brief_json").notNullable().defaultTo("{}");
    table.string("confidence_level", 16).nullable();
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw(
    "CREATE INDEX idx_research_briefs_org_id ON research_briefs(org_id)"
  );
  await knex.raw(
    "CREATE UNIQUE INDEX idx_research_briefs_idem ON research_briefs(idempotency_key) WHERE idempotency_key IS NOT NULL"
  );

  await knex.schema.createTable("copy_outputs", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .integer("org_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    table
      .uuid("research_brief_id")
      .nullable()
      .references("id")
      .inTable("research_briefs")
      .onDelete("SET NULL");
    table.string("idempotency_key", 128).nullable();
    table.jsonb("copy_json").notNullable().defaultTo("{}");
    table.string("status", 32).notNullable().defaultTo("pending");
    table.integer("qa_attempts").notNullable().defaultTo(0);
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw(
    "CREATE INDEX idx_copy_outputs_org_id ON copy_outputs(org_id)"
  );
  await knex.raw(
    "CREATE INDEX idx_copy_outputs_brief ON copy_outputs(research_brief_id)"
  );
  await knex.raw(
    "CREATE UNIQUE INDEX idx_copy_outputs_idem ON copy_outputs(idempotency_key) WHERE idempotency_key IS NOT NULL"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("copy_outputs");
  await knex.schema.dropTableIfExists("research_briefs");
}
