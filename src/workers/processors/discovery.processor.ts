import { Job } from "bullmq";
import { MindModel } from "../../models/MindModel";
import { runDiscoveryForMind } from "../../controllers/minds/feature-services/service.minds-discovery";

interface DiscoveryJobData {
  mindId?: string; // If provided, run for specific mind; otherwise run for all
}

export async function processDiscovery(job: Job<DiscoveryJobData>): Promise<void> {
  console.log("[MINDS-WORKER] Starting discovery job");

  const { mindId } = job.data;

  if (mindId) {
    // Run for specific mind
    try {
      const result = await runDiscoveryForMind(mindId);
      console.log(
        `[MINDS-WORKER] Discovery for mind ${mindId}: ${result.newPostsCount} new posts, ${result.errors.length} errors`
      );
    } catch (err: any) {
      console.error(`[MINDS-WORKER] Discovery failed for mind ${mindId}:`, err);
    }
    return;
  }

  // Run for all minds
  const minds = await MindModel.listAll();
  for (const mind of minds) {
    try {
      const result = await runDiscoveryForMind(mind.id);
      console.log(
        `[MINDS-WORKER] Discovery for ${mind.name}: ${result.newPostsCount} new posts, ${result.errors.length} errors`
      );
    } catch (err: any) {
      console.error(`[MINDS-WORKER] Discovery failed for ${mind.name}:`, err);
    }
  }

  console.log("[MINDS-WORKER] Discovery job completed");
}
