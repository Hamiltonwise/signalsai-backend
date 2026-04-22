/**
 * Manifest v2 Card 5 Run 3 — Weekly Digest worker processor.
 *
 * BullMQ consumer for the `minds-weekly-digest` queue. Scheduled for
 * Monday 2 PM UTC (7 AM Pacific). Iterates all eligible practices
 * and delivers digests.
 */

import type { Job } from "bullmq";
import { deliverAllDigests, deliverDigest } from "../../services/digest/digestDelivery";

export interface WeeklyDigestJobData {
  overrideOrgId?: number;
  overrideRecipient?: string;
}

export async function processWeeklyDigest(
  job: Job<WeeklyDigestJobData>
): Promise<{
  total: number;
  sent: number;
  held: number;
  skipped: number;
  failed: number;
}> {
  const { overrideOrgId, overrideRecipient } = job.data ?? {};

  // Single-org override for testing
  if (overrideOrgId) {
    const result = await deliverDigest(overrideOrgId, overrideRecipient);
    return {
      total: 1,
      sent: result.sent ? 1 : 0,
      held: result.held ? 1 : 0,
      skipped: !result.composed ? 1 : 0,
      failed: result.composed && !result.sent && !result.held ? 1 : 0,
    };
  }

  // Full run across all eligible practices
  const result = await deliverAllDigests();
  return {
    total: result.total,
    sent: result.sent,
    held: result.held,
    skipped: result.skipped,
    failed: result.failed,
  };
}
