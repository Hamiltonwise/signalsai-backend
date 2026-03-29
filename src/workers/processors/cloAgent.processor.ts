/**
 * CLO Agent Processor -- BullMQ job handler
 *
 * Runs weekly (Tuesday 6 AM PT).
 * Scans USPTO TESS for trademark threats on Alloro product names.
 */

import type { Job } from "bullmq";
import { runTrademarkScan } from "../../services/agents/cloAgent";

export async function processCLOAgent(job: Job): Promise<void> {
  console.log(`[CLOAgent] Processing job ${job.id}...`);
  const summary = await runTrademarkScan();
  console.log(
    `[CLOAgent] Complete: ${summary.termsChecked} terms checked, ${summary.threatsDetected} threats`,
  );
}
