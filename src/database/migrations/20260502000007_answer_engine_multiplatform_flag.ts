import type { Knex } from "knex";

/**
 * Answer Engine Multiplatform feature flag (Phase 3 cost-discipline
 * activation, May 2 2026).
 *
 * Gates the multi-platform AEO monitor (`runAeoMonitorAcrossPlatforms`)
 * per practice. Phase 1's single-platform `runAeoMonitor` cron is
 * unchanged and continues running for everyone; this flag controls
 * whether the per-practice monitor expands to ChatGPT, Perplexity,
 * Claude, Gemini, and Siri in addition to Google AI Overviews.
 *
 * Enabled by default for the five paying-client orgs:
 *   - Garrison Orthodontics (id 5)
 *   - Artful Orthodontics (id 8)
 *   - Caswell Orthodontics (id 25)
 *   - One Endodontics (id 39)
 *   - One Endodontics Falls Church (id 47)
 *
 * Coastal Endodontic Studio is appended once its row enters
 * organizations. AAE Primed Buyers (Freer, Olson) append on conversion.
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex("feature_flags")
    .where({ flag_name: "answer_engine_multiplatform" })
    .first();
  if (exists) {
    // Update enabled_for_orgs in case prior runs left a partial set.
    await knex("feature_flags")
      .where({ flag_name: "answer_engine_multiplatform" })
      .update({ enabled_for_orgs: JSON.stringify([5, 8, 25, 39, 47]) });
    return;
  }
  await knex("feature_flags").insert({
    flag_name: "answer_engine_multiplatform",
    is_enabled: false,
    enabled_for_orgs: JSON.stringify([5, 8, 25, 39, 47]),
    description:
      "Continuous Answer Engine multi-platform monitor (ChatGPT, Perplexity, Claude, Gemini, Siri in addition to Google AI Overviews). Cost-disciplined defaults: chatGPT routes to gpt-5-search-api, claude samples 10%, hourly cron uses pollingMode=movement_only. Daily cron runs in pollingMode=full.",
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex("feature_flags")
    .where({ flag_name: "answer_engine_multiplatform" })
    .delete();
}
