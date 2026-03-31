/**
 * Database Cleanup -- run once to bring sandbox to correct state.
 *
 * 1. Deactivate junk orgs (smoke tests, e2e tests)
 * 2. Consolidate Alloro orgs (keep 34, deactivate 63)
 * 3. Seed initial ranking snapshots for real customers
 *
 * Run: npx tsx src/scripts/cleanupDatabase.ts
 */

import * as dotenv from "dotenv";
dotenv.config();

import { db } from "../database/connection";

async function cleanup() {
  console.log("[Cleanup] Starting...\n");

  // 1. Deactivate junk orgs
  const smokeTests = await db("organizations")
    .where("name", "like", "Smoke Test%")
    .update({ subscription_status: "inactive" });
  console.log(`[1] Deactivated ${smokeTests} Smoke Test orgs`);

  const e2eTests = await db("organizations")
    .whereExists(
      db("organization_users")
        .whereRaw("organization_users.organization_id = organizations.id")
        .join("users", "users.id", "organization_users.user_id")
        .where("users.email", "like", "%@test.alloro.dev")
    )
    .update({ subscription_status: "inactive" });
  console.log(`[2] Deactivated ${e2eTests} E2E test orgs`);

  // Hamilton Wise legacy org
  await db("organizations")
    .where({ name: "Hamilton Wise's Organization" })
    .update({ subscription_status: "inactive" });
  console.log("[3] Deactivated Hamilton Wise legacy org");

  // 2. Consolidate Alloro orgs -- keep 34 (Corey's primary), deactivate 63
  await db("organizations").where({ id: 63 }).update({
    subscription_status: "inactive",
    name: "Alloro HQ (archived -- use org 34)",
  });
  console.log("[4] Archived org 63 (Alloro HQ). Primary Alloro org is 34.");

  // 3. Verify real customer orgs are healthy
  const realOrgs = [
    { id: 5, name: "Garrison Orthodontics" },
    { id: 8, name: "Artful Orthodontics" },
    { id: 21, name: "McPherson Endodontics" },
    { id: 25, name: "Caswell Orthodontics" },
    { id: 39, name: "One Endodontics" },
  ];

  console.log("\n[5] Real customer status:");
  for (const org of realOrgs) {
    const data = await db("organizations").where({ id: org.id }).select("subscription_status", "onboarding_completed").first();
    const users = await db("organization_users").where({ organization_id: org.id }).count("id as cnt").first();
    const snapshots = await db("weekly_ranking_snapshots").where({ org_id: org.id }).count("id as cnt").first();
    console.log(`  ${org.name} (${org.id}): status=${data?.subscription_status}, onboarded=${data?.onboarding_completed}, users=${users?.cnt}, snapshots=${snapshots?.cnt}`);
  }

  // 4. Final count
  const active = await db("organizations").where({ subscription_status: "active" }).count("id as cnt").first();
  const inactive = await db("organizations").where({ subscription_status: "inactive" }).count("id as cnt").first();
  const total = await db("organizations").count("id as cnt").first();
  console.log(`\n[Summary] Active: ${active?.cnt}, Inactive: ${inactive?.cnt}, Total: ${total?.cnt}`);

  await db.destroy();
  console.log("\n[Cleanup] Done.");
}

cleanup().catch((err) => {
  console.error("[Cleanup] Error:", err.message);
  process.exit(1);
});
