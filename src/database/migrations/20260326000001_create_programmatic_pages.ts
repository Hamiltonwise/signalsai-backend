import type { Knex } from "knex";

/**
 * WO-7 Component 2: Programmatic Pages Table
 *
 * Stores SEO landing pages with real Places API competitor data.
 * Each page = one specialty + one city combination.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("programmatic_pages", (table) => {
    table.increments("id").primary();
    table.string("specialty_slug", 100).notNullable();
    table.string("city_slug", 200).notNullable();
    table.string("city_name", 200).notNullable();
    table.string("state", 200).nullable();
    table.string("state_abbr", 5).notNullable();
    table.string("specialty_name", 200).notNullable();
    table.string("page_slug", 400).notNullable().unique();
    table.float("lat").nullable();
    table.float("lng").nullable();
    table.text("title").notNullable();
    table.text("meta_description").nullable();
    table.jsonb("competitors_snapshot").defaultTo("[]");
    table.jsonb("content_sections").defaultTo("[]");
    table.jsonb("schema_markup").defaultTo("{}");
    table.jsonb("hub_spoke_links").defaultTo("{}");
    table.float("conversion_rate").defaultTo(0);
    table.integer("page_views").defaultTo(0);
    table.integer("checkup_starts").defaultTo(0);
    table.string("status", 20).defaultTo("draft").notNullable();
    table.boolean("needs_refresh").defaultTo(false);
    table.integer("publish_batch").nullable();
    table.timestamp("competitors_refreshed_at", { useTz: true }).nullable();
    table.timestamp("published_at", { useTz: true }).nullable();
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw(
    "CREATE INDEX idx_programmatic_pages_specialty ON programmatic_pages(specialty_slug)"
  );
  await knex.raw(
    "CREATE INDEX idx_programmatic_pages_city ON programmatic_pages(city_slug)"
  );
  await knex.raw(
    "CREATE INDEX idx_programmatic_pages_status ON programmatic_pages(status)"
  );
  await knex.raw(
    "CREATE INDEX idx_programmatic_pages_needs_refresh ON programmatic_pages(needs_refresh) WHERE needs_refresh = true"
  );
  await knex.raw(
    "CREATE INDEX idx_programmatic_pages_page_slug ON programmatic_pages(page_slug)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("programmatic_pages");
}
