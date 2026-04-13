import { useState, useEffect, useRef, useCallback } from "react";
import {
  Loader2,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Image,
  FileText,
  Video,
  Music,
  File,
  ChevronRight,
  ArrowLeft,
  ThumbsUp,
  ThumbsDown,
  X,
  Trash2,
} from "lucide-react";
import { toast } from "react-hot-toast";
import ReactMarkdown from "react-markdown";
import { ActionButton, StatusPill, EmptyState } from "../../ui/DesignSystem";
import {
  listWorkRuns,
  getWorkRun,
  triggerManualRun,
  approveWorkRun,
  rejectWorkRun,
  deleteWorkRun,
  type MindSkill,
  type SkillWorkRun,
  type WorkRunStatus,
} from "../../../api/minds";

interface WorkRunsTabProps {
  mindId: string;
  skill: MindSkill;
  rejectionCategories: string[];
}

const POLL_INTERVAL = 4000;

const ACTIVE_STATUSES: WorkRunStatus[] = [
  "pending",
  "running",
  "consulting",
  "creating",
  "publishing",
];

const STATUS_STEPS: WorkRunStatus[] = [
  "pending",
  "running",
  "consulting",
  "creating",
  "awaiting_review",
];

function statusColor(
  s: WorkRunStatus
): "gray" | "orange" | "green" | "red" {
  switch (s) {
    case "pending":
      return "gray";
    case "running":
    case "consulting":
    case "creating":
    case "publishing":
      return "orange";
    case "awaiting_review":
      return "orange";
    case "approved":
    case "published":
      return "green";
    case "rejected":
    case "failed":
      return "red";
    default:
      return "gray";
  }
}

function statusLabel(s: WorkRunStatus): string {
  return s.replace(/_/g, " ");
}

