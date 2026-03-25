import type { Knex } from "knex";

/**
 * WO-AUDIT-LOG: Audit log table for compliance and trust.
 * Tracks all admin/agent/system actions with before/after state.
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("audit_log");
  if (!exists) {
    await knex.schema.createTable("audit_log", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.string("actor_type", 50).notNullable(); // 'admin', 'agent', 'system'
      t.string("actor_id", 255).nullable(); // user email or agent name
      t.string("action", 200).notNullable(); // 'org.impersonated', 'billing.modified', etc
      t.string("target_type", 100).nullable(); // 'organization', 'user', 'task'
      t.string("target_id", 255).nullable();
      t.jsonb("before_state").nullable();
      t.jsonb("after_state").nullable();
      t.string("ip_address", 100).nullable();
      t.string("user_agent", 500).nullable();
      t.timestamp("occurred_at", { useTz: true }).defaultTo(knex.fn.now());
    });

    await knex.raw("CREATE INDEX idx_audit_log_actor ON audit_log(actor_id)");
    await knex.raw("CREATE INDEX idx_audit_log_target ON audit_log(target_type, target_id)");
    await knex.raw("CREATE INDEX idx_audit_log_occurred ON audit_log(occurred_at)");
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("audit_log");
}
