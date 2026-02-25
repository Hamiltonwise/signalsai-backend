import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Add slug column (nullable first for backfill)
  await knex.schema.withSchema("minds").alterTable("minds", (table) => {
    table.text("slug").nullable();
  });

  // Backfill existing minds: slug = lower(replace(name, ' ', '-'))
  await knex.raw(`
    UPDATE minds.minds
    SET slug = lower(replace(name, ' ', '-'))
    WHERE slug IS NULL
  `);

  // Now set NOT NULL and UNIQUE
  await knex.schema.withSchema("minds").alterTable("minds", (table) => {
    table.text("slug").notNullable().alter();
    table.unique(["slug"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema("minds").alterTable("minds", (table) => {
    table.dropUnique(["slug"]);
    table.dropColumn("slug");
  });
}
