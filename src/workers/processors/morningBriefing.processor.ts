/**
 * Morning Briefing Processor -- BullMQ job handler
 *
 * Calls runMorningBriefing() to assemble overnight signals.
 * Scheduled daily at 6:30 AM ET (after Client Monitor at 6 AM).
 */

import type { Job } from "bullmq";
import { runMorningBriefing } from "../../services/agents/morningBriefing";

export async function processMorningBriefing(job: Job): Promise<void> {
  console.log(`[MorningBriefing] Processing job ${job.id}...`);
  const summary = await runMorningBriefing();
  console.log(
    `[MorningBriefing] Complete for ${summary.date}: ` +
      `${summary.newSignups} signups, ${summary.clientHealth.red} RED clients`,
  );
}
