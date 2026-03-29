/**
 * Programmatic SEO Processor -- BullMQ job handler
 *
 * Runs weekly Monday 4am PT (before morning brief fires).
 * Analyzes programmatic page performance and identifies
 * underperforming pages.
 */

import { Job } from "bullmq";
import { runProgrammaticSEOAnalysis } from "../../services/agents/programmaticSEOAgent";

export async function processProgrammaticSEO(job: Job): Promise<void> {
  console.log(`[ProgrammaticSEO] Processing job ${job.id}...`);
  const result = await runProgrammaticSEOAnalysis();
  console.log(
    `[ProgrammaticSEO] Complete: ${result.totalPages} pages analyzed (${result.rising} rising, ${result.declining} declining)`
  );
}
