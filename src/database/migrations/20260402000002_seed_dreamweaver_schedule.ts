import type { Knex } from "knex";
import { CronExpressionParser } from "cron-parser";

/**
 * Seed the Dreamweaver agent schedule.
 *
 * The Dreamweaver was built but never wired to the scheduler.
 * This migration adds it as a daily 6:00 UTC job, running before
 * the morning briefing so its legends are available for the Monday email.
 *
 * Idempotent: skips if agent_key "dreamweaver" already exists.
 */

export async function up(knex: Knex): Promise<void> {
  const exists = await knex("schedules")
    .where({ agent_key: "dreamweaver" })
    .first();

  if (exists) {
    console.log("[seed-dreamweaver] Skipping dreamweaver (already exists)");
    return;
  }

  const cronExpression = "0 6 * * *"; // 6:00 UTC daily
  const interval = CronExpressionParser.parse(cronExpression, {
    currentDate: new Date(),
    tz: "UTC",
  });
  const nextRun = interval.next().toDate();
  const now = new Date();

  await knex("schedules").insert({
    agent_key: "dreamweaver",
    display_name: "Dreamweaver",
    description:
      "Daily hospitality moments agent. Scans behavioral_events for personalized gestures: milestones, 5-star reviews, competitor wins, welcome back, 90-day mark, referral conversions. Runs before morning briefing.",
    schedule_type: "cron",
    cron_expression: cronExpression,
    timezone: "UTC",
    enabled: true,
    next_run_at: nextRun,
    created_at: now,
    updated_at: now,
  });

  console.log(
    `[seed-dreamweaver] Registered dreamweaver -> ${cronExpression}, next run: ${nextRun.toISOString()}`,
  );

  // Also update the dream_team_tasks entry to have the correct agent_key
  // so the org chart links to the schedule
  await knex("dream_team_tasks")
    .where({ title: "Dreamweaver Agent" })
    .whereNull("agent_key")
    .update({ agent_key: "dreamweaver" });
}

export async function down(knex: Knex): Promise<void> {
  await knex("schedules").where({ agent_key: "dreamweaver" }).del();
  await knex("dream_team_tasks")
    .where({ title: "Dreamweaver Agent", agent_key: "dreamweaver" })
    .update({ agent_key: null });
}
