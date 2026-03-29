/**
 * Nothing Gets Lost Processor -- BullMQ job handler
 *
 * Daily at 7 AM PT: runs the daily orphan scan.
 * Sundays: runs the fuller weekly scan (includes stale data check).
 */

import { Job } from "bullmq";
import {
  runDailyScan,
  runWeeklyScan,
} from "../../services/agents/nothingGetsLost";

export async function processNothingGetsLost(job: Job): Promise<void> {
  console.log(`[NothingGetsLost] Processing job ${job.id} (${job.name})...`);

  const isWeekly = job.name === "weekly-nothing-gets-lost";

  if (isWeekly) {
    const summary = await runWeeklyScan();
    console.log(
      `[NothingGetsLost] Weekly scan complete: ${summary.findings.length} findings`
    );
  } else {
    const summary = await runDailyScan();
    console.log(
      `[NothingGetsLost] Daily scan complete: ${summary.findings.length} findings`
    );
  }
}
