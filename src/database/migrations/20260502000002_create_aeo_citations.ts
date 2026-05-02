import type { Knex } from "knex";

/**
 * AEO Citations table.
 *
 * One row per (practice, query, platform, checked_at). Continuous answer
 * engine reads the latest row per (practice, query, platform) to detect
 * citation deltas (cited true→false, false→true, competitor swap).
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("aeo_citations");
  if (exists) return;

  await knex.schema.createTable("aeo_citations", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .integer("practice_id")
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    table.text("query").notNullable();
    table.text("platform").notNullable();
    table.boolean("cited").notNullable();
    table.text("citation_url").nullable();
    table.integer("citation_position").nullable();
    table.text("competitor_cited").nullable();
    table.jsonb("raw_response").nullable();
    table
      .timestamp("checked_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await knex.raw(
    `CREATE INDEX idx_aeo_citations_practice_query
       ON aeo_citations (practice_id, query, checked_at DESC)`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("aeo_citations");
}
