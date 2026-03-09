import { Knex } from "knex";

/**
 * Create seo_generation_jobs table for tracking bulk SEO generation progress.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema("website_builder").createTable("seo_generation_jobs", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("project_id").notNullable().references("id").inTable("website_builder.projects").onDelete("CASCADE");
    t.string("entity_type", 10).notNullable(); // 'page' | 'post'
    t.uuid("post_type_id").nullable(); // only for posts
    t.string("status", 20).notNullable().defaultTo("queued"); // queued | processing | completed | failed
    t.integer("total_count").notNullable().defaultTo(0);
    t.integer("completed_count").notNullable().defaultTo(0);
    t.integer("failed_count").notNullable().defaultTo(0);
    t.jsonb("failed_items").nullable(); // [{ id, title, error }]
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema("website_builder").dropTableIfExists("seo_generation_jobs");
}
