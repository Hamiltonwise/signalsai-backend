import type { Knex } from "knex";

/**
 * Seed feedback_loop schedule (Tuesday 3PM UTC = 8AM PT).
 * Runs 24 hours after Monday email to measure outcomes.
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex("schedules").where({ agent_key: "feedback_loop" }).first();
  if (exists) return;

  // Next Tuesday 3PM UTC
  const now = new Date();
  const daysUntilTuesday = ((2 - now.getUTCDay()) + 7) % 7 || 7;
  const nextTuesday = new Date(now);
  nextTuesday.setUTCDate(now.getUTCDate() + daysUntilTuesday);
  nextTuesday.setUTCHours(15, 0, 0, 0);

  await knex("schedules").insert({
    agent_key: "feedback_loop",
    display_name: "Feedback Loop",
    description: "Self-improving heuristics engine. Measures Monday email outcomes after 7 days, aggregates which action types drive the most improvement.",
    schedule_type: "cron",
    cron_expression: "0 15 * * 2",
    timezone: "UTC",
    enabled: true,
    next_run_at: nextTuesday,
    created_at: now,
    updated_at: now,
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex("schedules").where({ agent_key: "feedback_loop" }).del();
}
