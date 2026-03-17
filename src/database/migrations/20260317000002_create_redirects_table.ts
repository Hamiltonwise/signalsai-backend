import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema
    .withSchema("website_builder")
    .createTable("redirects", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.uuid("project_id")
        .notNullable()
        .references("id")
        .inTable("website_builder.projects")
        .onDelete("CASCADE");
      t.text("from_path").notNullable();
      t.text("to_path").notNullable();
      t.integer("type").notNullable().defaultTo(301);
      t.boolean("is_wildcard").notNullable().defaultTo(false);
      t.timestamps(true, true);
    });

  await knex.schema
    .withSchema("website_builder")
    .alterTable("redirects", (t) => {
      t.unique(["project_id", "from_path"], {
        indexName: "idx_redirects_project_from",
      });
      t.index(["project_id", "is_wildcard"], "idx_redirects_project_wildcard");
    });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema
    .withSchema("website_builder")
    .dropTableIfExists("redirects");
}
