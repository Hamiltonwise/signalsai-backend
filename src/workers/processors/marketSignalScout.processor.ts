/**
 * Market Signal Scout Processor -- BullMQ job handler
 *
 * Runs daily 6am PT. Monitors RSS feeds from key sources for
 * signals relevant to Alloro's market.
 */

import { Job } from "bullmq";
import { runMarketSignalScout } from "../../services/agents/marketSignalScout";

export async function processMarketSignalScout(job: Job): Promise<void> {
  console.log(`[MarketSignalScout] Processing job ${job.id}...`);
  const result = await runMarketSignalScout();
  console.log(
    `[MarketSignalScout] Complete: ${result.signalsDetected} signals (${result.p0Signals} P0) from ${result.sourcesSucceeded}/${result.sourcesChecked} sources`
  );
}
