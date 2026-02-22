import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("locations", (table) => {
    table.increments("id").primary();
    table
      .integer("organization_id")
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    table.string("name", 255).notNullable();
    table.string("domain", 255).nullable();
    table.boolean("is_primary").notNullable().defaultTo(false);
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(
    `CREATE INDEX idx_locations_organization_id ON locations(organization_id)`
  );
  // Ensure at most one primary location per organization
  await knex.raw(
    `CREATE UNIQUE INDEX idx_locations_one_primary_per_org ON locations(organization_id) WHERE is_primary = true`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("locations");
}
