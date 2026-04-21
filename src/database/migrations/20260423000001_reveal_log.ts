import type { Knex } from "knex";

/**
 * Card 4 (Manifest v2): reveal_log table.
 *
 * Archive of every Reveal Choreography execution. Used for:
 *   1. Idempotency (org_id + site_published_event_id is unique; second trigger is a no-op)
 *   2. Audit (which mode, which fan-outs succeeded, when)
 *   3. Latency SLO measurement (email_sent_at - created_at)
 *
 * Mode enum: 'dry_run' | 'live'. Dry-run composes everything, calls nothing.
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("reveal_log");
  if (exists) return;

  await knex.schema.createTable("reveal_log", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("org_id")
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    t.uuid("site_published_event_id").nullable();
    t.string("idempotency_key", 200).notNullable();
    t.string("mode", 20).notNullable(); // 'dry_run' | 'live'
    t.timestamp("email_sent_at", { useTz: true }).nullable();
    t.timestamp("lob_sent_at", { useTz: true }).nullable();
    t.timestamp("dashboard_rendered_at", { useTz: true }).nullable();
    t.string("email_message_id", 200).nullable();
    t.string("lob_postcard_id", 200).nullable();
    t.jsonb("composed_payload").nullable(); // { subject, body, lobFront, lobBack, dashboardTiles }
    t.string("error", 500).nullable();
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw(
    "CREATE UNIQUE INDEX idx_reveal_log_idempotency ON reveal_log(idempotency_key)"
  );
  await knex.raw("CREATE INDEX idx_reveal_log_org_id ON reveal_log(org_id)");
  await knex.raw(
    "CREATE INDEX idx_reveal_log_created_at ON reveal_log(created_at)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS idx_reveal_log_idempotency");
  await knex.raw("DROP INDEX IF EXISTS idx_reveal_log_org_id");
  await knex.raw("DROP INDEX IF EXISTS idx_reveal_log_created_at");
  await knex.schema.dropTableIfExists("reveal_log");
}
