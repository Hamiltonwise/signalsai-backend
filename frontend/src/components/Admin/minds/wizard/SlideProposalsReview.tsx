import { useState, useEffect, useRef } from "react";
import {
  Check,
  X,
  ArrowLeft,
  Loader2,
  Sparkles,
  AlertCircle,
  RotateCcw,
  Undo2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { ActionButton } from "../../../ui/DesignSystem";
import { CompileAnimation } from "./CompileAnimation";
import {
  getRunProposals,
  updateProposalStatus,
  startCompilePublish,
  getSyncRun,
  type SyncProposal,
  type SyncStep,
} from "../../../../api/minds";

interface SlideProposalsReviewProps {
  mindId: string;
  mindName: string;
  scrapeRunId: string;
  initialCompileRunId?: string | null;
  onBack: () => void;
  onDone: () => void;
}

function ProposalDiff({ proposal }: { proposal: SyncProposal }) {
  const [expanded, setExpanded] = useState(false);

  if (proposal.type === "NEW") {
    return (
      <div className="mt-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs font-medium text-green-700 hover:text-green-800 transition-colors"
        >
          {expanded ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
          {expanded ? "Hide" : "Show"} new content
        </button>
        {expanded && (
          <div className="mt-2 rounded-xl bg-green-50 border border-green-100 p-4 text-xs text-green-800 font-mono whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
            {proposal.proposed_text}
          </div>
        )}
      </div>
    );
  }

  // UPDATE or CONFLICT — show diff table
  return (
    <div className="mt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-800 transition-colors"
      >
        {expanded ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
        {expanded ? "Hide" : "Show"} diff
      </button>
      {expanded && (
        <div className="mt-2 grid grid-cols-2 gap-3">
          {proposal.target_excerpt && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-500 mb-1.5">
                Will Forget
              </p>
              <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-xs text-red-800 font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                {proposal.target_excerpt}
              </div>
            </div>
          )}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-green-600 mb-1.5">
              Will Learn
            </p>
            <div className="rounded-xl bg-green-50 border border-green-100 p-3 text-xs text-green-800 font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
              {proposal.proposed_text}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function SlideProposalsReview({
  mindId,
  mindName,
  scrapeRunId,
  initialCompileRunId,
  onBack,
  onDone,
}: SlideProposalsReviewProps) {
  const [proposals, setProposals] = useState<SyncProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [bulkApproving, setBulkApproving] = useState(false);

  // Compile state
  const [, setCompileRunId] = useState<string | null>(null);
  const [, setCompileSteps] = useState<SyncStep[]>([]);
  const [compiling, setCompiling] = useState(false);
  const [compileStarting, setCompileStarting] = useState(false);
  const [compileDone, setCompileDone] = useState(false);
  const [compileFailed, setCompileFailed] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchProposals();

    // Resume compile polling if we were mid-compile on refresh
    if (initialCompileRunId) {
      setCompileRunId(initialCompileRunId);
      setCompiling(true);
      startCompilePolling(initialCompileRunId);
    }

    return () => stopPolling();
  }, []);

  const fetchProposals = async () => {
    setLoading(true);
    const data = await getRunProposals(mindId, scrapeRunId);
    setProposals(data);
    setLoading(false);
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const handleProposalAction = async (
    proposalId: string,
    action: "approved" | "rejected" | "pending",
  ) => {
    setActioningId(proposalId);
    const ok = await updateProposalStatus(mindId, proposalId, action);
    if (ok) {
      setProposals((prev) =>
        prev.map((p) => (p.id === proposalId ? { ...p, status: action } : p)),
      );
    } else {
      toast.error("Failed to update proposal");
    }
    setActioningId(null);
  };

  const handleBulkApprove = async () => {
    setBulkApproving(true);
    const pending = proposals.filter((p) => p.status === "pending");
    for (const p of pending) {
      await updateProposalStatus(mindId, p.id, "approved");
    }
    setProposals((prev) =>
      prev.map((p) =>
        p.status === "pending" ? { ...p, status: "approved" } : p,
      ),
    );
    toast.success(`${pending.length} proposals approved`);
    setBulkApproving(false);
  };

  const handleCompile = async () => {
    setCompileStarting(true);
    setCompileFailed(false);
    setCompileError(null);
    const runId = await startCompilePublish(mindId);
    if (runId) {
      setCompileRunId(runId);
      setCompiling(true);
      startCompilePolling(runId);
    } else {
      toast.error("Failed to start Remember");
    }
    setCompileStarting(false);
  };

  const startCompilePolling = (runId: string) => {
    stopPolling();

    (async () => {
      const d = await getSyncRun(mindId, runId);
      if (d) {
        setCompileSteps(d.steps);
        if (d.run.status === "completed") {
          setCompiling(false);
          setCompileDone(true);
          toast.success("Brain published successfully");
          return;
        }
        if (d.run.status === "failed") {
          setCompiling(false);
          setCompileFailed(true);
          setCompileError(d.run.error_message);
          toast.error(d.run.error_message || "Compile failed");
          return;
        }
      }
    })();

    pollRef.current = setInterval(async () => {
      if (document.hidden) return;
      const d = await getSyncRun(mindId, runId);
      if (!d) return;
      setCompileSteps(d.steps);
      if (d.run.status === "completed") {
        stopPolling();
        setCompiling(false);
        setCompileDone(true);
        toast.success("Brain published successfully");
      } else if (d.run.status === "failed") {
        stopPolling();
        setCompiling(false);
        setCompileFailed(true);
        setCompileError(d.run.error_message);
        toast.error(d.run.error_message || "Compile failed");
      }
    }, 3000);
  };

  const totalCount = proposals.length;
  const pendingCount = proposals.filter((p) => p.status === "pending").length;
  const approvedCount = proposals.filter((p) => p.status === "approved").length;
  const rejectedCount = proposals.filter((p) => p.status === "rejected").length;
  const reviewedCount = approvedCount + rejectedCount;
  const canCompile = pendingCount === 0 && approvedCount > 0;
  const progressPct = totalCount > 0 ? (reviewedCount / totalCount) * 100 : 0;

  // ─── Compile Done State ────────────────────────────────────────

  if (compileDone) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-20 h-20 rounded-2xl bg-green-50 flex items-center justify-center mb-5">
          <Sparkles className="h-10 w-10 text-green-500" />
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">
          {mindName} Graduated
        </h3>
        <p className="text-sm text-gray-500 mb-8 max-w-md leading-relaxed">
          Knowledge compiled and published. {mindName} is now smarter than it
          was this morning.
        </p>
        <ActionButton
          label="Start New Batch"
          icon={<Sparkles className="h-4 w-4" />}
          onClick={onDone}
          variant="primary"
        />
      </div>
    );
  }

  // ─── Compile In Progress ───────────────────────────────────────

  if (compiling || compileFailed) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-base font-bold text-gray-900">
              Graduation Ceremony
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {compileFailed
                ? `${mindName} tripped on the stage.`
                : `${mindName} is walking the stage. Approved knowledge is being locked in.`}
            </p>
          </div>
          {compiling && (
            <div className="flex items-center gap-2 text-xs text-alloro-orange font-medium">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Compiling…
            </div>
          )}
        </div>

        <CompileAnimation />

        {compileFailed && compileError && (
          <div className="mt-4 rounded-xl bg-red-50 border border-red-100 p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-800">Compile Failed</p>
              <p className="text-xs text-red-600 mt-1">{compileError}</p>
            </div>
          </div>
        )}

        {compileFailed && (
          <div className="mt-6 flex justify-end">
            <ActionButton
              label="Retry Compile"
              icon={<RotateCcw className="h-4 w-4" />}
              onClick={handleCompile}
              variant="secondary"
              loading={compileStarting}
            />
          </div>
        )}
      </div>
    );
  }

  // ─── Proposals Review ──────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-base font-bold text-gray-900">Intake</h3>
        <p className="text-sm text-gray-500 mt-1 leading-relaxed max-w-2xl">
          Class is over. {mindName} stands at the gate. Time in slow motion. New
          knowledge on queue. You decide what {mindName} gets to forget — and
          what stays forever.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : proposals.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">
          No proposals found for this run.
          <div className="mt-4">
            <ActionButton
              label="Back to Library"
              icon={<ArrowLeft className="h-4 w-4" />}
              onClick={onBack}
              variant="ghost"
              size="sm"
            />
          </div>
        </div>
      ) : (
        <>
          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-600">
                {reviewedCount} of {totalCount} reviewed
              </span>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-green-600 font-semibold">
                  {approvedCount} approved
                </span>
                <span className="text-red-500 font-semibold">
                  {rejectedCount} rejected
                </span>
                {pendingCount > 0 && (
                  <span className="text-amber-600 font-semibold">
                    {pendingCount} pending
                  </span>
                )}
              </div>
            </div>
            <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${progressPct}%`,
                  background:
                    progressPct === 100
                      ? "linear-gradient(90deg, #22c55e, #16a34a)"
                      : "linear-gradient(90deg, #D66853, #f59e0b)",
                }}
              />
            </div>
          </div>

          {/* Bulk actions */}
          {pendingCount > 0 && (
            <div className="mb-4 flex justify-end">
              <button
                onClick={handleBulkApprove}
                disabled={bulkApproving}
                className="flex items-center gap-1.5 rounded-lg bg-green-50 border border-green-200 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50"
              >
                {bulkApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {bulkApproving ? "Approving..." : `Approve all ${pendingCount} pending`}
              </button>
            </div>
          )}

          {/* Proposal Cards */}
          <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1">
            {proposals.map((proposal) => (
              <div
                key={proposal.id}
                className={`rounded-2xl border bg-white p-5 shadow-sm transition-all ${
                  proposal.status === "approved"
                    ? "border-green-200 bg-green-50/30"
                    : proposal.status === "rejected"
                      ? "border-red-200 bg-red-50/20 opacity-70"
                      : "border-gray-200"
                }`}
              >
                {/* Card header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    {/* Type badge */}
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg ${
                          proposal.type === "NEW"
                            ? "bg-green-100 text-green-700"
                            : proposal.type === "UPDATE"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {proposal.type}
                      </span>
                    </div>

                    {/* Summary */}
                    <h4 className="text-sm font-semibold text-gray-900 leading-snug">
                      {proposal.summary}
                    </h4>

                    {/* Reason */}
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                      {proposal.reason}
                    </p>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    {proposal.status === "pending" && (
                      <>
                        <button
                          onClick={() =>
                            handleProposalAction(proposal.id, "approved")
                          }
                          disabled={actioningId === proposal.id}
                          className="flex items-center gap-1.5 rounded-xl bg-green-50 border border-green-200 px-3 py-2 text-xs font-semibold text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50"
                        >
                          {actioningId === proposal.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          Approve
                        </button>
                        <button
                          onClick={() =>
                            handleProposalAction(proposal.id, "rejected")
                          }
                          disabled={actioningId === proposal.id}
                          className="flex items-center gap-1.5 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                        >
                          {actioningId === proposal.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                          Reject
                        </button>
                      </>
                    )}
                    {proposal.status === "approved" && (
                      <>
                        <span className="flex items-center gap-1 text-xs font-semibold text-green-600">
                          <Check className="h-3.5 w-3.5" />
                          Approved
                        </span>
                        <button
                          onClick={() =>
                            handleProposalAction(proposal.id, "pending")
                          }
                          disabled={actioningId === proposal.id}
                          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
                          title="Undo"
                        >
                          {actioningId === proposal.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                          Undo
                        </button>
                      </>
                    )}
                    {proposal.status === "rejected" && (
                      <>
                        <span className="flex items-center gap-1 text-xs font-semibold text-red-500">
                          <X className="h-3.5 w-3.5" />
                          Rejected
                        </span>
                        <button
                          onClick={() =>
                            handleProposalAction(proposal.id, "pending")
                          }
                          disabled={actioningId === proposal.id}
                          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
                          title="Undo"
                        >
                          {actioningId === proposal.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                          Undo
                        </button>
                      </>
                    )}
                    {proposal.status === "finalized" && (
                      <span className="text-xs font-medium text-blue-500">
                        Finalized
                      </span>
                    )}
                  </div>
                </div>

                {/* Diff section */}
                <ProposalDiff proposal={proposal} />
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="mt-6 flex items-center justify-between">
            <ActionButton
              label="Back"
              icon={<ArrowLeft className="h-4 w-4" />}
              onClick={onBack}
              variant="ghost"
              size="sm"
            />
            <ActionButton
              label="Remember"
              icon={<Sparkles className="h-4 w-4" />}
              onClick={handleCompile}
              variant="primary"
              disabled={!canCompile}
              loading={compileStarting}
            />
          </div>

          {!canCompile && proposals.length > 0 && (
            <p className="mt-2 text-right text-xs text-gray-400">
              {pendingCount > 0
                ? `${pendingCount} proposals still need review`
                : "Approve at least one proposal to compile"}
            </p>
          )}
        </>
      )}
    </div>
  );
}
