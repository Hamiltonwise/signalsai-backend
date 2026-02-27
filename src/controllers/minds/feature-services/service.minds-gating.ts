import { MindSyncRunModel } from "../../../models/MindSyncRunModel";
import { MindSyncProposalModel } from "../../../models/MindSyncProposalModel";
import { MindDiscoveryBatchModel } from "../../../models/MindDiscoveryBatchModel";
import { MindDiscoveredPostModel } from "../../../models/MindDiscoveredPostModel";

const MAX_POSTS_PER_SCRAPE_RUN = parseInt(
  process.env.MINDS_MAX_POSTS_PER_SCRAPE_RUN || "10",
  10
);

export interface GatingResult {
  allowed: boolean;
  reasons: string[];
}

export async function canStartScrapeCompare(mindId: string): Promise<GatingResult> {
  const reasons: string[] = [];

  // 1. No active runs
  const hasActive = await MindSyncRunModel.hasActiveRun(mindId);
  if (hasActive) {
    reasons.push("A sync run is already queued or running for this mind.");
  }

  // 2. Open batch exists
  const batch = await MindDiscoveryBatchModel.findOpenByMind(mindId);
  if (!batch) {
    reasons.push("No open discovery batch exists.");
  }

  if (batch) {
    // 3. No pending posts
    const hasPending = await MindDiscoveredPostModel.hasPendingInBatch(batch.id);
    if (hasPending) {
      reasons.push("There are untriaged (pending) posts in the open batch.");
    }

    // 4. Approved count between 1 and MAX
    const approvedCount = await MindDiscoveredPostModel.countByBatchAndStatus(
      batch.id,
      "approved"
    );
    if (approvedCount === 0) {
      reasons.push("No approved posts to scrape.");
    }
    if (approvedCount > MAX_POSTS_PER_SCRAPE_RUN) {
      reasons.push(
        `Too many approved posts (${approvedCount}). Maximum is ${MAX_POSTS_PER_SCRAPE_RUN}.`
      );
    }
  }

  // 5. No outstanding approved proposals
  const hasApproved = await MindSyncProposalModel.hasApprovedUnfinalized(mindId);
  if (hasApproved) {
    reasons.push(
      "There are approved proposals that have not been compiled/published. Compile or reject them first."
    );
  }

  return { allowed: reasons.length === 0, reasons };
}

export async function canStartCompilePublish(mindId: string): Promise<GatingResult> {
  const reasons: string[] = [];

  // 1. No active runs
  const hasActive = await MindSyncRunModel.hasActiveRun(mindId);
  if (hasActive) {
    reasons.push("A sync run is already queued or running for this mind.");
  }

  // 2. At least one approved proposal
  const approvedCount = await MindSyncProposalModel.countApprovedByMind(mindId);
  if (approvedCount === 0) {
    reasons.push("No approved proposals to compile.");
  }

  return { allowed: reasons.length === 0, reasons };
}

export async function getMindStatus(mindId: string): Promise<{
  canStartScrape: boolean;
  canCompile: boolean;
  scrapeBlockingReasons: string[];
  compileBlockingReasons: string[];
  openBatchId: string | null;
  activeSyncRunId: string | null;
  activeSyncRunType: "scrape_compare" | "compile_publish" | null;
  latestScrapeRunId: string | null;
}> {
  const scrapeGating = await canStartScrapeCompare(mindId);
  const compileGating = await canStartCompilePublish(mindId);

  // Wizard metadata
  const batch = await MindDiscoveryBatchModel.findOpenByMind(mindId);
  const activeRun = await MindSyncRunModel.findActiveByMind(mindId);

  // Find latest completed scrape that has unfinalized proposals
  let latestScrapeRunId: string | null = null;
  const latestScrape = await MindSyncRunModel.findLatestCompletedScrape(mindId);
  if (latestScrape) {
    const counts = await MindSyncProposalModel.countByRunAndStatus(latestScrape.id);
    if (counts.pending > 0 || counts.approved > 0) {
      latestScrapeRunId = latestScrape.id;
    }
  }

  return {
    canStartScrape: scrapeGating.allowed,
    canCompile: compileGating.allowed,
    scrapeBlockingReasons: scrapeGating.reasons,
    compileBlockingReasons: compileGating.reasons,
    openBatchId: batch?.id || null,
    activeSyncRunId: activeRun?.id || null,
    activeSyncRunType: (activeRun?.type as "scrape_compare" | "compile_publish") || null,
    latestScrapeRunId,
  };
}
