import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("user_locations", (table) => {
    table
      .integer("user_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    table
      .integer("location_id")
      .notNullable()
      .references("id")
      .inTable("locations")
      .onDelete("CASCADE");
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.primary(["user_id", "location_id"]);
  });

  await knex.raw(
    `CREATE INDEX idx_user_locations_location_id ON user_locations(location_id)`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("user_locations");
}
