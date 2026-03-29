/**
 * Monday Email Processor — BullMQ job handler
 *
 * Calls sendAllMondayEmails() for all eligible orgs.
 */

import { Job } from "bullmq";
import { sendAllMondayEmails } from "../../jobs/mondayEmail";

export async function processMondayEmail(job: Job): Promise<void> {
  console.log(`[MondayEmail] Processing job ${job.id}...`);
  const result = await sendAllMondayEmails();
  console.log(`[MondayEmail] Complete: ${result.sent}/${result.total} emails sent`);
}
