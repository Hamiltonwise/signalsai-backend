import type { Knex } from "knex";

/**
 * Manifest v2 Card 3 — narrator_outputs table.
 *
 * Archive of every Recipe-compliant output the Narrator composes, across
 * both Shadow and Live modes. Weekly review reads from this table for the
 * voice-check sample, Guidara 95/5 tier distribution, and data-gap rate.
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("narrator_outputs");
  if (exists) return;

  await knex.schema.createTable("narrator_outputs", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("org_id").nullable().references("id").inTable("organizations").onDelete("SET NULL");
    t.string("event_id", 64).nullable();
    t.string("event_type", 80).notNullable();
    t.string("template", 80).notNullable();
    t.text("finding").notNullable();
    t.text("dollar").nullable();
    t.text("action").notNullable();
    t.string("tier", 30).notNullable();
    t.integer("confidence").notNullable().defaultTo(0);
    t.text("data_gap_reason").nullable();
    t.boolean("voice_check_passed").notNullable().defaultTo(true);
    t.jsonb("voice_violations").nullable();
    t.string("mode", 20).notNullable().defaultTo("shadow");
    t.boolean("emit").notNullable().defaultTo(false);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw("CREATE INDEX IF NOT EXISTS idx_narrator_outputs_org ON narrator_outputs(org_id)");
  await knex.raw("CREATE INDEX IF NOT EXISTS idx_narrator_outputs_event_type ON narrator_outputs(event_type)");
  await knex.raw("CREATE INDEX IF NOT EXISTS idx_narrator_outputs_created_at ON narrator_outputs(created_at DESC)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("narrator_outputs");
}
