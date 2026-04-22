import type { Knex } from "knex";

/**
 * Card 5 Run 3 (Manifest v2): digest_sends table.
 *
 * Audit trail for every weekly digest. Used for:
 *   1. Delta comparison (current vs last week's tri-score)
 *   2. Delivery tracking (sent, held, failed)
 *   3. Freeform Concern Gate audit (rubric_score, gate result)
 *   4. Content dedup (content_hash)
 *   5. Open/click tracking timestamps
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("digest_sends");
  if (exists) return;

  await knex.schema.createTable("digest_sends", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("practice_id")
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    t.timestamp("composed_at", { useTz: true }).notNullable();
    t.timestamp("sent_at", { useTz: true }).nullable();
    t.float("rubric_score").nullable();
    t.jsonb("freeform_gate_result").nullable();
    t.string("narrator_version_id", 200).nullable();
    t.string("content_hash", 64).nullable();
    t.jsonb("content_json").nullable();
    t.string("delivery_status", 30).notNullable().defaultTo("pending");
    // delivery_status: 'pending' | 'sent' | 'held' | 'send_failed' | 'compose_failed'
    t.string("message_id", 200).nullable();
    t.timestamp("open_event_ts", { useTz: true }).nullable();
    t.timestamp("click_event_ts", { useTz: true }).nullable();
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw(
    "CREATE INDEX idx_digest_sends_practice_id ON digest_sends(practice_id)"
  );
  await knex.raw(
    "CREATE INDEX idx_digest_sends_composed_at ON digest_sends(composed_at)"
  );
  await knex.raw(
    "CREATE INDEX idx_digest_sends_delivery_status ON digest_sends(delivery_status)"
  );
  await knex.raw(
    "CREATE INDEX idx_digest_sends_content_hash ON digest_sends(content_hash)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS idx_digest_sends_practice_id");
  await knex.raw("DROP INDEX IF EXISTS idx_digest_sends_composed_at");
  await knex.raw("DROP INDEX IF EXISTS idx_digest_sends_delivery_status");
  await knex.raw("DROP INDEX IF EXISTS idx_digest_sends_content_hash");
  await knex.schema.dropTableIfExists("digest_sends");
}
