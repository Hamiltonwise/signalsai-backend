import type { Knex } from "knex";

/**
 * Answer Engine Regeneration feature flag (Phase 2).
 *
 * Gates the Trigger Router's invocation of the regeneration pipeline
 * (Research + Copy + Reviewer Claude) per practice. Defaults to off so
 * Phase 1 (signal capture) keeps shipping without expensive agent calls
 * fired on every signal until the per-practice rollout is approved.
 *
 * The auto_slack_alert flag is the second gate: even when regeneration
 * is on, PASS_WITH_CONCERNS / BLOCK Slack alerts are drafted to
 * dream_team_tasks rather than sent live until the flag flips. After
 * five successful manual reviews, Corey can flip auto_slack_alert on.
 */
export async function up(knex: Knex): Promise<void> {
  const regen = await knex("feature_flags")
    .where({ flag_name: "answer_engine_regeneration" })
    .first();
  if (!regen) {
    await knex("feature_flags").insert({
      flag_name: "answer_engine_regeneration",
      is_enabled: false,
      enabled_for_orgs: JSON.stringify([]),
      description:
        "Phase 2 regeneration pipeline (Research + Copy + Reviewer Claude). Off by default; flip per practice once smoke tests confirm clean behavior.",
    });
  }

  const slack = await knex("feature_flags")
    .where({ flag_name: "answer_engine_auto_slack_alert" })
    .first();
  if (!slack) {
    await knex("feature_flags").insert({
      flag_name: "answer_engine_auto_slack_alert",
      is_enabled: false,
      enabled_for_orgs: JSON.stringify([]),
      description:
        "When off, PASS_WITH_CONCERNS / BLOCK verdicts queue a dream_team_task for Corey rather than auto-posting Slack. Flip after 5 successful manual reviews.",
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex("feature_flags")
    .whereIn("flag_name", [
      "answer_engine_regeneration",
      "answer_engine_auto_slack_alert",
    ])
    .delete();
}
