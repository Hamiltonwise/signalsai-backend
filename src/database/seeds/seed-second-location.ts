/**
 * Seed script: Insert a second location for testing multi-location switching.
 *
 * Usage:
 *   npx ts-node src/database/seeds/seed-second-location.ts
 *
 * What it does:
 *   1. Finds the first organization that has a primary location
 *   2. Inserts a second (non-primary) location for that org
 *   3. Grants all org users access to the new location via user_locations
 *   4. Prints summary
 *
 * Safe to run multiple times — skips if a non-primary location already exists.
 */
import dotenv from "dotenv";
dotenv.config();

import db from "../connection";

async function seed() {
  // 1. Find an org with a primary location
  const primaryLoc = await db("locations")
    .where({ is_primary: true })
    .first();

  if (!primaryLoc) {
    console.error("No organization with a primary location found. Run migrations first.");
    process.exit(1);
  }

  const orgId = primaryLoc.organization_id;
  const org = await db("organizations").where({ id: orgId }).first();
  console.log(`Target org: "${org.name}" (id=${orgId}), primary location: "${primaryLoc.name}" (id=${primaryLoc.id})`);

  // 2. Check if a non-primary location already exists
  const existing = await db("locations")
    .where({ organization_id: orgId, is_primary: false })
    .first();

  if (existing) {
    console.log(`Non-primary location already exists: "${existing.name}" (id=${existing.id}). Skipping insert.`);
    await db.destroy();
    return;
  }

  // 3. Insert second location
  const [newLoc] = await db("locations")
    .insert({
      organization_id: orgId,
      name: "Second Office",
      domain: primaryLoc.domain
        ? `second.${primaryLoc.domain}`
        : null,
      is_primary: false,
    })
    .returning("*");

  console.log(`Inserted location: "${newLoc.name}" (id=${newLoc.id})`);

  // 4. Grant all org users access to the new location
  const orgUsers = await db("organization_users")
    .where({ organization_id: orgId })
    .select("user_id");

  if (orgUsers.length > 0) {
    const userLocationRows = orgUsers.map((ou: { user_id: number }) => ({
      user_id: ou.user_id,
      location_id: newLoc.id,
    }));
    await db("user_locations").insert(userLocationRows).onConflict(["user_id", "location_id"]).ignore();
    console.log(`Granted ${orgUsers.length} user(s) access to new location.`);
  }

  console.log("\nDone. Sign in and verify the LocationSwitcher dropdown appears.");
  await db.destroy();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
