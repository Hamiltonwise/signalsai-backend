import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("messages", (t) => {
    t.increments("id").primary();
    t.integer("sender_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.integer("recipient_id").nullable().references("id").inTable("users").onDelete("SET NULL");
    t.integer("org_context_id").nullable().references("id").inTable("organizations").onDelete("SET NULL");
    t.text("content").notNullable();
    t.string("message_type", 20).notNullable().defaultTo("text");
    t.timestamp("read_at", { useTz: true }).nullable();
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  // Index for fetching messages by recipient (inbox queries)
  await knex.schema.raw(
    "CREATE INDEX idx_messages_recipient ON messages (recipient_id, created_at DESC)"
  );

  // Index for fetching messages by org context (client-linked queries)
  await knex.schema.raw(
    "CREATE INDEX idx_messages_org_context ON messages (org_context_id, created_at DESC)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("messages");
}
