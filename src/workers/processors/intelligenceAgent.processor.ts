/**
 * Intelligence Agent Processor -- BullMQ job handler
 *
 * Runs daily at 5 AM PT. Produces intelligence findings
 * for all orgs with ranking data.
 */

import type { Job } from "bullmq";
import { runIntelligenceForAll } from "../../services/agents/intelligenceAgent";

export async function processIntelligenceAgent(job: Job): Promise<void> {
  console.log(`[IntelligenceAgent] Processing job ${job.id}...`);
  const result = await runIntelligenceForAll();
  console.log(
    `[IntelligenceAgent] Complete: ${result.scanned} orgs scanned, ${result.totalFindings} findings produced`,
  );
}
