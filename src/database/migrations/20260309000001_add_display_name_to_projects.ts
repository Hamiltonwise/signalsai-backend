import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("website_builder.projects", (t) => {
    t.string("display_name", 255).nullable().defaultTo(null);
  });

  // Backfill: set display_name to generated_hostname for existing projects
  await knex.raw(`
    UPDATE website_builder.projects
    SET display_name = generated_hostname
    WHERE display_name IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("website_builder.projects", (t) => {
    t.dropColumn("display_name");
  });
}
