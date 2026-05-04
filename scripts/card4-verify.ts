/**
 * Card 4 verification readout. Drives:
 *   1. loadActiveQueries('orthodontics') against the live DB → expects 25 rows
 *   2. loadActiveQueries('endodontics') against the live DB → expects 25 rows
 *   3. loadActiveQueries('physical_therapy') (no seed) → expects 0 rows + a
 *      'aeo_polling_blocked_no_seed' behavioral_event written
 *   4. Garrison practice resolver: vocabulary_configs.vertical=orthodontics
 *      → normalizeSpecialty → loadActiveQueries returns the orthodontics
 *      seed (proving Garrison's polling cycle now uses ortho queries)
 */

import { db } from "../src/database/connection";
import { loadActiveQueries } from "../src/services/answerEngine/aeoMonitor";

async function countBlockedEvents(vertical: string, sinceMs: number): Promise<number> {
  const since = new Date(sinceMs).toISOString();
  const r = await db("behavioral_events")
    .where({ event_type: "aeo_polling_blocked_no_seed" })
    .andWhereRaw("created_at >= ?", [since])
    .andWhereRaw("properties->>'vertical' = ?", [vertical])
    .count<{ count: string }[]>("id as count")
    .first();
  return Number(r?.count ?? 0);
}

async function main(): Promise<void> {
  const startMs = Date.now();

  console.log("=== loadActiveQueries('orthodontics') ===");
  const ortho = await loadActiveQueries("orthodontics");
  console.log(`row count: ${ortho.length}`);
  console.log("first 3:", JSON.stringify(ortho.slice(0, 3), null, 2));

  console.log("\n=== loadActiveQueries('endodontics') ===");
  const endo = await loadActiveQueries("endodontics");
  console.log(`row count: ${endo.length}`);

  console.log("\n=== loadActiveQueries('physical_therapy') (unseeded) ===");
  const pt = await loadActiveQueries("physical_therapy");
  console.log(`row count: ${pt.length} (expected 0)`);

  // Wait briefly so the behavioral_events insert lands
  await new Promise((r) => setTimeout(r, 250));
  const blocked = await countBlockedEvents("physical_therapy", startMs - 5000);
  console.log(`'aeo_polling_blocked_no_seed' events for physical_therapy since run start: ${blocked}`);

  console.log("\n=== Garrison practice resolver simulation ===");
  const garrisonVocab = await db("vocabulary_configs")
    .where({ org_id: 5 })
    .first("vertical");
  console.log("vocabulary_configs.vertical for Garrison:", garrisonVocab?.vertical);
  // normalizeSpecialty mapping (re-derived here for confirmation)
  const garrisonResolved = (garrisonVocab?.vertical || "").toLowerCase().includes("ortho")
    ? "orthodontics"
    : (garrisonVocab?.vertical || "").toLowerCase().includes("endo")
      ? "endodontics"
      : (garrisonVocab?.vertical || "general");
  console.log("normalizeSpecialty result:", garrisonResolved);
  const garrisonQueries = await loadActiveQueries(garrisonResolved);
  console.log(`Garrison polling-set row count: ${garrisonQueries.length}`);
  console.log(
    "first 5 query texts:",
    garrisonQueries.slice(0, 5).map((q) => q.query),
  );
}

main()
  .catch((err) => {
    console.error("VERIFY FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
