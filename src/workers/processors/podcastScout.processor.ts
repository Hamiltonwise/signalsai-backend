/**
 * Podcast Scout Processor -- BullMQ job handler
 *
 * Runs weekly Monday 5am PT. Discovers podcast opportunities
 * and generates pitch drafts for Corey's review.
 */

import { Job } from "bullmq";
import { runPodcastScout } from "../../services/agents/podcastScout";

export async function processPodcastScout(job: Job): Promise<void> {
  console.log(`[PodcastScout] Processing job ${job.id}...`);
  const result = await runPodcastScout();
  console.log(
    `[PodcastScout] Complete: ${result.opportunitiesFound} opportunities from ${result.sourcesChecked} sources (${result.mode} mode)`
  );
}
