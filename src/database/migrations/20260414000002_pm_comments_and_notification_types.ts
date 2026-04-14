import type { Knex } from "knex";

/**
 * Migration: pm_task_comments + extend pm_notifications.type CHECK constraint.
 *
 * Two operations in one migration:
 *
 * (a) Create pm_task_comments — flat (non-threaded) markdown comments per task.
 *     `mentions` is stored as a native PG INTEGER[] (NOT re-parsed from body)
 *     so notification fan-out is deterministic on create/edit. FK to pm_tasks
 *     cascades on task delete. Trigger `pm_update_timestamp` keeps updated_at
 *     in sync, matching the pattern used by pm_tasks / pm_projects.
 *
 * (b) Extend pm_notifications.type CHECK constraint. Knex `.enum()` on
 *     PostgreSQL generates a named CHECK constraint on a VARCHAR — the
 *     constraint name follows the pattern `<table>_<column>_check`, but
 *     to be safe we look it up via pg_constraint/pg_class and drop whatever
 *     we find. If no matching constraint exists (unlikely, but would happen
 *     on a freshly-created DB with the wrong version of knex), we skip the
 *     drop and just add the new one.
 *
 *     Final allowed values:
 *       - task_assigned (existing)
 *       - task_unassigned (existing)
 *       - assignee_completed_task (existing)
 *       - mention_in_comment (new — Plan C)
 *       - task_commented (new — Plan C)
 */
export async function up(knex: Knex): Promise<void> {
  // (a) pm_task_comments
  await knex.schema.createTable("pm_task_comments", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("task_id")
      .notNullable()
      .references("id")
      .inTable("pm_tasks")
      .onDelete("CASCADE");
    t.integer("author_id").notNullable();
    t.text("body").notNullable();
    t.specificType("mentions", "INTEGER[]")
      .notNullable()
      .defaultTo(knex.raw("'{}'::integer[]"));
    t.timestamp("edited_at", { useTz: true }).nullable();
    t.timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE TRIGGER pm_task_comments_updated_at
      BEFORE UPDATE ON pm_task_comments
      FOR EACH ROW EXECUTE FUNCTION pm_update_timestamp();
  `);

  await knex.raw(
    "CREATE INDEX idx_pm_task_comments_task ON pm_task_comments(task_id, created_at ASC)"
  );

  // (b) Extend pm_notifications.type CHECK constraint.
  //
  // Locate the existing CHECK constraint on pm_notifications.type. Knex
  // typically names it <table>_<column>_check; the query below is resilient
  // to alternate names by matching on the column reference in the
  // constraint definition. PG renders CHECK x IN (...) as
  // `CHECK ((type::text = ANY (ARRAY[...])))`, so we match on `type` alone.
  const raw: any = await knex.raw(`
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'pm_notifications'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%type%'
  `);
  const constraintRows: Array<{ conname: string }> = raw.rows ?? raw;

  for (const row of constraintRows) {
    await knex.raw(
      `ALTER TABLE pm_notifications DROP CONSTRAINT IF EXISTS "${row.conname}"`
    );
  }

  // Defense in depth: drop the known-name constraint in case the lookup
  // above missed it (different PG renderings).
  await knex.raw(
    `ALTER TABLE pm_notifications DROP CONSTRAINT IF EXISTS pm_notifications_type_check`
  );

  await knex.raw(`
    ALTER TABLE pm_notifications
    ADD CONSTRAINT pm_notifications_type_check
    CHECK (type IN (
      'task_assigned',
      'task_unassigned',
      'assignee_completed_task',
      'mention_in_comment',
      'task_commented'
    ))
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Roll back (b) first — narrow the CHECK back to the original set.
  await knex.raw(
    `ALTER TABLE pm_notifications DROP CONSTRAINT IF EXISTS pm_notifications_type_check`
  );
  await knex.raw(`
    ALTER TABLE pm_notifications
    ADD CONSTRAINT pm_notifications_type_check
    CHECK (type IN (
      'task_assigned',
      'task_unassigned',
      'assignee_completed_task'
    ))
  `);

  // Roll back (a)
  await knex.raw(
    "DROP TRIGGER IF EXISTS pm_task_comments_updated_at ON pm_task_comments"
  );
  await knex.schema.dropTableIfExists("pm_task_comments");
}
