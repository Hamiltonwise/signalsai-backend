import type { Knex } from "knex";

/**
 * Creates the `leadgen_sessions` table — one row per anonymous session on the
 * leadgen audit tool. Captures acquisition context (referrer, utm_*), funnel
 * position (`final_stage`), and PII once the user submits email.
 *
 * Joins to `audit_processes.id` (UUID) once the user triggers an audit.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("leadgen_sessions", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("audit_id").nullable();
    table.text("email").nullable();
    table.text("domain").nullable();
    table.text("practice_search_string").nullable();
    table.text("referrer").nullable();
    table.text("utm_source").nullable();
    table.text("utm_medium").nullable();
    table.text("utm_campaign").nullable();
    table.text("utm_term").nullable();
    table.text("utm_content").nullable();
    table.string("final_stage", 48).notNullable().defaultTo("landed");
    table.boolean("completed").notNullable().defaultTo(false);
    table.boolean("abandoned").notNullable().defaultTo(false);
    table
      .timestamp("first_seen_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("last_seen_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .foreign("audit_id")
      .references("audit_processes.id")
      .onDelete("SET NULL");

    table.index("audit_id", "idx_leadgen_sessions_audit_id");
    table.index("email", "idx_leadgen_sessions_email");
    table.index("final_stage", "idx_leadgen_sessions_final_stage");
  });

  // DESC ordering needs raw — knex index() doesn't expose direction for btree.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_leadgen_sessions_created_at
      ON leadgen_sessions (created_at DESC);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("leadgen_sessions");
}
