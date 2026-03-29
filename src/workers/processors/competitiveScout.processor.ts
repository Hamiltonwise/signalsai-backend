/**
 * Competitive Scout Processor — BullMQ job handler
 *
 * Runs weekly (Wednesday 8 AM ET), after Sunday ranking snapshots
 * have been created. Detects competitor movements across all orgs
 * with ranking data.
 */

import { Job } from "bullmq";
import { runCompetitiveScoutForAll } from "../../services/agents/competitiveScout";

export async function processCompetitiveScout(job: Job): Promise<void> {
  console.log(`[CompetitiveScout] Processing job ${job.id}...`);
  const result = await runCompetitiveScoutForAll();
  console.log(
    `[CompetitiveScout] Complete: ${result.scanned} scanned, ${result.withMovements} with movements, ${result.totalMovements} total signals`
  );
}
