/**
 * Bug Triage Processor -- BullMQ job handler
 *
 * Runs hourly. Monitors behavioral_events for error patterns
 * and creates dream_team_tasks for recurring issues.
 */

import { Job } from "bullmq";
import { runBugTriage } from "../../services/agents/bugTriageAgent";

export async function processBugTriage(job: Job): Promise<void> {
  console.log(`[BugTriage] Processing job ${job.id}...`);
  const result = await runBugTriage();
  console.log(
    `[BugTriage] Complete: ${result.totalErrorEvents} errors, ${result.errorGroups} groups, ${result.tasksCreated} tasks created`
  );
}
