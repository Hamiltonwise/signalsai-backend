import type { Knex } from "knex";

/**
 * Migration: create pm_task_attachments
 *
 * Stores per-task file metadata. Actual file bytes live in S3 under
 * pm-attachments/{task_id}/{uuid}-{sanitized-filename}. Row is the source of
 * truth for uploader, filename, mime type, and size; S3 stores only the bytes.
 *
 * FK to pm_tasks is ON DELETE CASCADE — when a task is deleted, its attachment
 * rows are removed automatically. S3 object cleanup is handled in the delete
 * task controller (DB cascade does not touch S3).
 */
export async function up(knex: Knex): Promise<void> {
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
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("pm_task_attachments");
}
