/**
 * Strategic Intelligence Processor -- BullMQ job handler
 *
 * Runs monthly (1st Monday 10 AM PT). Scans competitor websites
 * and generates a strategic landscape brief.
 */

import { Job } from "bullmq";
import { runStrategicIntelligence } from "../../services/agents/strategicIntelligence";

export async function processStrategicIntelligence(job: Job): Promise<void> {
  console.log(`[StrategicIntelligence] Processing job ${job.id}...`);
  const result = await runStrategicIntelligence();
  console.log(
    `[StrategicIntelligence] Complete: ${result.competitorsScanned} competitors scanned, ${result.signals.length} signals`
  );
}
