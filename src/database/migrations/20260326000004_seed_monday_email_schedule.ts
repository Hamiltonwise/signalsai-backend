import type { Knex } from "knex";

/**
 * WO-21: Seed monday_email schedule (Monday 2PM UTC = 7AM PT).
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex("schedules").where({ agent_key: "monday_email" }).first();
  if (exists) return;

  // Next Monday 2PM UTC
  const now = new Date();
  const daysUntilMonday = ((1 - now.getUTCDay()) + 7) % 7 || 7;
  const nextMonday = new Date(now);
  nextMonday.setUTCDate(now.getUTCDate() + daysUntilMonday);
  nextMonday.setUTCHours(14, 0, 0, 0);

  await knex("schedules").insert({
    agent_key: "monday_email",
    display_name: "Monday Email",
    description: "Weekly intelligence brief to each practice owner. Reads from weekly_ranking_snapshots, sends via n8n webhook.",
    schedule_type: "cron",
    cron_expression: "0 14 * * 1",
    timezone: "UTC",
    enabled: true,
    next_run_at: nextMonday,
    created_at: now,
    updated_at: now,
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex("schedules").where({ agent_key: "monday_email" }).del();
}
