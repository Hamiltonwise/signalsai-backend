/**
 * Feedback Loop Processor -- BullMQ job handler
 *
 * Runs every Tuesday (24 hours after Monday email).
 * Measures outcomes for emails sent 7+ days ago,
 * then aggregates which action types improve metrics most.
 *
 * The Karpathy Loop: recommend -> measure -> learn -> improve.
 */

import { Job } from "bullmq";
import {
  measurePendingOutcomes,
  aggregateHeuristicStats,
} from "../../services/feedbackLoop";

export async function processFeedbackLoop(job: Job): Promise<void> {
  console.log(`[FeedbackLoop] Processing job ${job.id}...`);

  // Step 1: Measure all pending outcomes (emails sent 7+ days ago)
  const { measured, errors } = await measurePendingOutcomes();
  console.log(
    `[FeedbackLoop] Measured ${measured} outcome(s), ${errors} error(s)`
  );

  // Step 2: Aggregate heuristic stats across all measured outcomes
  const stats = await aggregateHeuristicStats();

  if (stats.length > 0) {
    console.log("[FeedbackLoop] Heuristic stats by action type:");
    for (const s of stats) {
      console.log(
        `  ${s.action_type}: ${s.total_measured} measured, avg improvement ${s.avg_improvement_pct.toFixed(1)}%, positive rate ${s.positive_outcome_rate.toFixed(1)}%`
      );
    }
  } else {
    console.log("[FeedbackLoop] No measured outcomes yet for heuristic aggregation");
  }

  console.log(`[FeedbackLoop] Complete`);
}
