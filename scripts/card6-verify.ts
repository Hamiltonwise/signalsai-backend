/**
 * Card 6 verification readout.
 *
 * Drives:
 *   1. fireAnchorEntryForPractice(5) (Garrison) — first call inserts an
 *      anchor entry with text "Alloro began watching 25 patient questions
 *      across 6 AI platforms for Garrison Orthodontics today."
 *   2. fireAnchorEntryForPractice(5) again — must return
 *      'skipped_already_exists' (idempotency)
 *   3. listLiveActivityEntries({ practice_id: 5 }) — anchor row appears
 *      LAST in the result (sort order: is_anchor_entry ASC, created_at DESC)
 *   4. Cleanup: delete the anchor row so the verification can be re-run
 *      and so the production state is unchanged
 */

import { db } from "../src/database/connection";
import { fireAnchorEntryForPractice } from "../src/services/liveActivity/anchorEntry";
import { listLiveActivityEntries } from "../src/services/answerEngine/liveActivity";

async function main(): Promise<void> {
  const PRACTICE_ID = 5;

  console.log("=== Pre-state ===");
  const pre = await db("live_activity_entries")
    .where({ practice_id: PRACTICE_ID, is_anchor_entry: true })
    .count<{ count: string }[]>("id as count")
    .first();
  console.log(`existing anchor rows for practice ${PRACTICE_ID}: ${pre?.count}`);

  console.log("\n=== First call: fireAnchorEntryForPractice(5) ===");
  const r1 = await fireAnchorEntryForPractice(PRACTICE_ID);
  console.log(JSON.stringify(r1, null, 2));

  console.log("\n=== Second call: fireAnchorEntryForPractice(5) (idempotency) ===");
  const r2 = await fireAnchorEntryForPractice(PRACTICE_ID);
  console.log(JSON.stringify(r2, null, 2));

  console.log("\n=== listLiveActivityEntries: anchor sorts to bottom ===");
  const entries = await listLiveActivityEntries({ practice_id: PRACTICE_ID, limit: 50 });
  console.log(`entries returned: ${entries.length}`);
  console.log("first 3 (newest first):");
  for (const e of entries.slice(0, 3)) {
    console.log(`  is_anchor=${e.is_anchor_entry} type=${e.entry_type} created=${e.created_at} text="${e.doctor_facing_text.slice(0, 80)}..."`);
  }
  console.log("last 3 (anchor expected here):");
  for (const e of entries.slice(-3)) {
    console.log(`  is_anchor=${e.is_anchor_entry} type=${e.entry_type} created=${e.created_at} text="${e.doctor_facing_text.slice(0, 80)}..."`);
  }
  const lastIsAnchor = entries.length > 0 && entries[entries.length - 1].is_anchor_entry === true;
  console.log(`anchor entry is the LAST row in the sorted list: ${lastIsAnchor}`);

  console.log("\n=== Behavioral events written by the verification ===");
  const events = await db("behavioral_events")
    .where({ org_id: PRACTICE_ID })
    .whereIn("event_type", [
      "anchor_entry_inserted",
      "anchor_entry_already_exists",
      "anchor_entry_voice_constraints_fail",
    ])
    .orderBy("created_at", "desc")
    .limit(5)
    .select("event_type", "properties", "created_at");
  for (const e of events) {
    console.log(`  ${e.event_type} @ ${e.created_at}: ${JSON.stringify(e.properties)}`);
  }

  console.log("\n=== Cleanup: delete the anchor row written by this verification ===");
  if (r1.status === "inserted") {
    await db("live_activity_entries").where({ id: r1.entryId }).del();
    console.log(`deleted entry ${r1.entryId}`);
  }
  // Cleanup verification-only behavioral events too
  await db("behavioral_events")
    .where({ org_id: PRACTICE_ID })
    .whereIn("event_type", [
      "anchor_entry_inserted",
      "anchor_entry_already_exists",
    ])
    .andWhereRaw("created_at > NOW() - INTERVAL '5 minutes'")
    .del();
  console.log("cleared recent verification behavioral events");
}

main()
  .catch((err) => {
    console.error("VERIFY FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
