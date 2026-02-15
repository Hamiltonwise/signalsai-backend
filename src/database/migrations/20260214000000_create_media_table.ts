/**
 * Migration: Create website_builder.media table for project media uploads
 *
 * Adds support for:
 * - Image uploads with WebP conversion and thumbnail generation
 * - Video uploads (stored as-is, no thumbnail extraction)
 * - PDF uploads
 * - S3 storage with quota tracking (5GB per project)
 * - Usage tracking for media referenced in pages
 */

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS website_builder.media (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES website_builder.projects(id) ON DELETE CASCADE,

      filename VARCHAR(255) NOT NULL,
      display_name VARCHAR(255) NOT NULL,
      s3_key TEXT NOT NULL,
      s3_url TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      alt_text TEXT,
      width INTEGER,
      height INTEGER,

      thumbnail_s3_key TEXT,
      thumbnail_s3_url TEXT,

      original_mime_type VARCHAR(100),
      compressed BOOLEAN DEFAULT FALSE,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_media_project_id ON website_builder.media(project_id);
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_media_mime_type ON website_builder.media(mime_type);
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_media_created_at ON website_builder.media(created_at);
  `);

  console.log("[Migration] Created website_builder.media table");
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS website_builder.media;`);
  console.log("[Migration] Dropped website_builder.media table");
}
