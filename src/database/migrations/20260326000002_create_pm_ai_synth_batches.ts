import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("pm_ai_synth_batches", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("project_id").notNullable().references("id").inTable("pm_projects").onDelete("CASCADE");
    t.text("source_text");
    t.string("source_filename", 255);
    t.string("status", 20).defaultTo("synthesizing");
    t.integer("total_proposed").defaultTo(0);
    t.integer("total_approved").defaultTo(0);
    t.integer("total_rejected").defaultTo(0);
    t.integer("created_by");
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("pm_ai_synth_batch_tasks", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("batch_id").notNullable().references("id").inTable("pm_ai_synth_batches").onDelete("CASCADE");
    t.string("title", 500).notNullable();
    t.text("description");
    t.string("priority", 5);
    t.string("deadline_hint", 100);
    t.string("status", 20).defaultTo("pending");
    t.uuid("created_task_id");
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw("CREATE INDEX idx_pm_batches_project ON pm_ai_synth_batches(project_id, created_at DESC)");
  await knex.raw("CREATE INDEX idx_pm_batch_tasks_batch ON pm_ai_synth_batch_tasks(batch_id, status)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("pm_ai_synth_batch_tasks");
  await knex.schema.dropTableIfExists("pm_ai_synth_batches");
}
