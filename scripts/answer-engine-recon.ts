/**
 * One-shot reconnaissance script for Answer Engine Phase 1 build.
 *
 * Resolves the five active practices in the spec, lists their google
 * connections, and prints what GSC integration knows about each. Read-only.
 */

import { db } from "../src/database/connection";

async function main(): Promise<void> {
  try {
    // First learn the actual column shape of organizations.
    const orgCols = await db.raw(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'organizations' ORDER BY ordinal_position`,
    );
    console.log("=== organizations columns ===");
    console.log(JSON.stringify(orgCols.rows, null, 2));

    const orgs = await db.raw(
      `SELECT id, name, domain, patientpath_status FROM organizations
       WHERE name ILIKE ANY(ARRAY['%coastal%', '%garrison%', '%artful%', '%caswell%', '%kargoli%', '%one endo%'])
          OR domain ILIKE ANY(ARRAY['%coastalendostudio%', '%garrison%', '%artful%', '%caswell%', '%kargoli%'])
       LIMIT 50`,
    );

    console.log("\n=== ORGANIZATIONS (matching practice names) ===");
    console.log(JSON.stringify(orgs.rows, null, 2));

    if (orgs.rows.length > 0) {
      const ids = orgs.rows.map((o: { id: string | number }) => o.id);
      const conns = await db("google_connections")
        .select("organization_id", "email", "google_property_ids")
        .whereIn("organization_id", ids);
      console.log("\n=== GOOGLE CONNECTIONS ===");
      console.log(JSON.stringify(conns, null, 2));
    }

    // Active list query (the one signal_watcher will use)
    const active = await db("organizations")
      .select("id", "name", "domain", "patientpath_status")
      .whereIn("patientpath_status", ["preview_ready", "live"])
      .limit(50);

    // Distinct values of patientpath_status for context.
    const distinctStatuses = await db.raw(
      `SELECT patientpath_status, COUNT(*) AS n FROM organizations GROUP BY patientpath_status ORDER BY n DESC`,
    );
    console.log("\n=== Distinct patientpath_status values ===");
    console.log(JSON.stringify(distinctStatuses.rows, null, 2));
    console.log("\n=== ACTIVE (patientpath_status in (preview_ready, live)) ===");
    console.log(JSON.stringify(active, null, 2));

    // Schema check on organizations.id type
    const colInfo = await db.raw(
      `SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'id'`,
    );
    console.log("\n=== organizations.id column type ===");
    console.log(JSON.stringify(colInfo.rows, null, 2));

    // Check if vocabulary_configs table exists
    const vocabCheck = await db.raw(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vocabulary_configs'`,
    );
    console.log("\n=== vocabulary_configs exists? ===");
    console.log(JSON.stringify(vocabCheck.rows, null, 2));

    // Check existing tables we might be conflicting with
    const newTablesCheck = await db.raw(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('signal_events', 'aeo_citations', 'live_activity_entries', 'aeo_test_queries')`,
    );
    console.log("\n=== Pre-existing target tables ===");
    console.log(JSON.stringify(newTablesCheck.rows, null, 2));
  } catch (err: unknown) {
    console.error("[recon] error:", err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

main();
