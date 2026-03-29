/**
 * Trial Email Processor -- BullMQ job handler
 *
 * Handles delayed jobs for each trial email day.
 * Job data: { orgId: number, day: number }
 */

import { Job } from "bullmq";
import {
  sendTrialDay1,
  sendTrialDay3,
  sendTrialDay5,
  sendTrialDay6,
  sendTrialDay7,
} from "../../services/trialEmailService";

interface TrialEmailJobData {
  orgId: number;
  day: number;
}

export async function processTrialEmail(job: Job<TrialEmailJobData>): Promise<void> {
  const { orgId, day } = job.data;
  console.log(`[TrialEmail] Processing day ${day} for org ${orgId}`);

  switch (day) {
    case 1:
      await sendTrialDay1(orgId);
      break;
    case 3:
      await sendTrialDay3(orgId);
      break;
    case 5:
      await sendTrialDay5(orgId);
      break;
    case 6:
      await sendTrialDay6(orgId);
      break;
    case 7:
      await sendTrialDay7(orgId);
      break;
    default:
      console.log(`[TrialEmail] No handler for day ${day}, skipping`);
  }

  console.log(`[TrialEmail] Day ${day} complete for org ${orgId}`);
}
