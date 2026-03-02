import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Add artifact_attachment_type to mind_skills
  await knex.schema.withSchema("minds").alterTable("mind_skills", (table) => {
    table.text("artifact_attachment_type").nullable();
  });

  // Add artifact attachment fields to skill_work_runs
  await knex.schema.withSchema("minds").alterTable("skill_work_runs", (table) => {
    table.text("artifact_attachment_type").nullable();
    table.text("artifact_attachment_url").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema("minds").alterTable("skill_work_runs", (table) => {
    table.dropColumn("artifact_attachment_url");
    table.dropColumn("artifact_attachment_type");
  });

  await knex.schema.withSchema("minds").alterTable("mind_skills", (table) => {
    table.dropColumn("artifact_attachment_type");
  });
}
