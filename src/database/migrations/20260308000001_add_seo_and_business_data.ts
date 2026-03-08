import { Knex } from "knex";

/**
 * Add business_data JSONB to organizations & locations,
 * add seo_data JSONB to pages & posts,
 * remove unused meta_title / meta_description from pages.
 */
export async function up(knex: Knex): Promise<void> {
  // 1. organizations.business_data
  await knex.schema.alterTable("organizations", (t) => {
    t.jsonb("business_data").nullable().defaultTo(null);
  });

  // 2. locations.business_data
  await knex.schema.alterTable("locations", (t) => {
    t.jsonb("business_data").nullable().defaultTo(null);
  });

  // 3. pages — add seo_data, conditionally drop meta_title & meta_description
  await knex.schema.withSchema("website_builder").alterTable("pages", (t) => {
    t.jsonb("seo_data").nullable().defaultTo(null);
  });

  // Drop legacy columns only if they exist
  const hasMetaTitle = await knex.schema.withSchema("website_builder").hasColumn("pages", "meta_title");
  if (hasMetaTitle) {
    await knex.schema.withSchema("website_builder").alterTable("pages", (t) => {
      t.dropColumn("meta_title");
    });
  }
  const hasMetaDesc = await knex.schema.withSchema("website_builder").hasColumn("pages", "meta_description");
  if (hasMetaDesc) {
    await knex.schema.withSchema("website_builder").alterTable("pages", (t) => {
      t.dropColumn("meta_description");
    });
  }

  // 4. posts — add seo_data
  await knex.schema.withSchema("website_builder").alterTable("posts", (t) => {
    t.jsonb("seo_data").nullable().defaultTo(null);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema("website_builder").alterTable("posts", (t) => {
    t.dropColumn("seo_data");
  });

  await knex.schema.withSchema("website_builder").alterTable("pages", (t) => {
    t.dropColumn("seo_data");
    t.string("meta_title").nullable();
    t.string("meta_description").nullable();
  });

  await knex.schema.alterTable("locations", (t) => {
    t.dropColumn("business_data");
  });

  await knex.schema.alterTable("organizations", (t) => {
    t.dropColumn("business_data");
  });
}
