/**
 * CMO Agent Processor -- BullMQ job handler
 *
 * Runs weekly Monday 6am PT. Generates content strategy briefs.
 */

import { Job } from "bullmq";
import { runCMOAgent } from "../../services/agents/cmoAgent";

export async function processCMOAgent(job: Job): Promise<void> {
  console.log(`[CMOAgent] Processing job ${job.id}...`);
  const result = await runCMOAgent();
  console.log(
    `[CMOAgent] Complete: ${result.briefs.length} briefs generated (${result.mode} mode)`
  );
}
