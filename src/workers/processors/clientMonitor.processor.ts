/**
 * Client Monitor Processor -- BullMQ job handler
 *
 * Calls runClientMonitor() for all active orgs.
 * Scheduled daily at 6 AM ET.
 */

import type { Job } from "bullmq";
import { runClientMonitor } from "../../services/agents/clientMonitor";

export async function processClientMonitor(job: Job): Promise<void> {
  console.log(`[ClientMonitor] Processing job ${job.id}...`);
  const summary = await runClientMonitor();
  console.log(
    `[ClientMonitor] Complete: ${summary.green} green, ${summary.amber} amber, ${summary.red} red`,
  );
}
