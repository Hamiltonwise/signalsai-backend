/**
 * Content Performance Processor -- BullMQ job handler
 *
 * Runs weekly Sunday 6pm PT. Aggregates content attribution
 * data and writes a performance brief to behavioral_events.
 */

import { Job } from "bullmq";
import { runContentPerformance } from "../../services/agents/contentPerformance";

export async function processContentPerformance(job: Job): Promise<void> {
  console.log(`[ContentPerformance] Processing job ${job.id}...`);
  const brief = await runContentPerformance();
  console.log(
    `[ContentPerformance] Complete: ${brief.totalCheckupStarts} checkup starts, ${brief.totalAccountCreations} accounts, ${brief.conversionBySource.length} sources`
  );
}
