/**
 * Learning Agent Processor -- BullMQ job handler
 *
 * Runs weekly Sunday 9 PM PT. Calculates compound metrics
 * across all 5 feedback loops.
 */

import type { Job } from "bullmq";
import { runLearningCalibration } from "../../services/agents/learningAgent";

export async function processLearningAgent(job: Job): Promise<void> {
  console.log(`[LearningAgent] Processing job ${job.id}...`);
  const calibration = await runLearningCalibration();
  console.log(
    `[LearningAgent] Complete: ${calibration.metrics.length} metrics, compound rate ${
      calibration.overallCompoundRate !== null
        ? calibration.overallCompoundRate.toFixed(3)
        : "N/A"
    }`,
  );
}
