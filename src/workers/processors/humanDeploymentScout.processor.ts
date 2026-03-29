/**
 * Human Deployment Scout Processor -- BullMQ job handler
 *
 * Runs weekly Sunday 7 PM PT.
 * Checks 5 trigger signals for human hiring needs.
 */

import type { Job } from "bullmq";
import { runHumanDeploymentScan } from "../../services/agents/humanDeploymentScout";

export async function processHumanDeploymentScout(job: Job): Promise<void> {
  console.log(`[HumanDeploymentScout] Processing job ${job.id}...`);
  const report = await runHumanDeploymentScan();
  console.log(
    `[HumanDeploymentScout] Complete: ${report.signals.filter((s) => s.fired).length} signal(s) fired. ${report.summary}`,
  );
}
