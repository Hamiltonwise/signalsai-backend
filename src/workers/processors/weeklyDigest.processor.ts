/**
 * Weekly Digest Processor -- BullMQ job handler
 *
 * Runs Sunday 8pm PT. Aggregates the week's behavioral_events,
 * agent outputs, client health, and competitive moves into a
 * structured weekly summary for Corey.
 */

import { Job } from "bullmq";
import { runWeeklyDigest } from "../../services/agents/weeklyDigest";

export async function processWeeklyDigest(job: Job): Promise<void> {
  console.log(`[WeeklyDigest] Processing job ${job.id}...`);
  const result = await runWeeklyDigest();
  console.log(
    `[WeeklyDigest] Complete: week of ${result.weekOf}, ${result.events.totalEvents} events, ${result.clients.active} active clients`
  );
}
