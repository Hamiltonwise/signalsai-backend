import { Job } from "bullmq";
import { refreshAllGbpTokens } from "../../services/gbpTokenRefresh";

/**
 * BullMQ processor: refreshes all GBP access tokens.
 * Scheduled daily at 3 AM PT (10 AM UTC) via worker.ts cron.
 */
export async function processGbpRefresh(_job: Job): Promise<void> {
  console.log("[GBP-REFRESH-WORKER] Starting daily GBP token refresh");

  const result = await refreshAllGbpTokens();

  console.log(
    `[GBP-REFRESH-WORKER] Done: ${result.succeeded}/${result.total} refreshed, ${result.revoked} revoked`,
  );
}
