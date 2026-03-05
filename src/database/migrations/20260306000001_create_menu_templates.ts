import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema("website_builder").createTable("menu_templates", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("template_id").notNullable().references("id").inTable("website_builder.templates").onDelete("CASCADE");
    t.string("name", 255).notNullable();
    t.string("slug", 255).notNullable();
    t.jsonb("sections").notNullable().defaultTo("[]");
    t.timestamps(true, true);

    t.unique(["template_id", "slug"]);
    t.index("template_id");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema("website_builder").dropTableIfExists("menu_templates");
}
