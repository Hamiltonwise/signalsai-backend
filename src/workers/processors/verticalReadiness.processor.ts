/**
 * Vertical Readiness Scout Processor -- BullMQ job handler
 *
 * Runs monthly on the 1st Sunday at 6 PM PT.
 * Scores all verticals against 5 deployment thresholds.
 */

import type { Job } from "bullmq";
import { runVerticalReadinessScan } from "../../services/agents/verticalReadiness";

export async function processVerticalReadiness(job: Job): Promise<void> {
  console.log(`[VerticalReadiness] Processing job ${job.id}...`);
  const report = await runVerticalReadinessScan();
  console.log(
    `[VerticalReadiness] Complete: ${report.deploymentReady.length} deployment-ready, ${report.nearReady.length} near-ready.`,
  );
}
