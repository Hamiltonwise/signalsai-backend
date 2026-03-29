/**
 * Foundation Operations Processor -- BullMQ job handler
 *
 * Weekly: Monday 9 AM PT (Foundation status report).
 * Monthly: 1st of month (fuller compliance and partner review).
 */

import type { Job } from "bullmq";
import {
  runWeeklyReport,
  runMonthlyReport,
} from "../../services/agents/foundationOperations";

export async function processFoundationOperations(job: Job): Promise<void> {
  console.log(`[FoundationOps] Processing job ${job.id} (${job.name})...`);

  const isMonthly = job.name === "monthly-foundation-ops";

  if (isMonthly) {
    const report = await runMonthlyReport();
    console.log(
      `[FoundationOps] Monthly report complete: ${report.foundationOrgs} Foundation orgs.`,
    );
  } else {
    const report = await runWeeklyReport();
    console.log(
      `[FoundationOps] Weekly report complete: ${report.foundationOrgs} Foundation orgs, ${report.openTasks} open tasks.`,
    );
  }
}
