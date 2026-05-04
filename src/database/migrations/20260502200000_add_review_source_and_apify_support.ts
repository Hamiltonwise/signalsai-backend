import type { Knex } from "knex";

/**
 * Add `source` discriminator and `place_id` to website_builder.reviews
 * so Apify-scraped reviews can coexist with OAuth-synced reviews.
 *
 * - `source`: 'oauth' (default, existing rows) or 'apify'
 * - `place_id`: Google place_id for Apify reviews (nullable)
 * - `location_id`: made nullable (Apify reviews may not resolve to a location)
 * - `google_review_name`: made nullable (Apify reviews don't have this)
 * - New dedup indexes per source
 */

export async function up(knex: Knex): Promise<void> {
  // 1. Add source column with default so existing rows backfill automatically
  await knex.raw(`
    ALTER TABLE website_builder.reviews
      ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'oauth'
  `);
  await knex.raw(`
    ALTER TABLE website_builder.reviews
      ADD CONSTRAINT reviews_source_check
        CHECK (source IN ('oauth', 'apify'))
  `);

  // 2. Add place_id column
  await knex.raw(`
    ALTER TABLE website_builder.reviews
      ADD COLUMN place_id TEXT
  `);

  // 3. Make location_id nullable
  await knex.raw(`
    ALTER TABLE website_builder.reviews
      ALTER COLUMN location_id DROP NOT NULL
  `);

  // 4. Make google_review_name nullable
  await knex.raw(`
    ALTER TABLE website_builder.reviews
      ALTER COLUMN google_review_name DROP NOT NULL
  `);

  // 5. Drop old unique index on google_review_name
  await knex.raw(`
    DROP INDEX IF EXISTS idx_reviews_google_name
  `);

  // 6. New unique index for OAuth reviews (google_review_name must be unique when present)
  await knex.raw(`
    CREATE UNIQUE INDEX idx_reviews_oauth_google_name
      ON website_builder.reviews (google_review_name)
      WHERE google_review_name IS NOT NULL
  `);

  // 7. Composite unique index for Apify dedup
  await knex.raw(`
    CREATE UNIQUE INDEX idx_reviews_apify_dedup
      ON website_builder.reviews (place_id, reviewer_name, review_created_at)
      WHERE source = 'apify'
  `);

  // 8. Index for querying by place_id
  await knex.raw(`
    CREATE INDEX idx_reviews_place_id
      ON website_builder.reviews (place_id)
      WHERE place_id IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_reviews_place_id`);
  await knex.raw(`DROP INDEX IF EXISTS idx_reviews_apify_dedup`);
  await knex.raw(`DROP INDEX IF EXISTS idx_reviews_oauth_google_name`);

  // Restore original unique index
  // Delete any apify rows first (they have null google_review_name)
  await knex.raw(`
    DELETE FROM website_builder.reviews WHERE source = 'apify'
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX idx_reviews_google_name
      ON website_builder.reviews (google_review_name)
  `);

  // Restore NOT NULL constraints
  await knex.raw(`
    ALTER TABLE website_builder.reviews
      ALTER COLUMN google_review_name SET NOT NULL
  `);
  await knex.raw(`
    ALTER TABLE website_builder.reviews
      ALTER COLUMN location_id SET NOT NULL
  `);

  await knex.raw(`
    ALTER TABLE website_builder.reviews
      DROP COLUMN IF EXISTS place_id
  `);
  await knex.raw(`
    ALTER TABLE website_builder.reviews
      DROP CONSTRAINT IF EXISTS reviews_source_check
  `);
  await knex.raw(`
    ALTER TABLE website_builder.reviews
      DROP COLUMN IF EXISTS source
  `);
}
