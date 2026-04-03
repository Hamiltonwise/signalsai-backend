/**
 * Data Integrity Cleanup
 *
 * 1. Archive 19 ghost/duplicate orgs (13 One Endo dupes, 6 Smoke Test dupes)
 * 2. Add created_at to tables that are event-sourced but have no timestamp
 * 3. Consolidate the event registries note (documentation only)
 */

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ── 1. Archive duplicate orgs ──
  // Keep the first One Endodontics - Falls Church (id 47), archive dupes (48-59)
  const oneEndoDupes = await knex("organizations")
    .where("name", "One Endodontics - Falls Church")
    .whereNot("id", 47) // Keep the original
    .pluck("id");

  if (oneEndoDupes.length > 0) {
    await knex("organizations")
      .whereIn("id", oneEndoDupes)
      .update({
        subscription_status: "inactive",
        name: knex.raw("name || ' (archived duplicate)'"),
      });
    console.log(`[DataIntegrity] Archived ${oneEndoDupes.length} One Endo duplicate orgs`);
  }

  // Archive Smoke Test orgs
  const smokeTestOrgs = await knex("organizations")
    .where("name", "like", "%Smoke Test%")
    .pluck("id");

  if (smokeTestOrgs.length > 0) {
    await knex("organizations")
      .whereIn("id", smokeTestOrgs)
      .update({ subscription_status: "inactive" });
    console.log(`[DataIntegrity] Archived ${smokeTestOrgs.length} Smoke Test orgs`);
  }

  // ── 2. Add created_at to tables missing it ──
  const tablesToFix = [
    "pms_jobs",
    "webhook_receipts",
    "prediction_outcomes",
  ];

  for (const tableName of tablesToFix) {
    const exists = await knex.schema.hasTable(tableName);
    if (!exists) continue;

    const hasCreatedAt = await knex.schema.hasColumn(tableName, "created_at");
    if (!hasCreatedAt) {
      await knex.schema.alterTable(tableName, (table) => {
        table.timestamp("created_at").defaultTo(knex.fn.now());
      });
      console.log(`[DataIntegrity] Added created_at to ${tableName}`);
    }
  }

  // patient_journey_events is the worst offender: event table with no event timestamp
  const hasPJE = await knex.schema.hasTable("patient_journey_events");
  if (hasPJE) {
    const hasCreatedAt = await knex.schema.hasColumn("patient_journey_events", "created_at");
    if (!hasCreatedAt) {
      await knex.schema.alterTable("patient_journey_events", (table) => {
        table.timestamp("created_at").defaultTo(knex.fn.now());
      });
      console.log("[DataIntegrity] Added created_at to patient_journey_events");
    }
    const hasEventDate = await knex.schema.hasColumn("patient_journey_events", "event_date");
    if (!hasEventDate) {
      await knex.schema.alterTable("patient_journey_events", (table) => {
        table.timestamp("event_date").defaultTo(knex.fn.now());
      });
      console.log("[DataIntegrity] Added event_date to patient_journey_events");
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  // Un-archive is too risky to automate (might un-archive intentionally archived orgs)
  console.log("[DataIntegrity] Down migration: manual review required for un-archiving orgs");
}
