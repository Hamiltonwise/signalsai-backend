import { useState, useEffect, useRef, useCallback } from "react";
import {
  Loader2,
  Search,
  Trash2,
  Play,
  Check,
  X,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useConfirm } from "../../ui/ConfirmModal";
import { ActionButton, StatusPill } from "../../ui/DesignSystem";
import {
  getDiscoveryBatch,
  updatePostStatus,
  triggerDiscovery,
  deleteDiscoveryBatch,
  startScrapeCompare,
  startCompilePublish,
  listSyncRuns,
  getSyncRun,
  getRunProposals,
  updateProposalStatus,
  getMindStatus,
  type DiscoveryBatch,
  type DiscoveredPost,
  type SyncRun,
  type SyncRunDetails,
  type SyncProposal,
  type MindStatus,
} from "../../../api/minds";

interface MindKnowledgeSyncTabProps {
  mindId: string;
  onStatusChange?: () => void;
}

export function MindKnowledgeSyncTab({ mindId, onStatusChange }: MindKnowledgeSyncTabProps) {
  const confirm = useConfirm();

  // Discovery state
  const [batch, setBatch] = useState<DiscoveryBatch | null>(null);
  const [posts, setPosts] = useState<DiscoveredPost[]>([]);
  const [loadingDiscovery, setLoadingDiscovery] = useState(true);
  const [runningDiscovery, setRunningDiscovery] = useState(false);
  const [deletingBatch, setDeletingBatch] = useState(false);

  // Sync runs state
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [startingScrape, setStartingScrape] = useState(false);
  const [startingCompile, setStartingCompile] = useState(false);

  // Active run polling
  const [activeRunDetails, setActiveRunDetails] = useState<SyncRunDetails | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Proposals state
  const [proposals, setProposals] = useState<SyncProposal[]>([]);
  const [loadingProposals, setLoadingProposals] = useState(false);
  const [proposalRunId, setProposalRunId] = useState<string | null>(null);

  // Gating status
  const [status, setStatus] = useState<MindStatus | null>(null);

  const refreshStatus = useCallback(async () => {
    const s = await getMindStatus(mindId);
    setStatus(s);
    onStatusChange?.();
  }, [mindId, onStatusChange]);

  const fetchDiscovery = async () => {
    setLoadingDiscovery(true);
    const data = await getDiscoveryBatch(mindId);
    setBatch(data.batch);
    setPosts(data.posts);
    setLoadingDiscovery(false);
  };

  const fetchRuns = async () => {
    setLoadingRuns(true);
    const data = await listSyncRuns(mindId);
    setRuns(data);
    setLoadingRuns(false);

    // Auto-expand active run
    const active = data.find(
      (r) => r.status === "queued" || r.status === "running"
    );
    if (active) {
      setExpandedRunId(active.id);
      startPolling(active.id);
    }
  };

  useEffect(() => {
    fetchDiscovery();
    fetchRuns();
    refreshStatus();
    return () => stopPolling();
  }, [mindId]);

  // ─── Polling ─────────────────────────────────────────────────

  const startPolling = (runId: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      if (document.hidden) return;
      const details = await getSyncRun(mindId, runId);
      if (details) {
        setActiveRunDetails(details);
        if (details.run.status === "completed" || details.run.status === "failed") {
          stopPolling();
          fetchRuns();
          fetchDiscovery();
          refreshStatus();
          if (details.run.status === "completed") {
            toast.success(`${details.run.type === "scrape_compare" ? "Scrape & Compare" : "Remember"} completed`);
          } else {
            toast.error(`Run failed: ${details.run.error_message || "Unknown error"}`);
          }
        }
      }
    }, 5000);
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  // ─── Discovery Handlers ──────────────────────────────────────

  const handleRunDiscovery = async () => {
    setRunningDiscovery(true);
    const ok = await triggerDiscovery(mindId);
    if (ok) {
      toast.success("Discovery completed");
      fetchDiscovery();
      refreshStatus();
    } else {
      toast.error("Discovery failed");
    }
    setRunningDiscovery(false);
  };

  const handleDeleteBatch = async () => {
    if (!batch) return;
    const ok = await confirm({ title: "Delete this batch?", message: "All posts in this batch will be deleted. This cannot be undone.", confirmLabel: "Delete", variant: "danger" });
    if (!ok) return;
    setDeletingBatch(true);
    const deleted = await deleteDiscoveryBatch(mindId, batch.id);
    if (deleted) {
      toast.success("Batch deleted");
      fetchDiscovery();
      refreshStatus();
    } else {
      toast.error("Failed to delete batch");
    }
    setDeletingBatch(false);
  };

  const handlePostStatus = async (
    postId: string,
    newStatus: "approved" | "ignored"
  ) => {
    const ok = await updatePostStatus(mindId, postId, newStatus);
    if (ok) {
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, status: newStatus } : p))
      );
      refreshStatus();
    } else {
      toast.error("Failed to update post");
    }
  };

  // ─── Sync Handlers ───────────────────────────────────────────

  const handleStartScrape = async () => {
    setStartingScrape(true);
    const runId = await startScrapeCompare(mindId);
    if (runId) {
      toast.success("Scrape & Compare started");
      setExpandedRunId(runId);
      startPolling(runId);
      fetchRuns();
      refreshStatus();
    } else {
      toast.error("Failed to start scrape & compare");
    }
    setStartingScrape(false);
  };

  const handleStartCompile = async () => {
    setStartingCompile(true);
    const runId = await startCompilePublish(mindId);
    if (runId) {
      toast.success("Remember started");
      setExpandedRunId(runId);
      startPolling(runId);
      fetchRuns();
      refreshStatus();
    } else {
      toast.error("Failed to start remember");
    }
    setStartingCompile(false);
  };

  const handleExpandRun = async (runId: string) => {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      setActiveRunDetails(null);
      return;
    }
    setExpandedRunId(runId);
    const details = await getSyncRun(mindId, runId);
    setActiveRunDetails(details);
  };

  // ─── Proposals Handlers ──────────────────────────────────────

  const handleViewProposals = async (runId: string) => {
    setLoadingProposals(true);
    setProposalRunId(runId);
    const data = await getRunProposals(mindId, runId);
    setProposals(data);
    setLoadingProposals(false);
  };

  const handleProposalAction = async (
    proposalId: string,
    action: "approved" | "rejected"
  ) => {
    const ok = await updateProposalStatus(mindId, proposalId, action);
    if (ok) {
      setProposals((prev) =>
        prev.map((p) => (p.id === proposalId ? { ...p, status: action } : p))
      );
      refreshStatus();
    } else {
      toast.error("Failed to update proposal");
    }
  };

  const handleBulkApprove = async () => {
    const pending = proposals.filter((p) => p.status === "pending");
    for (const p of pending) {
      await updateProposalStatus(mindId, p.id, "approved");
    }
    setProposals((prev) =>
      prev.map((p) => (p.status === "pending" ? { ...p, status: "approved" } : p))
    );
    refreshStatus();
    toast.success(`${pending.length} proposals approved`);
  };

  // ─── Counts ──────────────────────────────────────────────────

  const pendingPosts = posts.filter((p) => p.status === "pending").length;
  const approvedPosts = posts.filter((p) => p.status === "approved").length;
  const ignoredPosts = posts.filter((p) => p.status === "ignored").length;

  const statusColor = (s: string): "orange" | "green" | "red" | "blue" | "gray" => {
    switch (s) {
      case "pending": return "orange";
      case "approved": return "green";
      case "ignored": case "rejected": return "gray";
      case "processed": case "completed": case "finalized": return "blue";
      case "running": case "queued": return "orange";
      case "failed": return "red";
      default: return "gray";
    }
  };

  const stepStatusIcon = (s: string) => {
    switch (s) {
      case "completed": return <Check className="h-3.5 w-3.5 text-green-500" />;
      case "running": return <Loader2 className="h-3.5 w-3.5 text-amber-500 animate-spin" />;
      case "failed": return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
      default: return <div className="h-3.5 w-3.5 rounded-full border-2 border-gray-300" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── Discovery Section ────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">
            Discovery Batch
          </h3>
          <div className="flex items-center gap-2">
            {batch && (
              <ActionButton
                label="Delete Batch"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={handleDeleteBatch}
                variant="danger"
                size="sm"
                loading={deletingBatch}
              />
            )}
            <ActionButton
              label="Run Discovery"
              icon={<Search className="h-4 w-4" />}
              onClick={handleRunDiscovery}
              variant="primary"
              size="sm"
              loading={runningDiscovery}
            />
          </div>
        </div>

        {loadingDiscovery ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : !batch ? (
          <p className="text-sm text-gray-400 py-6 text-center">
            No open discovery batch. Run discovery to find new posts from sources.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-4 mb-4 text-xs text-gray-500">
              <span>{pendingPosts} pending</span>
              <span>{approvedPosts} approved</span>
              <span>{ignoredPosts} ignored</span>
              <span className="text-gray-300">|</span>
              <span>{posts.length} total posts</span>
            </div>

            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {posts.map((post) => (
                <div
                  key={post.id}
                  className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <StatusPill label={post.status} color={statusColor(post.status)} />
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-gray-800 truncate hover:text-alloro-orange flex items-center gap-1"
                      >
                        {post.title || post.url}
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    </div>
                    {post.published_at && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Published {new Date(post.published_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  {post.status === "pending" && (
                    <div className="flex items-center gap-1 ml-3">
                      <button
                        onClick={() => handlePostStatus(post.id, "approved")}
                        className="rounded-lg p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50"
                        title="Approve"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handlePostStatus(post.id, "ignored")}
                        className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                        title="Ignore"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  {(post.status === "approved" || post.status === "ignored") && (
                    <button
                      onClick={() =>
                        handlePostStatus(
                          post.id,
                          post.status === "approved" ? "ignored" : "approved"
                        )
                      }
                      className="text-xs text-gray-400 hover:text-gray-600 ml-3"
                    >
                      Undo
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* ─── Sync Runs Section ────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Sync Runs</h3>
          <div className="flex items-center gap-2">
            <div className="relative group">
              <ActionButton
                label="Scrape & Compare"
                icon={<Play className="h-4 w-4" />}
                onClick={handleStartScrape}
                variant="secondary"
                size="sm"
                loading={startingScrape}
                disabled={!status?.canStartScrape}
              />
              {status && !status.canStartScrape && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 z-10">
                  <div className="rounded-lg bg-gray-900 text-white text-xs p-2 shadow-lg">
                    {status.scrapeBlockingReasons.map((r, i) => (
                      <p key={i}>{r}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="relative group">
              <ActionButton
                label="Remember"
                icon={<Play className="h-4 w-4" />}
                onClick={handleStartCompile}
                variant="primary"
                size="sm"
                loading={startingCompile}
                disabled={!status?.canCompile}
              />
              {status && !status.canCompile && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 z-10">
                  <div className="rounded-lg bg-gray-900 text-white text-xs p-2 shadow-lg">
                    {status.compileBlockingReasons.map((r, i) => (
                      <p key={i}>{r}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {loadingRuns ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : runs.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">
            No sync runs yet. Triage discovery posts, then start a scrape & compare.
          </p>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <div key={run.id} className="rounded-lg border border-gray-100">
                <button
                  onClick={() => handleExpandRun(run.id)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    {expandedRunId === run.id ? (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    )}
                    <StatusPill
                      label={run.status}
                      color={statusColor(run.status)}
                    />
                    <span className="text-sm text-gray-800">
                      {run.type === "scrape_compare"
                        ? "Scrape & Compare"
                        : "Remember"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    {run.finished_at && (
                      <span>
                        {new Date(run.finished_at).toLocaleString()}
                      </span>
                    )}
                    {!run.finished_at && run.started_at && (
                      <span>Started {new Date(run.started_at).toLocaleString()}</span>
                    )}
                    {run.type === "scrape_compare" &&
                      (run.status === "completed" || run.status === "failed") && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewProposals(run.id);
                          }}
                          className="text-alloro-orange hover:underline"
                        >
                          View Proposals
                        </button>
                      )}
                  </div>
                </button>

                {/* Expanded run details */}
                {expandedRunId === run.id && activeRunDetails && (
                  <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                    <div className="space-y-2">
                      {activeRunDetails.steps.map((step) => (
                        <div
                          key={step.id}
                          className="flex items-center gap-3 text-sm"
                        >
                          {stepStatusIcon(step.status)}
                          <span
                            className={
                              step.status === "running"
                                ? "text-amber-600 font-medium"
                                : step.status === "failed"
                                ? "text-red-600"
                                : "text-gray-600"
                            }
                          >
                            {step.step_name}
                          </span>
                          {step.error_message && (
                            <span className="text-xs text-red-400 truncate">
                              {step.error_message}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    {activeRunDetails.run.error_message && (
                      <div className="mt-3 rounded-lg bg-red-50 border border-red-100 p-3 text-xs text-red-700">
                        {activeRunDetails.run.error_message}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── Proposals Section ────────────────────────────────── */}
      {proposalRunId && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">
              Proposals
            </h3>
            <div className="flex items-center gap-2">
              {proposals.some((p) => p.status === "pending") && (
                <ActionButton
                  label="Approve All"
                  icon={<Check className="h-4 w-4" />}
                  onClick={handleBulkApprove}
                  variant="primary"
                  size="sm"
                />
              )}
              <button
                onClick={() => {
                  setProposalRunId(null);
                  setProposals([]);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {loadingProposals ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : proposals.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">
              No proposals found for this run.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>
                  {proposals.filter((p) => p.status === "pending").length} pending
                </span>
                <span>
                  {proposals.filter((p) => p.status === "approved").length} approved
                </span>
                <span>
                  {proposals.filter((p) => p.status === "rejected").length} rejected
                </span>
              </div>

              {proposals.map((proposal) => (
                <div
                  key={proposal.id}
                  className="rounded-lg border border-gray-100 bg-gray-50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                            proposal.type === "NEW"
                              ? "bg-green-100 text-green-700"
                              : proposal.type === "UPDATE"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {proposal.type}
                        </span>
                        <StatusPill
                          label={proposal.status}
                          color={statusColor(proposal.status)}
                        />
                      </div>
                      <p className="text-sm font-medium text-gray-800">
                        {proposal.summary}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {proposal.reason}
                      </p>
                      {proposal.target_excerpt && (
                        <div className="mt-2 rounded bg-red-50 border border-red-100 p-2 text-xs text-red-800 font-mono whitespace-pre-wrap">
                          {proposal.target_excerpt}
                        </div>
                      )}
                      <div className="mt-2 rounded bg-green-50 border border-green-100 p-2 text-xs text-green-800 font-mono whitespace-pre-wrap">
                        {proposal.proposed_text}
                      </div>
                    </div>
                    {proposal.status === "pending" && (
                      <div className="flex flex-col gap-1 shrink-0">
                        <button
                          onClick={() =>
                            handleProposalAction(proposal.id, "approved")
                          }
                          className="rounded-lg p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50"
                          title="Approve"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() =>
                            handleProposalAction(proposal.id, "rejected")
                          }
                          className="rounded-lg p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50"
                          title="Reject"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
