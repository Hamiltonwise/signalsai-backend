import type { Knex } from "knex";

/**
 * Create `website_builder.ai_cost_events` — one row per LLM request.
 *
 * Nested tool-call invocations (e.g. select_image inside runWithTools) log their
 * own row with `parent_event_id` set to the top-level event's id so totals can
 * roll up per logical run.
 *
 * `estimated_cost_usd` is frozen at write time using the MODEL_PRICING map in
 * `src/services/ai-cost/pricing.ts` — refreshing prices later does NOT rewrite
 * historical rows.
 *
 * NOTE: `project_id` is nullable so non-website vendors (e.g. minds-chat) can
 * share this table. We still FK-cascade on delete when it IS set, so removing a
 * project cleans up its cost history.
 */
export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema
    .withSchema("website_builder")
    .hasTable("ai_cost_events");
  if (hasTable) return;

  await knex.schema
    .withSchema("website_builder")
    .createTable("ai_cost_events", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.uuid("project_id")
        .nullable()
        .references("id")
        .inTable("website_builder.projects")
        .onDelete("CASCADE");
      t.text("event_type").notNullable();
      t.text("vendor").notNullable().defaultTo("anthropic");
      t.text("model").notNullable();
      t.integer("input_tokens").notNullable().defaultTo(0);
      t.integer("output_tokens").notNullable().defaultTo(0);
      t.integer("cache_creation_tokens").nullable();
      t.integer("cache_read_tokens").nullable();
      t.decimal("estimated_cost_usd", 10, 6).notNullable().defaultTo(0);
      t.jsonb("metadata").nullable();
      t.uuid("parent_event_id")
        .nullable()
        .references("id")
        .inTable("website_builder.ai_cost_events")
        .onDelete("SET NULL");
      t.timestamp("created_at", { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());

      t.index(
        ["project_id", "created_at"],
        "idx_ai_cost_events_project_created",
      );
      t.index(["parent_event_id"], "idx_ai_cost_events_parent");
    });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema
    .withSchema("website_builder")
    .dropTableIfExists("ai_cost_events");
}
