/**
 * Migration: Rankings Intelligence + GP Drift Detection
 *
 * WO20: T3-B (weekly ranking snapshots) + T3-F (GP drift alerts) + T3-C (first win attribution)
 *
 * Creates:
 *   1. weekly_ranking_snapshots — Intelligence Agent weekly output
 *   2. first_win_attribution_events — gates the referral mechanic
 *   3. Adds drift fields to referral_sources (if table exists)
 *   4. Adds first_win_attributed_at to organizations
 */

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 1. weekly_ranking_snapshots — Intelligence Agent stores here every Sunday
  await knex.schema.createTable("weekly_ranking_snapshots", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("org_id").notNullable().references("id").inTable("organizations").onDelete("CASCADE");
    t.integer("location_id").references("id").inTable("locations").onDelete("SET NULL");
    t.date("week_start").notNullable();
    t.integer("position");
    t.string("keyword", 200);
    t.jsonb("bullets").defaultTo("[]"); // array of 3 plain-English strings
    t.string("competitor_note", 500);
    t.string("finding_headline", 300);
    t.integer("dollar_figure"); // estimated monthly revenue at risk
    t.integer("competitor_position"); // #1 competitor's position
    t.string("competitor_name", 200);
    t.integer("competitor_review_count");
    t.integer("client_review_count");
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw("CREATE INDEX idx_weekly_ranking_snapshots_org ON weekly_ranking_snapshots(org_id)");
  await knex.raw("CREATE INDEX idx_weekly_ranking_snapshots_week ON weekly_ranking_snapshots(week_start)");
  await knex.raw("CREATE UNIQUE INDEX idx_weekly_ranking_snapshots_org_week ON weekly_ranking_snapshots(org_id, week_start)");

  // 2. first_win_attribution_events — fires once per client
  await knex.schema.createTable("first_win_attribution_events", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("org_id").notNullable().references("id").inTable("organizations").onDelete("CASCADE");
    t.string("event_type", 100).notNullable(); // 'ranking_improvement', 'review_growth', 'gp_reactivation'
    t.text("description");
    t.timestamp("occurred_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw("CREATE INDEX idx_first_win_attribution_org ON first_win_attribution_events(org_id)");

  // 3. Add first_win_attributed_at to organizations (gates referral mechanic)
  const hasFirstWin = await knex.schema.hasColumn("organizations", "first_win_attributed_at");
  if (!hasFirstWin) {
    await knex.schema.alterTable("organizations", (t) => {
      t.timestamp("first_win_attributed_at", { useTz: true });
    });
  }

  // 4. Add drift detection fields to referral_sources (if table exists)
  const hasReferralSources = await knex.schema.hasTable("referral_sources");
  if (hasReferralSources) {
    const hasSurpriseCatch = await knex.schema.hasColumn("referral_sources", "surprise_catch_dismissed_at");
    if (!hasSurpriseCatch) {
      await knex.schema.alterTable("referral_sources", (t) => {
        t.timestamp("surprise_catch_dismissed_at", { useTz: true });
        t.timestamp("gp_drift_dismissed_at", { useTz: true });
      });
    }
  }

  console.log("[Migration] Rankings intelligence + drift detection tables created");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("first_win_attribution_events");
  await knex.schema.dropTableIfExists("weekly_ranking_snapshots");

  const hasFirstWin = await knex.schema.hasColumn("organizations", "first_win_attributed_at");
  if (hasFirstWin) {
    await knex.schema.alterTable("organizations", (t) => {
      t.dropColumn("first_win_attributed_at");
    });
  }

  const hasReferralSources = await knex.schema.hasTable("referral_sources");
  if (hasReferralSources) {
    const hasSurpriseCatch = await knex.schema.hasColumn("referral_sources", "surprise_catch_dismissed_at");
    if (hasSurpriseCatch) {
      await knex.schema.alterTable("referral_sources", (t) => {
        t.dropColumn("surprise_catch_dismissed_at");
        t.dropColumn("gp_drift_dismissed_at");
      });
    }
  }
}
