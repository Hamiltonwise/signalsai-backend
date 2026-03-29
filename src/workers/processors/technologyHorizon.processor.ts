/**
 * Technology Horizon Processor -- BullMQ job handler
 *
 * Runs daily 6am PT. Monitors AI company blogs and tech RSS feeds
 * for capability changes that affect Alloro's agent stack.
 */

import { Job } from "bullmq";
import { runTechnologyHorizon } from "../../services/agents/technologyHorizon";

export async function processTechnologyHorizon(job: Job): Promise<void> {
  console.log(`[TechnologyHorizon] Processing job ${job.id}...`);
  const result = await runTechnologyHorizon();
  console.log(
    `[TechnologyHorizon] Complete: ${result.signalsDetected} signals from ${result.sourcesSucceeded}/${result.sourcesChecked} sources`
  );
}
