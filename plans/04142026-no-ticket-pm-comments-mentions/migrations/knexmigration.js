/**
 * Migration: pm_task_comments + extend pm_notifications.type CHECK constraint
 *
 * (a) Creates pm_task_comments for threaded flat comments on tasks.
 * (b) Extends the existing CHECK constraint on pm_notifications.type to
 *     allow the two new notification types used by the comments feature.
 *
 * Note: Knex .enum() on PG creates a named CHECK constraint on a VARCHAR —
 * this is NOT a native PG enum, so we do not use ALTER TYPE.
 *
 * TODO: fill during execution — port this to
 *   src/database/migrations/20260414000002_pm_comments_and_notification_types.ts
 */

exports.up = async function (knex) {
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
    t.specificType("mentions", "INTEGER[]").notNullable().defaultTo("{}");
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

  // (b) Extend pm_notifications.type CHECK constraint
  // Locate existing CHECK constraint dynamically (Knex names it like
  // pm_notifications_type_check but we look it up to be safe).
  const rows = await knex.raw(`
    SELECT conname
      FROM pg_constraint
      JOIN pg_class ON pg_class.oid = pg_constraint.conrelid
     WHERE pg_class.relname = 'pm_notifications'
       AND pg_constraint.contype = 'c'
       AND pg_get_constraintdef(pg_constraint.oid) ILIKE '%type%';
  `);

  const constraintName = rows.rows[0]?.conname;
  if (constraintName) {
    await knex.raw(
      `ALTER TABLE pm_notifications DROP CONSTRAINT IF EXISTS "${constraintName}"`
    );
  }

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
};

exports.down = async function (knex) {
  // Reverse extend (back to original 3 values). If rows exist with new
  // types, the re-added CHECK will fail — that is intentional; operator
  // must purge those rows first.
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

  await knex.raw(
    "DROP TRIGGER IF EXISTS pm_task_comments_updated_at ON pm_task_comments"
  );
  await knex.schema.dropTableIfExists("pm_task_comments");
};
