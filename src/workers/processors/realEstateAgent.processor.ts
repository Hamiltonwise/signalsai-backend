/**
 * Real Estate Agent Processor -- BullMQ job handler
 *
 * Runs monthly (1st Monday 8:30 AM PT) + quarterly.
 * Scans Wyoming properties in Teton, Sublette, and Fremont counties.
 */

import type { Job } from "bullmq";
import { runPropertyScan } from "../../services/agents/realEstateAgent";

export async function processRealEstateAgent(job: Job): Promise<void> {
  console.log(`[RealEstate] Processing job ${job.id}...`);
  const summary = await runPropertyScan();
  console.log(
    `[RealEstate] Complete: ${summary.listingsFound} found, ${summary.qualifyingProperties} qualifying across ${summary.countiesScanned} counties`,
  );
}
