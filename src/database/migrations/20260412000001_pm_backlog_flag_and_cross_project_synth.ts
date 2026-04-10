import type { Knex } from "knex";

/**
 * PM Tool: is_backlog flag + cross-project AI synth support.
 *
 * 1. Adds `is_backlog` BOOLEAN to `pm_columns` and backfills existing
 *    Backlog rows. All future backend code reads this flag instead of
 *    matching `name === "Backlog"`.
 * 2. Relaxes `pm_ai_synth_batches.project_id` to nullable so cross-project
 *    batches (no up-front project) can be created.
 * 3. Adds `pm_ai_synth_batch_tasks.target_project_id` so each proposed
 *    task can be routed to a specific project at approval time.
 *
 * Forward-compatible / additive. See
 * plans/04112026-no-ticket-pm-bulk-move-cross-project-synth/migrations/
 * for the raw DDL + MSSQL translation.
 */
export async function up(knex: Knex): Promise<void> {
  // 1. pm_columns: add is_backlog flag
  await knex.schema.alterTable("pm_columns", (t) => {
    t.boolean("is_backlog").notNullable().defaultTo(false);
  });

  // Backfill: mark existing Backlog columns (identified by legacy name check —
  // the ONLY place the name literal is tolerated going forward).
  await knex("pm_columns").where({ name: "Backlog" }).update({ is_backlog: true });

  // Partial index: fast "find backlog column for project X" lookups.
  await knex.raw(
    "CREATE INDEX idx_pm_columns_is_backlog ON pm_columns (project_id) WHERE is_backlog = TRUE"
  );

  // 2. pm_ai_synth_batches: relax project_id to nullable
  await knex.schema.alterTable("pm_ai_synth_batches", (t) => {
    t.uuid("project_id").nullable().alter();
  });

  // 3. pm_ai_synth_batch_tasks: add target_project_id FK
  await knex.schema.alterTable("pm_ai_synth_batch_tasks", (t) => {
    t.uuid("target_project_id")
      .nullable()
      .references("id")
      .inTable("pm_projects")
      .onDelete("SET NULL");
  });
}

export async function down(knex: Knex): Promise<void> {
  // Drop target_project_id FK column
  await knex.schema.alterTable("pm_ai_synth_batch_tasks", (t) => {
    t.dropColumn("target_project_id");
  });

  // Re-assert NOT NULL on project_id — only if no cross-project batches exist.
  const orphans = await knex("pm_ai_synth_batches").whereNull("project_id").count("* as count");
  const orphanCount = parseInt((orphans[0] as any).count, 10);
  if (orphanCount > 0) {
    throw new Error(
      `Cannot restore NOT NULL on pm_ai_synth_batches.project_id: ${orphanCount} cross-project batches exist with NULL project_id. Resolve first.`
    );
  }
  await knex.schema.alterTable("pm_ai_synth_batches", (t) => {
    t.uuid("project_id").notNullable().alter();
  });

  // Drop partial index and is_backlog column
  await knex.raw("DROP INDEX IF EXISTS idx_pm_columns_is_backlog");
  await knex.schema.alterTable("pm_columns", (t) => {
    t.dropColumn("is_backlog");
  });
}
