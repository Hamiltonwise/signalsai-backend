import type { Knex } from "knex";
import { CronExpressionParser } from "cron-parser";

export async function up(knex: Knex): Promise<void> {
  // schedules — defines what runs and when
  await knex.schema.createTable("schedules", (t) => {
    t.increments("id").primary();
    t.string("agent_key", 100).notNullable().unique();
    t.string("display_name", 255).notNullable();
    t.text("description");
    t.string("schedule_type", 20).notNullable(); // 'cron' | 'interval_days'
    t.string("cron_expression", 100);
    t.integer("interval_days");
    t.string("timezone", 50).notNullable().defaultTo("UTC");
    t.boolean("enabled").notNullable().defaultTo(true);
    t.timestamp("last_run_at", { useTz: true });
    t.timestamp("next_run_at", { useTz: true });
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  // schedule_runs — tracks each execution
  await knex.schema.createTable("schedule_runs", (t) => {
    t.increments("id").primary();
    t.integer("schedule_id").notNullable().references("id").inTable("schedules").onDelete("CASCADE");
    t.string("status", 20).notNullable().defaultTo("running"); // running | completed | failed
    t.timestamp("started_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("completed_at", { useTz: true });
    t.integer("duration_ms");
    t.jsonb("summary");
    t.text("error");
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());

    t.index("schedule_id", "idx_schedule_runs_schedule_id");
    t.index("status", "idx_schedule_runs_status");
  });

  // Seed proofline (daily 6 AM UTC) and ranking (every 15 days)
  const now = new Date();

  const prooflineNext = CronExpressionParser.parse("0 6 * * *", {
    currentDate: now,
    tz: "UTC",
  }).next().toDate();

  const rankingNext = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

  await knex("schedules").insert([
    {
      agent_key: "proofline",
      display_name: "Proofline Agent",
      description: "Daily proofline analysis — generates Win/Risk data points from GBP and website analytics for all onboarded locations.",
      schedule_type: "cron",
      cron_expression: "0 6 * * *",
      timezone: "UTC",
      enabled: true,
      next_run_at: prooflineNext,
      created_at: now,
      updated_at: now,
    },
    {
      agent_key: "ranking",
      display_name: "Practice Ranking",
      description: "Competitive ranking analysis — discovers competitors, scores, and generates LLM analysis for all onboarded locations.",
      schedule_type: "interval_days",
      interval_days: 15,
      timezone: "UTC",
      enabled: true,
      next_run_at: rankingNext,
      created_at: now,
      updated_at: now,
    },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("schedule_runs");
  await knex.schema.dropTableIfExists("schedules");
}
