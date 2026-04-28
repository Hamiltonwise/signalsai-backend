/**
 * Practice Ranking v2 — User-Curated Competitor Lists
 *
 * Plan: plans/04282026-no-ticket-practice-ranking-v2-user-curated-competitors/spec.md
 *
 * NOTE: The live migration is the TypeScript file at
 *   src/database/migrations/20260428000001_practice_ranking_v2_curated_competitors.ts
 * This .js mirror exists per the CLAUDE.md migrations-folder convention.
 */

const { CronExpressionParser } = require("cron-parser");

/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function up(knex) {
  // 1. Drop dead competitor_cache table.
  await knex.schema.dropTableIfExists("competitor_cache");

  // 2. Create location_competitors
  await knex.schema.createTable("location_competitors", (t) => {
    t.bigIncrements("id").primary();
    t.integer("location_id")
      .notNullable()
      .references("id")
      .inTable("locations")
      .onDelete("CASCADE");
    t.string("place_id", 255).notNullable();
    t.string("name", 255).notNullable();
    t.text("address").nullable();
    t.string("primary_type", 100).nullable();
    t.decimal("lat", 10, 7).nullable();
    t.decimal("lng", 10, 7).nullable();
    t.string("source", 20).notNullable();
    t.timestamp("added_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.integer("added_by_user_id")
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
    t.timestamp("removed_at", { useTz: true }).nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE location_competitors
      ADD CONSTRAINT location_competitors_source_check
        CHECK (source IN ('initial_scrape', 'user_added'))
  `);
  await knex.raw(`
    CREATE INDEX idx_location_competitors_location_id
      ON location_competitors(location_id)
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX uniq_location_competitors_active
      ON location_competitors(location_id, place_id)
      WHERE removed_at IS NULL
  `);

  // 3. Add v2 onboarding columns to locations
  await knex.schema.alterTable("locations", (t) => {
    t.string("location_competitor_onboarding_status", 20)
      .notNullable()
      .defaultTo("pending");
    t.timestamp("location_competitor_onboarding_finalized_at", { useTz: true })
      .nullable();
  });
  await knex.raw(`
    ALTER TABLE locations
      ADD CONSTRAINT locations_competitor_onboarding_status_check
        CHECK (location_competitor_onboarding_status IN ('pending', 'curating', 'finalized'))
  `);

  // 4. Tag existing practice_rankings rows as v1 legacy
  await knex.schema.alterTable("practice_rankings", (t) => {
    t.string("competitor_source", 30).nullable();
  });
  await knex.raw(`
    ALTER TABLE practice_rankings
      ADD CONSTRAINT practice_rankings_competitor_source_check
        CHECK (competitor_source IS NULL OR competitor_source IN (
          'curated', 'discovered_v2_pending', 'discovered_v1_legacy'
        ))
  `);
  await knex("practice_rankings")
    .whereNull("competitor_source")
    .update({ competitor_source: "discovered_v1_legacy" });

  // 5. Switch Practice Ranking schedule to calendar-aligned cron (1st & 15th UTC)
  const cronExpression = "0 0 1,15 * *";
  const nextRunAt = CronExpressionParser
    .parse(cronExpression, { currentDate: new Date(), tz: "UTC" })
    .next()
    .toDate();
  await knex("schedules")
    .where({ agent_key: "ranking" })
    .update({
      schedule_type: "cron",
      cron_expression: cronExpression,
      interval_days: null,
      timezone: "UTC",
      next_run_at: nextRunAt,
      updated_at: new Date(),
    });
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function down(knex) {
  // Reverse order of up()

  // 5. Revert schedule
  const fifteenDaysFromNow = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
  await knex("schedules")
    .where({ agent_key: "ranking" })
    .update({
      schedule_type: "interval_days",
      cron_expression: null,
      interval_days: 15,
      timezone: "UTC",
      next_run_at: fifteenDaysFromNow,
      updated_at: new Date(),
    });

  // 4. Drop competitor_source from practice_rankings
  await knex.raw(`
    ALTER TABLE practice_rankings
      DROP CONSTRAINT IF EXISTS practice_rankings_competitor_source_check
  `);
  await knex.schema.alterTable("practice_rankings", (t) => {
    t.dropColumn("competitor_source");
  });

  // 3. Drop onboarding columns from locations
  await knex.raw(`
    ALTER TABLE locations
      DROP CONSTRAINT IF EXISTS locations_competitor_onboarding_status_check
  `);
  await knex.schema.alterTable("locations", (t) => {
    t.dropColumn("location_competitor_onboarding_finalized_at");
    t.dropColumn("location_competitor_onboarding_status");
  });

  // 2. Drop location_competitors table
  await knex.raw(
    `ALTER TABLE IF EXISTS location_competitors
       DROP CONSTRAINT IF EXISTS location_competitors_source_check`
  );
  await knex.schema.dropTableIfExists("location_competitors");

  // 1. competitor_cache is not recreated — it was dead code on the live path.
};
