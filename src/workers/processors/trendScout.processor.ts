/**
 * Trend Scout Processor -- BullMQ job handler
 *
 * Runs weekly Sunday 6pm PT. Scans RSS feeds and behavioral
 * data to identify top content topics for the week.
 */

import { Job } from "bullmq";
import { runTrendScout } from "../../services/agents/trendScout";

export async function processTrendScout(job: Job): Promise<void> {
  console.log(`[TrendScout] Processing job ${job.id}...`);
  const result = await runTrendScout();
  console.log(
    `[TrendScout] Complete: ${result.topicsDetected} topics from ${result.sourcesSucceeded}/${result.sourcesChecked} sources`
  );
}
