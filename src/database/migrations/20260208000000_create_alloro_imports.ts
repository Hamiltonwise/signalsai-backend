import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS website_builder.alloro_imports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      filename VARCHAR(255) NOT NULL,
      display_name VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      mime_type VARCHAR(100) NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      s3_key TEXT,
      s3_bucket VARCHAR(255),
      content_hash VARCHAR(64),
      text_content TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (filename, version)
    );

    CREATE INDEX IF NOT EXISTS idx_alloro_imports_filename_status
      ON website_builder.alloro_imports (filename, status);

    CREATE INDEX IF NOT EXISTS idx_alloro_imports_type
      ON website_builder.alloro_imports (type);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS website_builder.alloro_imports;`);
}
