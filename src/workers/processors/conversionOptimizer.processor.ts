/**
 * Conversion Optimizer Processor -- BullMQ job handler
 *
 * Runs weekly Monday 6 AM PT. Analyzes the PLG funnel
 * and identifies the weakest conversion stage.
 */

import type { Job } from "bullmq";
import { runConversionAnalysis } from "../../services/agents/conversionOptimizer";

export async function processConversionOptimizer(job: Job): Promise<void> {
  console.log(`[ConversionOptimizer] Processing job ${job.id}...`);
  const analysis = await runConversionAnalysis();
  console.log(
    `[ConversionOptimizer] Complete: weakest stage ${analysis.weakestStage || "N/A"} at ${
      analysis.weakestRate !== null
        ? Math.round(analysis.weakestRate * 100) + "%"
        : "N/A"
    }`,
  );
}
