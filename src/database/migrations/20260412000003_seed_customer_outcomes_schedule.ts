import type { Knex } from "knex";

/**
 * Seed customer_outcomes schedule (Sunday 11:30PM UTC).
 * Runs 30 min after rankings_intelligence writes fresh snapshots.
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex("schedules").where({ agent_key: "customer_outcomes" }).first();
  if (exists) return;

  // Next Sunday 11:30PM UTC
  const now = new Date();
  const daysUntilSunday = (7 - now.getUTCDay()) % 7 || 7;
  const nextSunday = new Date(now);
  nextSunday.setUTCDate(now.getUTCDate() + daysUntilSunday);
  nextSunday.setUTCHours(23, 30, 0, 0);

  await knex("schedules").insert({
    agent_key: "customer_outcomes",
    display_name: "Customer Outcome Tracker",
    description: "Tracks real customer results: rating deltas, review velocity, ranking movement, competitor gap. Creates tasks on regression, stores wins for Monday email. Runs after rankings_intelligence (Sunday 11:30PM UTC).",
    schedule_type: "cron",
    cron_expression: "30 23 * * 0",
    timezone: "UTC",
    enabled: true,
    next_run_at: nextSunday,
    created_at: now,
    updated_at: now,
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex("schedules").where({ agent_key: "customer_outcomes" }).del();
}
