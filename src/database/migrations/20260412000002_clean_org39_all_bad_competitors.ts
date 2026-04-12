import type { Knex } from "knex";

/**
 * Data fix: Org 39 (One Endo / Dr. Saif Kargoli) has had multiple
 * non-local competitors stored: "Advanced Endodontics of Chicago" and
 * Gainesville GA results. Saif is in Falls Church/Fredericksburg, VA.
 *
 * This migration:
 * 1. Clears checkup_data.topCompetitor entirely (the ranking API now
 *    computes topCompetitor from the distance-filtered competitors array)
 * 2. Clears top_competitor_name on the org record
 * 3. Clears target_competitor fields if they reference non-local businesses
 *
 * Going forward, the distance filter in rankingsIntelligence.ts prevents
 * non-local competitors from being stored in new ranking snapshots.
 */
export async function up(knex: Knex): Promise<void> {
  const org = await knex("organizations").where({ id: 39 }).first();
  if (!org) return;

  // 1. Clear checkup_data.topCompetitor unconditionally
  if (org.checkup_data) {
    const data =
      typeof org.checkup_data === "string"
        ? JSON.parse(org.checkup_data)
        : { ...org.checkup_data };

    if (data?.topCompetitor) {
      delete data.topCompetitor;
    }
    if (data?.top_competitor) {
      delete data.top_competitor;
    }

    await knex("organizations")
      .where({ id: 39 })
      .update({
        checkup_data: JSON.stringify(data),
        top_competitor_name: null,
      });
  }

  // 2. Clear target_competitor if it references a non-VA business
  if (org.target_competitor_name) {
    const name = org.target_competitor_name.toLowerCase();
    if (name.includes("chicago") || name.includes("gainesville") || name.includes("georgia")) {
      await knex("organizations")
        .where({ id: 39 })
        .update({
          target_competitor_name: null,
          target_competitor_place_id: null,
        });
    }
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Data fix, no meaningful rollback
}
