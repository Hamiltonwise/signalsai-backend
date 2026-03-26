import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("knowledge_access_events", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("agent_name", 100).notNullable();
    t.string("document_id", 200).nullable();
    t.string("document_title", 500).nullable();
    t.timestamp("accessed_at").defaultTo(knex.fn.now());
    t.string("session_context", 500).nullable();
    t.string("action_type", 50).defaultTo("read"); // read, cite, apply
    t.timestamps(true, true);
  });
  await knex.schema.raw("CREATE INDEX idx_kae_agent ON knowledge_access_events(agent_name)");
  await knex.schema.raw("CREATE INDEX idx_kae_doc ON knowledge_access_events(document_id)");
  await knex.schema.raw("CREATE INDEX idx_kae_date ON knowledge_access_events(accessed_at)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("knowledge_access_events");
}
