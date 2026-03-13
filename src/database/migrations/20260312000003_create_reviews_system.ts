import type { Knex } from "knex";

/**
 * Create the GBP Reviews system:
 * - reviews (per location, synced from Google Business Profile)
 * - review_blocks (per template, rendering templates for review shortcodes)
 */

export async function up(knex: Knex): Promise<void> {
  // 1. Reviews
  await knex.raw(`
    CREATE TABLE website_builder.reviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      google_review_name TEXT NOT NULL,
      stars SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
      text TEXT,
      reviewer_name TEXT,
      reviewer_photo_url TEXT,
      is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
      review_created_at TIMESTAMPTZ,
      has_reply BOOLEAN NOT NULL DEFAULT FALSE,
      reply_text TEXT,
      reply_date TIMESTAMPTZ,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX idx_reviews_google_name ON website_builder.reviews(google_review_name);
    CREATE INDEX idx_reviews_location_stars ON website_builder.reviews(location_id, stars);
    CREATE INDEX idx_reviews_location_date ON website_builder.reviews(location_id, review_created_at DESC);
  `);

  // 2. Review Blocks
  await knex.raw(`
    CREATE TABLE website_builder.review_blocks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id UUID NOT NULL REFERENCES website_builder.templates(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) NOT NULL,
      description TEXT,
      sections JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(template_id, slug)
    );
    CREATE INDEX idx_review_blocks_template_id ON website_builder.review_blocks(template_id);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS website_builder.review_blocks CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS website_builder.reviews CASCADE`);
}
