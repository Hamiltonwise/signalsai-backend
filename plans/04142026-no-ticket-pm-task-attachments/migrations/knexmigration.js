/**
 * Migration: create pm_task_attachments
 *
 * Creates the table that stores per-task file metadata. Actual file bytes
 * live in S3 under pm-attachments/{task_id}/{uuid}-{sanitized-filename}.
 *
 * TODO: fill during execution — copy this into
 *   src/database/migrations/20260414000001_create_pm_task_attachments.ts
 * and convert to TS.
 */

exports.up = async function (knex) {
  await knex.schema.createTable("pm_task_attachments", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("task_id")
      .notNullable()
      .references("id")
      .inTable("pm_tasks")
      .onDelete("CASCADE");
    t.integer("uploaded_by").notNullable();
    t.string("filename", 500).notNullable();
    t.string("s3_key", 1000).notNullable().unique();
    t.string("mime_type", 100).notNullable();
    t.bigInteger("size_bytes").notNullable();
    t.timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await knex.raw(
    "CREATE INDEX idx_pm_task_attachments_task ON pm_task_attachments(task_id, created_at DESC)"
  );
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("pm_task_attachments");
};
