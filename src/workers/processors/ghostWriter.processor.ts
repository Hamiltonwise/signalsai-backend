/**
 * Ghost Writer Processor -- BullMQ job handler
 *
 * Runs daily at 8 AM PT. Scans recent Fireflies transcripts
 * and extracts book-worthy passages.
 */

import type { Job } from "bullmq";
import { runGhostWriterDaily } from "../../services/agents/ghostWriter";

export async function processGhostWriter(job: Job): Promise<void> {
  console.log(`[GhostWriter] Processing job ${job.id}...`);
  const result = await runGhostWriterDaily();
  console.log(
    `[GhostWriter] Complete: ${result.transcriptsProcessed} transcripts, ${result.passagesTagged} passages tagged.`,
  );
}
