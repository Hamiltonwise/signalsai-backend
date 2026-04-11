/**
 * Seed target_competitor fields for all 5 paying clients.
 *
 * Reads the actual competitor data from weekly_ranking_snapshots
 * (ground truth from latest scans) and populates the target_competitor
 * fields added in 20260410000001.
 *
 * For One Endo (org 39), Saif explicitly said "beat Centreville" --
 * so we look for Centreville in their snapshots specifically.
 *
 * For others, we use their current top competitor from the latest snapshot.
 *
 * Blast radius: Yellow (DB migration, data-only)
 */

import type { Knex } from "knex";

// Client org IDs and their known target competitors
// Source: Build State April 6 verified data + Saif's direct request
const CLIENT_TARGETS: Array<{
  orgId: number;
  targetName?: string; // If specified, search snapshots for this name
  // If not specified, use whatever the latest snapshot has
}> = [
  { orgId: 39, targetName: "Centreville" }, // One Endo -- Saif: "beat Centreville"
  { orgId: 5 },   // Garrison -- use latest snapshot competitor
  { orgId: 8 },   // Artful -- use latest snapshot competitor
  { orgId: 25 },  // Caswell -- use latest snapshot competitor
  { orgId: 68 },  // SD Endo -- use latest snapshot competitor
];

export async function up(knex: Knex): Promise<void> {
  // Check if columns exist (migration 20260410000001 must run first)
  const hasColumn = await knex.schema.hasColumn("organizations", "target_competitor_name");
  if (!hasColumn) {
    console.log("target_competitor_name column not found -- skipping seed. Run 20260410000001 first.");
    return;
  }

  const hasSnapshots = await knex.schema.hasTable("weekly_ranking_snapshots");

  for (const client of CLIENT_TARGETS) {
    let competitorName: string | null = null;
    let competitorPlaceId: string | null = null;

    if (hasSnapshots) {
      if (client.targetName) {
        // Search for the specific competitor the client named
        const snapshot = await knex("weekly_ranking_snapshots")
          .where({ org_id: client.orgId })
          .whereRaw("LOWER(competitor_name) LIKE LOWER(?)", [`%${client.targetName}%`])
          .orderBy("week_start", "desc")
          .first();

        if (snapshot) {
          competitorName = snapshot.competitor_name;
          competitorPlaceId = snapshot.competitor_place_id || null;
        }
      }

      // Fallback: use the latest snapshot's competitor
      if (!competitorName) {
        const latest = await knex("weekly_ranking_snapshots")
          .where({ org_id: client.orgId })
          .whereNotNull("competitor_name")
          .orderBy("week_start", "desc")
          .first();

        if (latest) {
          competitorName = latest.competitor_name;
          competitorPlaceId = latest.competitor_place_id || null;
        }
      }

      // Second fallback: read from checkup_data on the org
      if (!competitorName) {
        const org = await knex("organizations").where({ id: client.orgId }).first();
        if (org?.checkup_data) {
          const cd = typeof org.checkup_data === "string"
            ? JSON.parse(org.checkup_data)
            : org.checkup_data;
          const topComp = cd?.topCompetitor || cd?.top_competitor;
          if (typeof topComp === "string") {
            competitorName = topComp;
          } else if (topComp?.name) {
            competitorName = topComp.name;
            competitorPlaceId = topComp.placeId || null;
          }
        }
      }
    }

    if (competitorName) {
      await knex("organizations")
        .where({ id: client.orgId })
        .update({
          target_competitor_name: competitorName,
          target_competitor_place_id: competitorPlaceId,
        });
      console.log(`Seeded target competitor for org ${client.orgId}: ${competitorName}`);
    } else {
      console.log(`No competitor data found for org ${client.orgId} -- skipping`);
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  // Clear the seeded values
  for (const client of CLIENT_TARGETS) {
    await knex("organizations")
      .where({ id: client.orgId })
      .update({
        target_competitor_name: null,
        target_competitor_place_id: null,
      });
  }
}
