/**
 * PM Tool: is_backlog flag + cross-project AI synth support
 *
 * This is the canonical form of the migration that will be committed to
 * src/database/migrations/ during execution (T1) as:
 *   20260412000001_pm_backlog_flag_and_cross_project_synth.ts
 *
 * This .js scaffold exists under the plan folder per the /plans convention
 * (migrations/ subfolder with mssql/pgsql/knex variants). The committed
 * TypeScript version will match this logic exactly.
 *
 * Target: PostgreSQL (via pg driver).
 * Forward-compatible / additive. See pgsql.sql for the raw DDL equivalent
 * and rationale for each step.
 */

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  // 1. pm_columns: add is_backlog flag
  await knex.schema.alterTable("pm_columns", (t) => {
    t.boolean("is_backlog").notNullable().defaultTo(false);
  });

  // Backfill: mark existing Backlog columns (identified by legacy name check —
  // the ONLY place in the codebase that continues to tolerate the name literal).
  await knex("pm_columns").where({ name: "Backlog" }).update({ is_backlog: true });

  // Partial index: fast "find backlog column for project X" lookups.
  await knex.raw(
    "CREATE INDEX idx_pm_columns_is_backlog ON pm_columns (project_id) WHERE is_backlog = TRUE"
  );

  // 2. pm_ai_synth_batches: relax project_id to nullable for cross-project batches
  await knex.schema.alterTable("pm_ai_synth_batches", (t) => {
    t.uuid("project_id").nullable().alter();
  });

  // 3. pm_ai_synth_batch_tasks: add target_project_id FK for cross-project approval
  await knex.schema.alterTable("pm_ai_synth_batch_tasks", (t) => {
    t.uuid("target_project_id")
      .nullable()
      .references("id")
      .inTable("pm_projects")
      .onDelete("SET NULL");
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  // Drop target_project_id FK column
  await knex.schema.alterTable("pm_ai_synth_batch_tasks", (t) => {
    t.dropColumn("target_project_id");
  });

  // Re-assert NOT NULL on project_id — only if no cross-project batches exist.
  const orphans = await knex("pm_ai_synth_batches").whereNull("project_id").count("* as count");
  const orphanCount = parseInt(orphans[0].count, 10);
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
};
