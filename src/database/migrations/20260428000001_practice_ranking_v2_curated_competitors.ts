import { Knex } from "knex";
import { CronExpressionParser } from "cron-parser";

/**
 * Practice Ranking v2 — User-Curated Competitor Lists
 *
 * Spec: plans/04282026-no-ticket-practice-ranking-v2-user-curated-competitors/spec.md
 *
 * 1. Drops the dead `competitor_cache` table — bypassed by the location-bias
 *    rewrite (see service.ranking-pipeline.ts:421 comment).
 * 2. Creates `location_competitors` — per-location curated competitor list,
 *    soft-deletable via `removed_at`.
 * 3. Adds `location_competitor_onboarding_status` and
 *    `location_competitor_onboarding_finalized_at` columns to `locations` to
 *    track per-location v2 onboarding lifecycle. Naming is verbose by request
 *    to disambiguate from the existing organization-level onboarding.
 * 4. Adds `competitor_source` to `practice_rankings` and backfills existing
 *    rows as `'discovered_v1_legacy'` so the dashboard can label history.
 * 5. Updates the existing `agent_key='ranking'` row in `schedules` from the
 *    drifting `interval_days=15` to a calendar-aligned cron `0 0 1,15 * *`
 *    in UTC.
 *
 * Reference analog: 20260412000001_add_search_position_to_practice_rankings.ts
 */
export async function up(knex: Knex): Promise<void> {
  // -------------------------------------------------------------------------
  // 1. Drop dead competitor_cache table
  // -------------------------------------------------------------------------
  await knex.schema.dropTableIfExists("competitor_cache");

  // -------------------------------------------------------------------------
  // 2. Create location_competitors table
  // -------------------------------------------------------------------------
  await knex.schema.createTable("location_competitors", (table) => {
    table.bigIncrements("id").primary();
    table
      .integer("location_id")
      .notNullable()
      .references("id")
      .inTable("locations")
      .onDelete("CASCADE");
    table.string("place_id", 255).notNullable();
    table.string("name", 255).notNullable();
    table.text("address").nullable();
    table.string("primary_type", 100).nullable();
    table.decimal("lat", 10, 7).nullable();
    table.decimal("lng", 10, 7).nullable();
    table.string("source", 20).notNullable();
    table.timestamp("added_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table
      .integer("added_by_user_id")
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
    table.timestamp("removed_at", { useTz: true }).nullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
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

  // Partial unique: only one active row per (location, place) pair. Allows
  // multiple historical soft-deleted rows for audit / re-add tracking.
  await knex.raw(`
    CREATE UNIQUE INDEX uniq_location_competitors_active
      ON location_competitors(location_id, place_id)
      WHERE removed_at IS NULL
  `);

  // -------------------------------------------------------------------------
  // 3. Add v2 onboarding columns to locations
  // -------------------------------------------------------------------------
  await knex.schema.alterTable("locations", (table) => {
    table
      .string("location_competitor_onboarding_status", 20)
      .notNullable()
      .defaultTo("pending");
    table
      .timestamp("location_competitor_onboarding_finalized_at", { useTz: true })
      .nullable();
  });

  await knex.raw(`
    ALTER TABLE locations
      ADD CONSTRAINT locations_competitor_onboarding_status_check
        CHECK (location_competitor_onboarding_status IN ('pending', 'curating', 'finalized'))
  `);

  // -------------------------------------------------------------------------
  // 4. Add competitor_source to practice_rankings + backfill
  // -------------------------------------------------------------------------
  await knex.schema.alterTable("practice_rankings", (table) => {
    table.string("competitor_source", 30).nullable();
  });

  await knex.raw(`
    ALTER TABLE practice_rankings
      ADD CONSTRAINT practice_rankings_competitor_source_check
        CHECK (competitor_source IS NULL OR competitor_source IN (
          'curated',
          'discovered_v2_pending',
          'discovered_v1_legacy'
        ))
  `);

  await knex("practice_rankings")
    .whereNull("competitor_source")
    .update({ competitor_source: "discovered_v1_legacy" });

  // -------------------------------------------------------------------------
  // 5. Update schedules row for agent_key='ranking'
  //    interval_days=15 (drifting) → cron 0 0 1,15 * * (calendar 1st & 15th UTC)
  // -------------------------------------------------------------------------
  const cronExpression = "0 0 1,15 * *";
  const nextRunAt = CronExpressionParser.parse(cronExpression, {
    currentDate: new Date(),
    tz: "UTC",
  })
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
}

export async function down(knex: Knex): Promise<void> {
  // Reverse order of up()

  // 5. Revert schedules row to interval_days=15
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
  await knex.schema.alterTable("practice_rankings", (table) => {
    table.dropColumn("competitor_source");
  });

  // 3. Drop onboarding columns from locations
  await knex.raw(`
    ALTER TABLE locations
      DROP CONSTRAINT IF EXISTS locations_competitor_onboarding_status_check
  `);
  await knex.schema.alterTable("locations", (table) => {
    table.dropColumn("location_competitor_onboarding_finalized_at");
    table.dropColumn("location_competitor_onboarding_status");
  });

  // 2. Drop location_competitors table (indexes drop with the table)
  await knex.raw(
    `ALTER TABLE IF EXISTS location_competitors
       DROP CONSTRAINT IF EXISTS location_competitors_source_check`
  );
  await knex.schema.dropTableIfExists("location_competitors");

  // 1. We don't recreate competitor_cache — it was dead code on the live path.
  //    Restoring it would only matter rolling back to a pre-v2 deploy state,
  //    and the pipeline never reads from it anyway.
}
