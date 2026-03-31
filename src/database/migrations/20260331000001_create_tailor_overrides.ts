import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("tailor_overrides", (table) => {
    table.increments("id").primary();
    table.integer("org_id").nullable().references("id").inTable("organizations").onDelete("CASCADE");
    table.text("override_key").notNullable();
    table.text("override_value").notNullable();
    table.integer("updated_by").nullable().references("id").inTable("users").onDelete("SET NULL");
    table.timestamps(true, true);

    // Unique constraint: one override per key per org (null org = global)
    table.unique(["org_id", "override_key"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("tailor_overrides");
}
