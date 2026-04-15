import type { Knex } from "knex";

/**
 * Leadgen tracking overhaul.
 *
 * Adds conversion + user-link + parsed User-Agent columns to `leadgen_sessions`,
 * plus a supporting composite index on `leadgen_events` for the cumulative
 * funnel aggregator rewrite (T1).
 *
 *   leadgen_sessions
 *     + converted_at  TIMESTAMPTZ  NULL
 *     + user_id       INTEGER      NULL REFERENCES users(id) ON DELETE SET NULL
 *     + browser       TEXT         NULL
 *     + os            TEXT         NULL
 *     + device_type   TEXT         NULL
 *
 *   indexes
 *     + idx_leadgen_sessions_user_id          ON leadgen_sessions(user_id)
 *     + idx_leadgen_sessions_converted        ON leadgen_sessions(converted_at)
 *         (partial: WHERE converted_at IS NOT NULL — stays small + hot for stats)
 *     + idx_leadgen_events_session_event      ON leadgen_events(session_id, event_name)
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("leadgen_sessions", (table) => {
    table.timestamp("converted_at", { useTz: true }).nullable();
    table
      .integer("user_id")
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
    table.text("browser").nullable();
    table.text("os").nullable();
    table.text("device_type").nullable();

    table.index(["user_id"], "idx_leadgen_sessions_user_id");
  });

  // Partial index on converted_at — only indexes rows that converted.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_leadgen_sessions_converted
      ON leadgen_sessions (converted_at)
      WHERE converted_at IS NOT NULL;
  `);

  // Supporting index for the cumulative-funnel query in T1 (per-session
  // MAX(event_name ordinal) lookup).
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_leadgen_events_session_event
      ON leadgen_events (session_id, event_name);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_leadgen_events_session_event`);
  await knex.raw(`DROP INDEX IF EXISTS idx_leadgen_sessions_converted`);

  await knex.schema.alterTable("leadgen_sessions", (table) => {
    table.dropIndex(["user_id"], "idx_leadgen_sessions_user_id");
    table.dropColumn("device_type");
    table.dropColumn("os");
    table.dropColumn("browser");
    table.dropForeign(["user_id"]);
    table.dropColumn("user_id");
    table.dropColumn("converted_at");
  });
}
