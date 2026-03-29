/**
 * State of Clarity Processor -- BullMQ job handler
 *
 * Runs quarterly: 1st of Jan, Apr, Jul, Oct at 6 AM PT.
 * Generates the State of Business Clarity benchmark report.
 */

import type { Job } from "bullmq";
import { generateStateReport } from "../../services/agents/stateOfClarity";

export async function processStateOfClarity(job: Job): Promise<void> {
  console.log(`[StateOfClarity] Processing job ${job.id}...`);
  const result = await generateStateReport();
  console.log(
    `[StateOfClarity] Complete: success=${result.success}, verticals=${result.report.findingsByVertical.length}, quarter=${result.report.quarter}.`
  );
}
