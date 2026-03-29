/**
 * CFO Agent Processor -- BullMQ job handler
 *
 * Runs monthly (1st Monday 8 AM PT).
 * Calculates MRR, churn, unit economics, and generates insights.
 */

import type { Job } from "bullmq";
import { runCFOMonthlyReport } from "../../services/agents/cfoAgent";

export async function processCFOAgent(job: Job): Promise<void> {
  console.log(`[CFOAgent] Processing job ${job.id}...`);
  const report = await runCFOMonthlyReport();
  console.log(
    `[CFOAgent] Complete: MRR $${report.metrics.mrr}, FYM ${report.metrics.fymScore}/100, ${report.insights.length} insights`,
  );
}
