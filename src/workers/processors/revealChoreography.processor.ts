import type { Job } from "bullmq";
import { runRevealChoreography } from "../../services/reveal/revealChoreography";

export interface RevealChoreographyJobData {
  orgId: number;
  sitePublishedEventId?: string | null;
  forceDryRun?: boolean;
}

/**
 * BullMQ consumer for the `minds-reveal-choreography` queue. Triggered by a
 * site.published behavioral_event upstream (Card 2 Build Orchestrator or any
 * manual admin trigger). Per-org feature flag determines dry-run vs live.
 */
export async function processRevealChoreography(
  job: Job<RevealChoreographyJobData>
): Promise<{
  mode: string;
  idempotent: boolean;
  emailSent: boolean;
  lobSent: boolean;
  dashboardRendered: boolean;
  error?: string;
}> {
  const { orgId, sitePublishedEventId, forceDryRun } = job.data;
  const result = await runRevealChoreography({ orgId, sitePublishedEventId, forceDryRun });
  return {
    mode: result.mode,
    idempotent: result.idempotent,
    emailSent: Boolean(result.fanOut.emailSentAt),
    lobSent: Boolean(result.fanOut.lobSentAt),
    dashboardRendered: Boolean(result.fanOut.dashboardRenderedAt),
    error: result.error,
  };
}
