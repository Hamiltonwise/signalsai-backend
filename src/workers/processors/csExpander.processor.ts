/**
 * CS Expander Processor -- BullMQ job handler
 *
 * Runs monthly (first Monday 9 AM ET) and on first_win events.
 * Identifies expansion opportunities in healthy, engaged accounts.
 */

import type { Job } from "bullmq";
import { runCSExpander, runCSExpanderForOrg } from "../../services/agents/csExpander";

export async function processCSExpander(job: Job): Promise<void> {
  console.log(`[CSExpander] Processing job ${job.id}...`);

  if (job.data?.orgId) {
    // Triggered by a first_win event for a specific org
    const candidate = await runCSExpanderForOrg(job.data.orgId);
    if (candidate) {
      console.log(
        `[CSExpander] Expansion opportunity detected for ${candidate.orgName}`,
      );
    } else {
      console.log(
        `[CSExpander] Org ${job.data.orgId} does not qualify for expansion`,
      );
    }
  } else {
    // Monthly scan of all orgs
    const summary = await runCSExpander();
    console.log(
      `[CSExpander] Complete: ${summary.scanned} scanned, ${summary.qualified} opportunities`,
    );
  }
}
