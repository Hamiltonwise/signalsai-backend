import type { Job } from "bullmq";
import { processNarratorEvent } from "../../services/narrator/narratorService";
import { runSilentQuitterSweep } from "../../services/narrator/silentQuitterDetector";
import type { NarratorEvent } from "../../services/narrator/types";

export type NarratorJobData =
  | { kind: "event"; event: NarratorEvent }
  | { kind: "silent_quitter_sweep" };

export async function processNarratorJob(job: Job<NarratorJobData>): Promise<unknown> {
  const data = job.data;
  if (data.kind === "silent_quitter_sweep") {
    return await runSilentQuitterSweep();
  }
  return await processNarratorEvent(data.event);
}
