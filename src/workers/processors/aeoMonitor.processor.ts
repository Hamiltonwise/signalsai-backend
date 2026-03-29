/**
 * AEO Monitor Processor -- BullMQ job handler
 *
 * Runs weekly Monday 5am PT. Checks Alloro's presence in search
 * results for key monitoring queries.
 */

import { Job } from "bullmq";
import { runAEOMonitor } from "../../services/agents/aeoMonitor";

export async function processAEOMonitor(job: Job): Promise<void> {
  console.log(`[AEOMonitor] Processing job ${job.id}...`);
  const result = await runAEOMonitor();
  console.log(
    `[AEOMonitor] Complete: ${result.queriesPresent}/${result.queriesChecked} queries present`
  );
}
