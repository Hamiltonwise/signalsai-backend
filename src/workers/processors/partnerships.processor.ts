/**
 * Partnerships Processor -- BullMQ job handler
 *
 * Runs monthly (1st Monday 11 AM PT). Scans partnership targets,
 * checks pipeline status, and creates follow-up tasks.
 */

import { Job } from "bullmq";
import { runPartnershipsAgent } from "../../services/agents/partnershipsAgent";

export async function processPartnerships(job: Job): Promise<void> {
  console.log(`[Partnerships] Processing job ${job.id}...`);
  const result = await runPartnershipsAgent();
  console.log(
    `[Partnerships] Complete: ${result.pipelineItems} pipeline items, ${result.newOpportunities} opportunities, ${result.tasksCreated} tasks created`
  );
}
