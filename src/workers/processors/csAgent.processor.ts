/**
 * CS Agent Processor -- BullMQ job handler
 *
 * Calls runCSAgentDaily() for proactive intervention scanning.
 * Scheduled daily at 7:30 AM PT.
 */

import type { Job } from "bullmq";
import { runCSAgentDaily } from "../../services/agents/csAgent";

export async function processCSAgent(job: Job): Promise<void> {
  console.log(`[CSAgent] Processing proactive intervention scan, job ${job.id}...`);
  const summary = await runCSAgentDaily();
  console.log(
    `[CSAgent] Complete: scanned ${summary.scanned} orgs, ${summary.interventions} interventions generated`,
  );
}