function artifactIcon(type: string | null) {
  switch (type) {
    case "image":
      return <Image className="h-4 w-4" />;
    case "video":
      return <Video className="h-4 w-4" />;
    case "audio":
      return <Music className="h-4 w-4" />;
    case "text":
    case "markdown":
      return <FileText className="h-4 w-4" />;
    case "pdf":
    case "docx":
      return <File className="h-4 w-4" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
}

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Status Progression ─────────────────────────────────────────
function StatusProgression({ status }: { status: WorkRunStatus }) {
  const currentIdx = STATUS_STEPS.indexOf(status);
  const isFailed = status === "failed";
  const isTerminal = ["approved", "rejected", "published"].includes(status);

  return (
    <div className="flex items-center gap-1 mb-6">
      {STATUS_STEPS.map((step, i) => {
        const isActive = step === status;
        const isPast = currentIdx > i || isTerminal;
        return (
          <div key={step} className="flex items-center gap-1 flex-1">
            <div
              className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                isPast
                  ? "bg-green-400"
                  : isActive
                    ? isFailed
                      ? "bg-red-400"
                      : "bg-alloro-orange animate-pulse"
                    : "bg-white/[0.08]"
              }`}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Work Run Detail ─────────────────────────────────────────────
function WorkRunDetail({
  mindId,
  skill,
  workRunId,
  rejectionCategories,
  onBack,
  onStatusChange,
}: {
  mindId: string;
  skill: MindSkill;
  workRunId: string;
  rejectionCategories: string[];
  onBack: () => void;
  onStatusChange: () => void;
}) {
  const [run, setRun] = useState<SkillWorkRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectCategory, setRejectCategory] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRun = useCallback(async () => {
    const data = await getWorkRun(mindId, skill.id, workRunId);
    if (data) {
      setRun(data);
      setLoading(false);
    }
  }, [mindId, skill.id, workRunId]);

  useEffect(() => {
    fetchRun();
  }, [fetchRun]);

  // Polling for active statuses
  useEffect(() => {
    if (
      run &&
      ACTIVE_STATUSES.includes(run.status)
    ) {
      pollRef.current = setInterval(fetchRun, POLL_INTERVAL);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [run?.status, fetchRun]);

  const handleApprove = async () => {
    if (!run) return;
    setApproving(true);
    const ok = await approveWorkRun(mindId, skill.id, run.id);
    if (ok) {
      toast.success("Work run approved");
      await fetchRun();
      onStatusChange();
    } else {
      toast.error("Failed to approve");
    }
    setApproving(false);
  };

  const handleReject = async () => {
    if (!run) return;
    setRejecting(true);
    const ok = await rejectWorkRun(
      mindId,
      skill.id,
      run.id,
      rejectCategory || undefined,
      rejectReason || undefined
    );
    if (ok) {
      toast.success("Work run rejected");
      setShowRejectModal(false);
      await fetchRun();
      onStatusChange();
    } else {
      toast.error("Failed to reject");
    }
    setRejecting(false);
  };

  const handleDelete = async () => {
    if (!run) return;
    setDeleting(true);
    const ok = await deleteWorkRun(mindId, skill.id, run.id);
    if (ok) {
      toast.success("Work run deleted");
      onStatusChange();
      onBack();
    } else {
      toast.error("Failed to delete");
    }
    setDeleting(false);
  };

  if (loading || !run) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-[#6a6a75]" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="rounded-lg p-1.5 text-[#6a6a75] hover:text-[#eaeaea] hover:bg-white/[0.06] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-[#eaeaea]">
            {run.title || "Untitled Work Run"}
          </h4>
          <p className="text-xs text-[#6a6a75]">
            {run.triggered_by === "manual" ? "Manual" : "Scheduled"} ·{" "}
            {timeAgo(run.triggered_at)}
          </p>
        </div>
        <StatusPill label={statusLabel(run.status)} color={statusColor(run.status)} />
      </div>

      {/* Status progression */}
      <StatusProgression status={run.status} />

      {/* Error */}
      {run.status === "failed" && run.error && (
        <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="h-4 w-4" />
            <span className="font-medium">Error</span>
          </div>
          <p className="text-xs text-red-400/80">{run.error}</p>
        </div>
      )}

      {/* Artifacts -- side-by-side when both present */}
      {(run.artifact_url || run.artifact_content || run.artifact_attachment_url) && (
        <div className={`mb-4 ${run.artifact_attachment_url && (run.artifact_url || run.artifact_content) ? "grid grid-cols-2 gap-3" : ""}`}>
          {/* Main artifact */}
          {(run.artifact_url || run.artifact_content) && (
            <div className="rounded-xl border border-white/8 bg-white/[0.04] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/8 flex items-center gap-2">
                {artifactIcon(run.artifact_type)}
                <span className="text-xs font-medium text-[#a0a0a8] capitalize">
                  {run.artifact_type || (run.artifact_content ? "text" : "unknown")} Artifact
                </span>
                {run.artifact_url && (
                  <a
                    href={run.artifact_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-xs text-alloro-orange hover:underline flex items-center gap-1"
                  >
                    Open <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <div className="p-4 max-h-[400px] overflow-y-auto">
                {run.artifact_type === "image" && run.artifact_url ? (
                  <img
                    src={run.artifact_url}
                    alt={run.title || "Artifact"}
                    className="w-full h-auto rounded-lg object-contain"
                  />
                ) : run.artifact_content ? (
                  run.artifact_type === "markdown" ? (
                    <div className="prose prose-sm prose-invert max-w-none">
                      <ReactMarkdown>{run.artifact_content}</ReactMarkdown>
                    </div>
                  ) : (
                    <pre className="text-xs text-[#c2c0b6] whitespace-pre-wrap font-mono">
                      {run.artifact_content}
                    </pre>
                  )
                ) : (
                  <p className="text-xs text-[#6a6a75] italic">
                    Artifact available at URL only
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Attachment */}
          {run.artifact_attachment_url && (
            <div className="rounded-xl border border-white/8 bg-white/[0.04] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/8 flex items-center gap-2">
                {artifactIcon(run.artifact_attachment_type)}
                <span className="text-xs font-medium text-[#a0a0a8] capitalize">
                  {run.artifact_attachment_type || "Attachment"} Attachment
                </span>
                <a
                  href={run.artifact_attachment_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-xs text-alloro-orange hover:underline flex items-center gap-1"
                >
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="p-4">
                {run.artifact_attachment_type === "image" ? (
                  <img
                    src={run.artifact_attachment_url}
                    alt={`${run.title || "Work"} attachment`}
                    className="w-full h-auto rounded-lg object-contain"
                  />
                ) : (
                  <p className="text-xs text-[#6a6a75] italic">
                    Attachment available at URL
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {!run.artifact_url && !run.artifact_content && ACTIVE_STATUSES.includes(run.status) ? (
        <div className="mb-4 rounded-xl border border-dashed border-white/8 bg-white/[0.02] p-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-alloro-orange mx-auto mb-2" />
          <p className="text-sm text-[#a0a0a8] capitalize">
            {statusLabel(run.status)}...
          </p>
        </div>
      ) : null}

      {/* Description */}
      {run.description && (
        <div className="mb-4">
          <label className="block text-xs font-semibold text-[#a0a0a8] mb-1">
            Description
          </label>
          <p className="text-sm text-[#c2c0b6]">{run.description}</p>
        </div>
      )}

      {/* Publication info */}
      {run.status === "published" && run.publication_url && (
        <div className="mb-4 rounded-xl bg-green-500/10 border border-green-500/20 p-4">
          <div className="flex items-center gap-2 text-sm text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            <span className="font-medium">Published</span>
            <a
              href={run.publication_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-xs text-green-400 hover:underline flex items-center gap-1"
            >
              View <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}

      {/* Rejection info */}
      {run.status === "rejected" && (
        <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 p-4">
          <div className="flex items-center gap-2 text-sm text-red-400 mb-1">
            <XCircle className="h-4 w-4" />
            <span className="font-medium">Rejected</span>
            {run.rejection_category && (
              <span className="text-xs bg-red-500/20 text-red-400 rounded-full px-2 py-0.5">
                {run.rejection_category.replace(/_/g, " ")}
              </span>
            )}
          </div>
          {run.rejection_reason && (
            <p className="text-xs text-red-400/80 mt-1">{run.rejection_reason}</p>
          )}
        </div>
      )}

      {/* Approve / Reject buttons */}
      {run.status === "awaiting_review" && (
        <div className="flex gap-3 pt-2">
          <ActionButton
            label="Approve"
            icon={<ThumbsUp className="h-4 w-4" />}
            onClick={handleApprove}
            variant="primary"
            loading={approving}
          />
          <ActionButton
            label="Reject"
            icon={<ThumbsDown className="h-4 w-4" />}
            onClick={() => setShowRejectModal(true)}
            variant="ghost"
          />
        </div>
      )}

      {/* Delete button -- always visible */}
      <div className="flex justify-end pt-4 mt-4 border-t border-white/8">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
        >
          {deleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          Delete
        </button>
      </div>

      {/* Reject modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="rounded-2xl shadow-xl p-6 w-full max-w-md mx-4" style={{ backgroundColor: "#1a1a18" }}>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-semibold text-[#eaeaea]">
                Reject Work Run
              </h4>
              <button
                onClick={() => setShowRejectModal(false)}
                className="text-[#6a6a75] hover:text-[#eaeaea]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="block text-xs font-semibold text-[#a0a0a8] mb-2">
              Category
            </label>
            <div className="flex flex-wrap gap-2 mb-4">
              {rejectionCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() =>
                    setRejectCategory(rejectCategory === cat ? "" : cat)
                  }
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    rejectCategory === cat
                      ? "bg-red-500/20 text-red-400 border border-red-500/30"
                      : "bg-white/[0.04] text-[#a0a0a8] border border-white/8 hover:bg-white/[0.08]"
                  }`}
                >
                  {cat.replace(/_/g, " ")}
                </button>
              ))}
            </div>

            <label className="block text-xs font-semibold text-[#a0a0a8] mb-2">
              Notes (optional)
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Why is this being rejected?"
              className="w-full rounded-xl border border-white/8 px-3 py-2 text-sm text-[#c2c0b6] placeholder-[#6a6a75] focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange resize-none mb-4"
              style={{ backgroundColor: "#111110" }}
            />

            <div className="flex justify-end gap-2">
              <ActionButton
                label="Cancel"
                onClick={() => setShowRejectModal(false)}
                variant="ghost"
                size="sm"
              />
              <ActionButton
                label="Reject"
                icon={<ThumbsDown className="h-4 w-4" />}
                onClick={handleReject}
                variant="primary"
                size="sm"
                loading={rejecting}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Work Runs Tab (List View) ───────────────────────────────────
export function WorkRunsTab({ mindId, skill, rejectionCategories }: WorkRunsTabProps) {
  const [runs, setRuns] = useState<SkillWorkRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRuns = useCallback(async () => {
    const data = await listWorkRuns(mindId, skill.id);
    setRuns(data);
    setLoading(false);
  }, [mindId, skill.id]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  // Poll if any run is active
  useEffect(() => {
    const hasActive = runs.some((r) => ACTIVE_STATUSES.includes(r.status));
    if (hasActive) {
      pollRef.current = setInterval(fetchRuns, POLL_INTERVAL);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [runs, fetchRuns]);

  const handleTrigger = async () => {
    setTriggering(true);
    const run = await triggerManualRun(mindId, skill.id);
    if (run) {
      toast.success("Work run triggered");
      fetchRuns();
    } else {
      toast.error("Failed to trigger run");
    }
    setTriggering(false);
  };

  const handleDelete = async (e: React.MouseEvent, runId: string) => {
    e.stopPropagation();
    setDeletingId(runId);
    const ok = await deleteWorkRun(mindId, skill.id, runId);
    if (ok) {
      toast.success("Work run deleted");
      fetchRuns();
    } else {
      toast.error("Failed to delete");
    }
    setDeletingId(null);
  };

  if (selectedRunId) {
    return (
      <WorkRunDetail
        mindId={mindId}
        skill={skill}
        workRunId={selectedRunId}
        rejectionCategories={rejectionCategories}
        onBack={() => {
          setSelectedRunId(null);
          fetchRuns();
        }}
        onStatusChange={fetchRuns}
      />
    );
  }

  return (
    <div>
      {/* Header with trigger button */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-sm font-semibold text-[#eaeaea]">Work Runs</h4>
          <p className="text-xs text-[#6a6a75] mt-0.5">
            {runs.length} run{runs.length !== 1 ? "s" : ""} total
          </p>
        </div>
        <div className="flex gap-2">
          <ActionButton
            label="Refresh"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={fetchRuns}
            variant="ghost"
            size="sm"
          />
          {skill.work_creation_type && (
            <ActionButton
              label="Run Now"
              icon={<Play className="h-3.5 w-3.5" />}
              onClick={handleTrigger}
              variant="primary"
              size="sm"
              loading={triggering}
            />
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-[#6a6a75]" />
        </div>
      ) : runs.length === 0 ? (
        <EmptyState
          icon={<Clock className="h-8 w-8" />}
          title="No work runs yet"
          description={
            skill.work_creation_type
              ? 'Click "Run Now" to trigger the first work run, or configure a schedule.'
              : "Configure a work creation type to enable work runs."
          }
        />
      ) : (
        <div className="space-y-2">
          {runs.map((run) => (
            <div
              key={run.id}
              onClick={() => setSelectedRunId(run.id)}
              className="w-full flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.04] px-4 py-3 text-left hover:border-alloro-orange/30 hover:bg-white/[0.06] transition-all group cursor-pointer"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-[#6a6a75] group-hover:bg-alloro-orange/10 group-hover:text-alloro-orange transition-colors">
                {ACTIVE_STATUSES.includes(run.status) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : run.status === "awaiting_review" ? (
                  <Clock className="h-4 w-4 text-amber-500" />
                ) : run.status === "approved" || run.status === "published" ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : run.status === "rejected" ? (
                  <XCircle className="h-4 w-4 text-red-500" />
                ) : run.status === "failed" ? (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                ) : (
                  artifactIcon(run.artifact_type)
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#eaeaea] truncate">
                  {run.title || "Untitled"}
                </p>
                <p className="text-xs text-[#6a6a75]">
                  {run.triggered_by === "manual" ? "Manual" : "Scheduled"} ·{" "}
                  {timeAgo(run.triggered_at)}
                </p>
              </div>
              <StatusPill
                label={statusLabel(run.status)}
                color={statusColor(run.status)}
              />
              <button
                onClick={(e) => handleDelete(e, run.id)}
                disabled={deletingId === run.id}
                className="p-1.5 rounded-lg text-[#6a6a75] hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
              >
                {deletingId === run.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </button>
              <ChevronRight className="h-4 w-4 text-[#6a6a75] group-hover:text-[#a0a0a8]" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
