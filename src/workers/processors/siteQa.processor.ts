import type { Job } from "bullmq";
import { runPublishQaHook } from "../../services/siteQa/publishHook";
import type { Section } from "../../services/siteQa/types";

export interface SiteQaJobData {
  projectId: string;
  pagePath?: string;
  sections: Section[];
  orgId?: number;
  footer?: string;
}

/**
 * Async Site QA runner. Used when publish is gated by a queue (e.g. background
 * revalidation). For synchronous publish calls, import runPublishQaHook
 * directly from ../../services/siteQa/publishHook.
 */
export async function processSiteQa(job: Job<SiteQaJobData>): Promise<{
  allowed: boolean;
  mode: string;
  defectCount: number;
}> {
  const result = await runPublishQaHook(job.data);
  return {
    allowed: result.allowed,
    mode: result.mode,
    defectCount: result.report.defects.length,
  };
}
