import { useState } from "react";
import {
  Search,
  Trash2,
  Check,
  X,
  ExternalLink,
  ArrowRight,
  Inbox,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useConfirm } from "../../../ui/ConfirmModal";
import { ActionButton, StatusPill } from "../../../ui/DesignSystem";
import {
  triggerDiscovery,
  deleteDiscoveryBatch,
  updatePostStatus,
  type DiscoveryBatch,
  type DiscoveredPost,
} from "../../../../api/minds";

interface SlideDiscoveryTriageProps {
  mindId: string;
  mindName: string;
  batch: DiscoveryBatch | null;
  posts: DiscoveredPost[];
  onPostsChanged: () => void;
  onBatchDeleted: () => void;
  onContinue: () => void;
}

export function SlideDiscoveryTriage({
  mindId,
  mindName,
  batch,
  posts,
  onPostsChanged,
  onBatchDeleted,
  onContinue,
}: SlideDiscoveryTriageProps) {
  const confirm = useConfirm();
  const [runningDiscovery, setRunningDiscovery] = useState(false);
  const [deletingBatch, setDeletingBatch] = useState(false);
  const [localPosts, setLocalPosts] = useState<DiscoveredPost[]>(posts);

  // Sync local posts when parent data changes
  if (posts !== localPosts && posts.length !== localPosts.length) {
    setLocalPosts(posts);
  }

  const pendingCount = localPosts.filter((p) => p.status === "pending").length;
  const approvedCount = localPosts.filter((p) => p.status === "approved").length;
  const ignoredCount = localPosts.filter((p) => p.status === "ignored").length;
  const canContinue = pendingCount === 0 && approvedCount > 0;

  const handleRunDiscovery = async () => {
    setRunningDiscovery(true);
    const ok = await triggerDiscovery(mindId);
    if (ok) {
      toast.success("Discovery completed");
      onPostsChanged();
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
      onBatchDeleted();
    } else {
      toast.error("Failed to delete batch");
    }
    setDeletingBatch(false);
  };

  const handlePostStatus = async (postId: string, newStatus: "approved" | "ignored") => {
    const ok = await updatePostStatus(mindId, postId, newStatus);
    if (ok) {
      setLocalPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, status: newStatus } : p))
      );
      onPostsChanged();
    } else {
      toast.error("Failed to update post");
    }
  };

  const handleApproveAll = async () => {
    const pending = localPosts.filter((p) => p.status === "pending");
    for (const p of pending) {
      await updatePostStatus(mindId, p.id, "approved");
    }
    setLocalPosts((prev) =>
      prev.map((p) => (p.status === "pending" ? { ...p, status: "approved" } : p))
    );
    onPostsChanged();
    toast.success(`${pending.length} posts approved`);
  };

  const statusColor = (s: string): "orange" | "green" | "gray" => {
    switch (s) {
      case "pending": return "orange";
      case "approved": return "green";
      default: return "gray";
    }
  };

  // Empty state — no batch
  if (!batch) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <Inbox className="h-8 w-8 text-gray-300" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Library is Empty</h3>
        <p className="text-sm text-gray-500 mb-6 max-w-md">
          Run discovery to fill {mindName}'s bookshelf with fresh content from your sources.
        </p>
        <ActionButton
          label="Run Discovery"
          icon={<Search className="h-4 w-4" />}
          onClick={handleRunDiscovery}
          variant="primary"
          loading={runningDiscovery}
        />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Agentic Library
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Pick which books {mindName} should study today. Approve or shelve them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ActionButton
            label="Delete Batch"
            icon={<Trash2 className="h-4 w-4" />}
            onClick={handleDeleteBatch}
            variant="danger"
            size="sm"
            loading={deletingBatch}
          />
          <ActionButton
            label="Run Discovery"
            icon={<Search className="h-4 w-4" />}
            onClick={handleRunDiscovery}
            variant="secondary"
            size="sm"
            loading={runningDiscovery}
          />
        </div>
      </div>

      {/* Counts */}
      <div className="flex items-center gap-4 mb-4 text-xs">
        <span className={`font-medium ${pendingCount > 0 ? "text-amber-600" : "text-gray-400"}`}>
          {pendingCount} pending
        </span>
        <span className="text-green-600 font-medium">{approvedCount} approved</span>
        <span className="text-gray-400">{ignoredCount} ignored</span>
        {pendingCount > 0 && (
          <button
            onClick={handleApproveAll}
            className="text-alloro-orange hover:underline font-medium ml-auto"
          >
            Approve all pending
          </button>
        )}
      </div>

      {/* Posts list */}
      {localPosts.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">
          No posts found. Try running discovery again.
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {localPosts.map((post) => (
            <div
              key={post.id}
              className="flex items-center justify-between rounded-lg border border-gray-100 bg-white px-4 py-3"
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
      )}

      {/* Continue button */}
      <div className="mt-6 flex justify-end">
        <ActionButton
          label="Send to Classroom"
          icon={<ArrowRight className="h-4 w-4" />}
          onClick={onContinue}
          variant="primary"
          disabled={!canContinue}
        />
      </div>

      {!canContinue && localPosts.length > 0 && (
        <p className="mt-2 text-right text-xs text-gray-400">
          {pendingCount > 0
            ? `${pendingCount} posts still need triage`
            : "Approve at least one post to continue"}
        </p>
      )}
    </div>
  );
}
