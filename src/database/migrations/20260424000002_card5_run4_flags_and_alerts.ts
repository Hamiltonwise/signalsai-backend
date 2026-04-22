import type { Knex } from "knex";

/**
 * Card 5 Run 4: feature flag columns for Copy Rewrite, Material Event Alerts,
 * and upgrade_existing Card 2 entry mode, plus the material_event_alerts
 * audit table. Reversible <60s per Decision Guardrails v2.2.
 */
export async function up(knex: Knex): Promise<void> {
  const flagCols = [
    "copy_rewrite_enabled",
    "material_event_alerts_enabled",
    "upgrade_existing_enabled",
  ];
  for (const col of flagCols) {
    const has = await knex.schema.hasColumn("organizations", col);
    if (!has) {
      await knex.schema.alterTable("organizations", (t) => {
        t.boolean(col).notNullable().defaultTo(false);
      });
    }
  }

  const hasTable = await knex.schema.hasTable("material_event_alerts");
  if (!hasTable) {
    await knex.schema.createTable("material_event_alerts", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.integer("practice_id")
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.string("event_type", 100).notNullable();
      t.string("severity", 30).notNullable().defaultTo("warning");
      t.timestamp("composed_at", { useTz: true }).notNullable();
      t.timestamp("sent_at", { useTz: true }).nullable();
      t.jsonb("gate_result").nullable();
      t.string("narrator_version_id", 200).nullable();
      t.string("content_hash", 64).nullable();
      t.jsonb("content_json").nullable();
      t.string("delivery_status", 30).notNullable().defaultTo("pending");
      // pending | sent | held | shadow | batched | send_failed | compose_failed | quiet_hours
      t.string("message_id", 200).nullable();
      t.timestamp("owner_open_ts", { useTz: true }).nullable();
      t.string("owner_action_taken", 30).nullable();
      // respond | ignore | defer_to_digest | null
      t.jsonb("source_signals").nullable();
      t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    });

    await knex.raw(
      "CREATE INDEX idx_material_event_alerts_practice_id ON material_event_alerts(practice_id)"
    );
    await knex.raw(
      "CREATE INDEX idx_material_event_alerts_event_type ON material_event_alerts(event_type)"
    );
    await knex.raw(
      "CREATE INDEX idx_material_event_alerts_composed_at ON material_event_alerts(composed_at)"
    );
    await knex.raw(
      "CREATE INDEX idx_material_event_alerts_delivery_status ON material_event_alerts(delivery_status)"
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS idx_material_event_alerts_practice_id");
  await knex.raw("DROP INDEX IF EXISTS idx_material_event_alerts_event_type");
  await knex.raw("DROP INDEX IF EXISTS idx_material_event_alerts_composed_at");
  await knex.raw(
    "DROP INDEX IF EXISTS idx_material_event_alerts_delivery_status"
  );
  await knex.schema.dropTableIfExists("material_event_alerts");

  const flagCols = [
    "copy_rewrite_enabled",
    "material_event_alerts_enabled",
    "upgrade_existing_enabled",
  ];
  for (const col of flagCols) {
    const has = await knex.schema.hasColumn("organizations", col);
    if (has) {
      await knex.schema.alterTable("organizations", (t) => t.dropColumn(col));
    }
  }
}
