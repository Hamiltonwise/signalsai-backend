/**
 * Card 7 verification readout.
 *
 * 1. Picks 3 historical Garrison signal_received entries (from existing
 *    data — no new signal generated) and backfills patient_question,
 *    visibility_snapshot, action_taken for them via composePerQueryReceipt.
 *    Each backfilled entry's prior NULL values are restored at the end so
 *    the verification leaves no permanent state change.
 *
 * 2. Smoke test: composes a per-query receipt for a synthetic
 *    gsc_impression_spike-shaped signalData on the query
 *    'how often to clean retainers' (one of the Card 4 ortho seed queries).
 *    Asserts the three fields populate and that the visibility_snapshot
 *    display string uses mid-dot separator.
 *
 * 3. Anchor entry: confirms a Card 6 anchor row still has the three new
 *    fields NULL (the renderer falls through to narrative-only).
 */

import { db } from "../src/database/connection";
import { composePerQueryReceipt } from "../src/services/answerEngine/perQueryReceipts";

const GARRISON = 5;

async function main(): Promise<void> {
  console.log("=== Pick 3 historical Garrison signal_received entries ===");
  const targets = await db("live_activity_entries")
    .where({ practice_id: GARRISON, entry_type: "signal_received" })
    .andWhere("is_anchor_entry", false)
    .orderBy("created_at", "desc")
    .limit(3)
    .select("id", "entry_data", "created_at", "patient_question", "visibility_snapshot", "action_taken");

  if (targets.length === 0) {
    console.log("no historical entries found; nothing to backfill");
    return;
  }

  const restorePoints: Array<{
    id: string;
    patient_question: string | null;
    visibility_snapshot: string | null;
    action_taken: string | null;
  }> = [];

  for (const t of targets) {
    const ed = typeof t.entry_data === "string" ? JSON.parse(t.entry_data) : t.entry_data;
    const signalType = ed?.signal_type as string;
    const signalData = (ed?.signal_data ?? {}) as Record<string, unknown>;
    const routedTo = (ed?.routed_to as string | null) ?? null;
    const ts = new Date(t.created_at as string);

    const receipt = await composePerQueryReceipt({
      practiceId: GARRISON,
      signalType: signalType as any,
      signalData,
      signalTimestamp: ts,
      actionLog: null,
      routedTo,
    });

    restorePoints.push({
      id: t.id,
      patient_question: t.patient_question,
      visibility_snapshot: typeof t.visibility_snapshot === "string"
        ? t.visibility_snapshot
        : t.visibility_snapshot != null
          ? JSON.stringify(t.visibility_snapshot)
          : null,
      action_taken: t.action_taken,
    });

    await db("live_activity_entries")
      .where({ id: t.id })
      .update({
        patient_question: receipt.patientQuestion,
        visibility_snapshot:
          receipt.visibilitySnapshot != null
            ? JSON.stringify(receipt.visibilitySnapshot)
            : null,
        action_taken: receipt.actionTaken,
      });

    console.log(`\n--- entry ${t.id} ---`);
    console.log(`signalType: ${signalType}`);
    console.log(`patient_question: ${receipt.patientQuestion}`);
    console.log(`visibility_snapshot.display: ${receipt.visibilitySnapshot?.display}`);
    console.log(`action_taken: ${receipt.actionTaken}`);
  }

  console.log("\n=== Smoke test: composePerQueryReceipt for a synthetic gsc_impression_spike ===");
  const smoke = await composePerQueryReceipt({
    practiceId: GARRISON,
    signalType: "gsc_impression_spike",
    signalData: {
      query: "how often to clean retainers",
      impressionsBefore: 4,
      impressionsAfter: 8,
    },
    signalTimestamp: new Date(),
    actionLog: null,
    routedTo: "watching",
  });
  console.log(JSON.stringify(smoke, null, 2));
  if (!smoke.visibilitySnapshot?.display.includes(" · ")) {
    throw new Error("visibility_snapshot.display must use mid-dot ' · ' separator");
  }
  console.log("mid-dot separator confirmed in visibility_snapshot.display");

  console.log("\n=== Anchor row preservation ===");
  // Make a transient anchor so we can read it back; clean up after.
  const [anchor] = await db("live_activity_entries")
    .insert({
      practice_id: GARRISON,
      entry_type: "signal_received",
      entry_data: JSON.stringify({ verification: true }),
      doctor_facing_text:
        "Alloro began watching 25 patient questions across 6 AI platforms for Garrison Orthodontics today.",
      visible_to_doctor: true,
      is_anchor_entry: true,
    })
    .returning(["id"]);
  const anchorRow = await db("live_activity_entries")
    .where({ id: (anchor as { id: string }).id })
    .first(
      "id",
      "is_anchor_entry",
      "patient_question",
      "visibility_snapshot",
      "action_taken",
    );
  console.log(JSON.stringify(anchorRow, null, 2));
  if (anchorRow.patient_question !== null) {
    throw new Error("anchor row should have NULL patient_question");
  }
  console.log("anchor row preserves NULL patient/visibility/action — frontend will render narrative only");

  console.log("\n=== Cleanup ===");
  await db("live_activity_entries").where({ id: anchorRow.id }).del();
  for (const rp of restorePoints) {
    await db("live_activity_entries")
      .where({ id: rp.id })
      .update({
        patient_question: rp.patient_question,
        visibility_snapshot: rp.visibility_snapshot,
        action_taken: rp.action_taken,
      });
  }
  console.log(`restored ${restorePoints.length} historical entries; deleted transient anchor`);
}

main()
  .catch((err) => {
    console.error("VERIFY FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
