/**
 * CPA Personal Agent Processor -- BullMQ job handler
 *
 * Runs monthly (1st Monday 7 AM PT) + quarterly.
 * Generates QSBS clock status, entity recommendations, tax checklists.
 */

import type { Job } from "bullmq";
import { runCPAPersonalBrief } from "../../services/agents/cpaPersonal";

export async function processCPAPersonal(job: Job): Promise<void> {
  console.log(`[CPAPersonal] Processing job ${job.id}...`);
  const brief = await runCPAPersonalBrief(job.data || undefined);
  console.log(
    `[CPAPersonal] Complete: QSBS ${brief.qsbsStatus.daysRemaining} days remaining, ${brief.insights.length} insights`,
  );
}
