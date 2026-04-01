/**
 * Weekly Score Recalculation Processor -- BullMQ job handler
 *
 * Runs Sunday night (10 PM ET / Monday 3 AM UTC) before the Monday email.
 * Recalculates the Business Clarity Score for every org with a placeId.
 *
 * The score delta becomes the opening line of the Monday email.
 * A static score is a report. A score that moves is a relationship.
 */

import { Job } from "bullmq";
import { recalculateAllScores } from "../../services/weeklyScoreRecalc";

export async function processWeeklyScoreRecalc(job: Job): Promise<void> {
  console.log(`[WeeklyScoreRecalc] Processing job ${job.id}...`);
  const result = await recalculateAllScores();
  console.log(
    `[WeeklyScoreRecalc] Complete: ${result.updated}/${result.processed} updated, ${result.errors} errors`,
  );
}
