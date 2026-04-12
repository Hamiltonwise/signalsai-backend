import type { Knex } from "knex";

/**
 * Data fix: Org 39 (One Endo / Dr. Saif Kargoli) has "Advanced Endodontics of Chicago"
 * stored as topCompetitor in checkup_data. This is wrong geography -- Saif is in
 * Falls Church/Fredericksburg, VA. The checkup scrape matched a Chicago business.
 *
 * This migration clears the bad topCompetitor so the dashboard falls through to
 * the (now-filtered) ranking data instead of showing stale wrong data.
 *
 * Also clears top_competitor_name on the org record.
 */
export async function up(knex: Knex): Promise<void> {
  const org = await knex("organizations").where({ id: 39 }).first();
  if (!org) return;

  // Fix checkup_data.topCompetitor
  if (org.checkup_data) {
    const data =
      typeof org.checkup_data === "string"
        ? JSON.parse(org.checkup_data)
        : org.checkup_data;

    if (data?.topCompetitor) {
      const topName =
        typeof data.topCompetitor === "string"
          ? data.topCompetitor
          : data.topCompetitor?.name || "";

      // Only clear if it's the known bad value
      if (topName.toLowerCase().includes("chicago")) {
        delete data.topCompetitor;
        await knex("organizations")
          .where({ id: 39 })
          .update({
            checkup_data: JSON.stringify(data),
            top_competitor_name: null,
          });
      }
    }
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Data fix -- no meaningful rollback
}
