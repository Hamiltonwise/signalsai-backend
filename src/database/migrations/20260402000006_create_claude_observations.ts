import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("claude_observations");
  if (!exists) {
    await knex.schema.createTable("claude_observations", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.string("type", 30).notNullable().comment("noticed, recommendation, shipped, pattern");
      t.string("confidence", 10).notNullable().defaultTo("yellow").comment("green, yellow, red");
      t.string("title", 300).notNullable();
      t.text("body").notNullable();
      t.integer("org_id").nullable().references("id").inTable("organizations").onDelete("SET NULL");
      t.string("org_name", 255).nullable();
      t.string("category", 50).nullable().comment("customer, product, data, architecture, revenue");
      t.boolean("acknowledged").notNullable().defaultTo(false);
      t.string("acknowledged_by", 100).nullable();
      t.timestamp("acknowledged_at", { useTz: true }).nullable();
      t.string("session_context", 500).nullable().comment("what was being worked on when this was noticed");
      t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("claude_observations");
}
