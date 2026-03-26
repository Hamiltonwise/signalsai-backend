import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("lattice_cache", (t) => {
    t.increments("id").primary();
    t.string("lattice_type", 30).notNullable(); // "knowledge" | "sentiment"
    t.jsonb("entries").defaultTo("[]");
    t.timestamp("updated_at").defaultTo(knex.fn.now());
  });

  // Seed empty rows for both types
  await knex("lattice_cache").insert([
    { lattice_type: "knowledge", entries: "[]" },
    { lattice_type: "sentiment", entries: "[]" },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("lattice_cache");
}
