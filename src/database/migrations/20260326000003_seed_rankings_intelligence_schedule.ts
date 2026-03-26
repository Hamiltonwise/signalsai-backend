import type { Knex } from "knex";

/**
 * WO-20: Seed rankings_intelligence schedule (Sunday 11PM UTC).
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex("schedules").where({ agent_key: "rankings_intelligence" }).first();
  if (exists) return;

  // Next Sunday 11PM UTC
  const now = new Date();
  const daysUntilSunday = (7 - now.getUTCDay()) % 7 || 7;
  const nextSunday = new Date(now);
  nextSunday.setUTCDate(now.getUTCDate() + daysUntilSunday);
  nextSunday.setUTCHours(23, 0, 0, 0);

  await knex("schedules").insert({
    agent_key: "rankings_intelligence",
    display_name: "Rankings Intelligence",
    description: "Weekly snapshot: queries current ranking for each org, generates 3 plain-English bullets, stores to weekly_ranking_snapshots. Feeds Monday email and Rankings screen.",
    schedule_type: "cron",
    cron_expression: "0 23 * * 0",
    timezone: "UTC",
    enabled: true,
    next_run_at: nextSunday,
    created_at: now,
    updated_at: now,
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex("schedules").where({ agent_key: "rankings_intelligence" }).del();
}
