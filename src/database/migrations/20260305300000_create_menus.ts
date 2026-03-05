import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Menus table
  await knex.schema.withSchema("website_builder").createTable("menus", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("project_id").notNullable().references("id").inTable("website_builder.projects").onDelete("CASCADE");
    t.string("name", 255).notNullable();
    t.string("slug", 255).notNullable();
    t.timestamps(true, true);

    t.unique(["project_id", "slug"]);
    t.index("project_id");
  });

  // Menu items table
  await knex.schema.withSchema("website_builder").createTable("menu_items", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("menu_id").notNullable().references("id").inTable("website_builder.menus").onDelete("CASCADE");
    t.uuid("parent_id").nullable().references("id").inTable("website_builder.menu_items").onDelete("CASCADE");
    t.string("label", 255).notNullable();
    t.text("url").notNullable();
    t.string("target", 20).notNullable().defaultTo("_self");
    t.integer("order_index").notNullable().defaultTo(0);
    t.timestamps(true, true);

    t.index(["menu_id", "parent_id", "order_index"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema("website_builder").dropTableIfExists("menu_items");
  await knex.schema.withSchema("website_builder").dropTableIfExists("menus");
}
