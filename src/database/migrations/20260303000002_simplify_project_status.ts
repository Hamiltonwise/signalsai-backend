import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    -- 1. Create new simplified enum
    DO $$ BEGIN
      CREATE TYPE website_builder.project_status_v2 AS ENUM ('CREATED', 'IN_PROGRESS', 'LIVE');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;

    -- 2. Add temp column with new type
    ALTER TABLE website_builder.projects
      ADD COLUMN IF NOT EXISTS status_v2 website_builder.project_status_v2 DEFAULT 'CREATED';

    -- 3. Migrate existing data
    UPDATE website_builder.projects SET status_v2 = 'CREATED'
      WHERE status = 'CREATED';

    UPDATE website_builder.projects SET status_v2 = 'IN_PROGRESS'
      WHERE status IN ('GBP_SELECTED', 'GBP_SCRAPED', 'WEBSITE_SCRAPED', 'IMAGES_ANALYZED', 'HTML_GENERATED');

    UPDATE website_builder.projects SET status_v2 = 'LIVE'
      WHERE status = 'READY';

    -- 4. Drop old status column
    ALTER TABLE website_builder.projects DROP COLUMN status;

    -- 5. Rename new column to status
    ALTER TABLE website_builder.projects RENAME COLUMN status_v2 TO status;

    -- 6. Re-apply NOT NULL and default
    ALTER TABLE website_builder.projects ALTER COLUMN status SET NOT NULL;
    ALTER TABLE website_builder.projects ALTER COLUMN status SET DEFAULT 'CREATED';

    -- 7. Swap enum type names
    DROP TYPE website_builder.project_status;
    ALTER TYPE website_builder.project_status_v2 RENAME TO project_status;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    -- 1. Recreate old enum
    DO $$ BEGIN
      CREATE TYPE website_builder.project_status_old AS ENUM (
        'CREATED', 'GBP_SELECTED', 'GBP_SCRAPED', 'WEBSITE_SCRAPED',
        'IMAGES_ANALYZED', 'HTML_GENERATED', 'READY'
      );
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;

    -- 2. Add temp column
    ALTER TABLE website_builder.projects
      ADD COLUMN IF NOT EXISTS status_old website_builder.project_status_old DEFAULT 'CREATED';

    -- 3. Reverse migrate
    UPDATE website_builder.projects SET status_old = 'CREATED'     WHERE status = 'CREATED';
    UPDATE website_builder.projects SET status_old = 'HTML_GENERATED' WHERE status = 'IN_PROGRESS';
    UPDATE website_builder.projects SET status_old = 'READY'        WHERE status = 'LIVE';

    -- 4. Swap
    ALTER TABLE website_builder.projects DROP COLUMN status;
    ALTER TABLE website_builder.projects RENAME COLUMN status_old TO status;
    ALTER TABLE website_builder.projects ALTER COLUMN status SET NOT NULL;
    ALTER TABLE website_builder.projects ALTER COLUMN status SET DEFAULT 'CREATED';

    -- 5. Rename types
    DROP TYPE website_builder.project_status;
    ALTER TYPE website_builder.project_status_old RENAME TO project_status;
  `);
}
