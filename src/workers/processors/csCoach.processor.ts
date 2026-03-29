/**
 * CS Coach Processor -- BullMQ job handler
 *
 * Runs weekly Sunday 8 PM PT. Analyzes CS intervention
 * patterns and produces coaching recommendations.
 */

import type { Job } from "bullmq";
import { runCSCoach } from "../../services/agents/csCoach";

export async function processCSCoach(job: Job): Promise<void> {
  console.log(`[CSCoach] Processing job ${job.id}...`);
  const summary = await runCSCoach();
  console.log(
    `[CSCoach] Complete: ${summary.totalInterventions} interventions analyzed, ${summary.recommendations.length} recommendations`,
  );
}
