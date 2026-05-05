import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE website_builder.clarity_data (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES website_builder.projects(id) ON DELETE CASCADE,
      report_date DATE NOT NULL,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT clarity_data_unique_project_date
        UNIQUE (project_id, report_date)
    );

    CREATE INDEX idx_clarity_data_project_date
      ON website_builder.clarity_data(project_id, report_date DESC);

    CREATE TABLE website_builder.rybbit_data (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES website_builder.projects(id) ON DELETE CASCADE,
      report_date DATE NOT NULL,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT rybbit_data_unique_project_date
        UNIQUE (project_id, report_date)
    );

    CREATE INDEX idx_rybbit_data_project_date
      ON website_builder.rybbit_data(project_id, report_date DESC);

    CREATE TABLE website_builder.gsc_data (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES website_builder.projects(id) ON DELETE CASCADE,
      report_date DATE NOT NULL,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT gsc_data_unique_project_date
        UNIQUE (project_id, report_date)
    );

    CREATE INDEX idx_gsc_data_project_date
      ON website_builder.gsc_data(project_id, report_date DESC);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP TABLE IF EXISTS website_builder.gsc_data CASCADE;
    DROP TABLE IF EXISTS website_builder.rybbit_data CASCADE;
    DROP TABLE IF EXISTS website_builder.clarity_data CASCADE;
  `);
}
