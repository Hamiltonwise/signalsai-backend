/**
 * Dry-run script: runs the AAE nurture agent against fixture attendees
 * and writes a markdown report to /tmp.
 *
 * Usage:
 *   npx tsx scripts/run-aae-nurture-dryrun.ts
 *
 * No Notion writes. No Slack. No scrapes. No sends.
 */

import { runAaeNurture } from "../src/services/agents/aaeNurture";
import { SAMPLE_AAE_ATTENDEES } from "../tests/aaeNurture/fixtures/aae-attendees-sample";

async function main() {
  const result = await runAaeNurture({
    mode: "dry-run",
    segmentFilter: "professional_us",
    touchNumber: 1,
    fixtureAttendees: SAMPLE_AAE_ATTENDEES,
    outputDir: "/tmp",
    outputBaseName: "aae-nurture-dry-run-2026-05-02",
  });

  console.log("");
  console.log("AAE Nurture dry-run complete.");
  console.log("------------------------------");
  console.log(`Output:  ${result.outputPath}`);
  console.log(`Drafted: ${result.summary.drafted}`);
  console.log(`Skipped: ${result.summary.skipped}`);
  console.log(`Green:   ${result.summary.green}`);
  console.log(`Yellow:  ${result.summary.yellow}`);
  console.log(`Jo review required: ${result.summary.jo_review_required}`);
  console.log("");

  if (result.skipped.length > 0) {
    console.log("Skipped attendees:");
    for (const s of result.skipped) {
      console.log(`  - ${s.attendeeId}: ${s.reason}${s.detail ? ` (${s.detail})` : ""}`);
    }
  }
}

main().catch((err) => {
  console.error("[AaeNurture dry-run] Failed:", err);
  process.exit(1);
});
