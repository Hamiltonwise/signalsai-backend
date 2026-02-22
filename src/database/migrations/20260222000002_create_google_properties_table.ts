import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("google_properties", (table) => {
    table.increments("id").primary();
    table
      .integer("location_id")
      .notNullable()
      .references("id")
      .inTable("locations")
      .onDelete("CASCADE");
    table
      .integer("google_connection_id")
      .notNullable()
      .references("id")
      .inTable("google_connections")
      .onDelete("CASCADE");
    table.string("type", 50).notNullable().defaultTo("gbp");
    table.string("external_id", 255).notNullable();
    table.string("account_id", 255).nullable();
    table.string("display_name", 255).nullable();
    table.jsonb("metadata").nullable();
    table.boolean("selected").notNullable().defaultTo(true);
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(
    `CREATE INDEX idx_google_properties_location_id ON google_properties(location_id)`
  );
  await knex.raw(
    `CREATE INDEX idx_google_properties_connection_id ON google_properties(google_connection_id)`
  );
  // Prevent duplicate property entries per connection
  await knex.raw(
    `CREATE UNIQUE INDEX idx_google_properties_unique_external ON google_properties(google_connection_id, external_id)`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("google_properties");
}
