import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Add configurable recipients column to projects
  await knex.schema.alterTable("website_builder.projects", (table) => {
    table.jsonb("recipients").defaultTo("[]").notNullable();
  });

  // Create form_submissions table
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS website_builder.form_submissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES website_builder.projects(id) ON DELETE CASCADE,
      form_name VARCHAR(255) NOT NULL,
      contents JSONB NOT NULL,
      recipients_sent_to TEXT[] NOT NULL DEFAULT '{}',
      submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      is_read BOOLEAN DEFAULT FALSE
    );

    CREATE INDEX idx_form_submissions_project_id
      ON website_builder.form_submissions(project_id);

    CREATE INDEX idx_form_submissions_submitted_at
      ON website_builder.form_submissions(submitted_at DESC);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TABLE IF EXISTS website_builder.form_submissions;");
  await knex.schema.alterTable("website_builder.projects", (table) => {
    table.dropColumn("recipients");
  });
}
