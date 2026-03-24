import type { Knex } from "knex";

/**
 * Knowledge Sources — Intelligence Intake for Founder Mode.
 * Stores extracted intelligence from podcasts, articles, videos, research.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("knowledge_sources", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("source_type", 50).notNullable(); // url, file, text
    table.string("source_url", 1000).nullable();
    table.string("source_title", 500).nullable();
    table.string("source_author", 200).nullable();
    table.string("content_type", 50).nullable(); // podcast, article, video, pdf, research
    table.text("raw_content").nullable(); // original text/transcript
    table.jsonb("extracted_intelligence").defaultTo("{}"); // frameworks, tactics, quotes
    table.text("intelligence_brief").nullable(); // one-page summary
    table.jsonb("domain_tags").defaultTo("[]"); // product, gtm, operations, personal, legal
    table.jsonb("decision_cross_refs").defaultTo("[]"); // references to Decision Log
    table.string("status", 20).defaultTo("pending"); // pending, processing, complete, failed
    table.string("created_by", 100).defaultTo("corey");
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw("CREATE INDEX idx_knowledge_sources_status ON knowledge_sources(status)");
  await knex.raw("CREATE INDEX idx_knowledge_sources_created ON knowledge_sources(created_at DESC)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("knowledge_sources");
}
