/**
 * AI Command Tab
 *
 * Batch AI analysis + review UI for website content.
 * Persists batches across refresh. Shows batch history.
 * States: History → Input → Analyzing → Results (approve/reject/execute).
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Loader2,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  AlertCircle,
  Zap,
  FileText,
  Layout,
  Newspaper,
  Trash2,
  Plus,
  ArrowLeft,
} from "lucide-react";
import {
  createAiCommandBatch,
  fetchAiCommandBatch,
  fetchAiCommandRecommendations,
  updateAiCommandRecommendation,
  bulkUpdateAiCommandRecommendations,
  executeAiCommandBatch,
  listAiCommandBatches,
  deleteAiCommandBatch,
} from "../../api/websites";
import type {
  AiCommandBatch,
  AiCommandRecommendation,
  AiCommandTargets,
  AiCommandBatchStats,
  WebsitePage,
} from "../../api/websites";
import { toast } from "react-hot-toast";

interface AiCommandTabProps {
  projectId: string;
  pages?: WebsitePage[];
}

interface PostItem {
  id: string;
  title: string;
  slug: string;
  post_type_slug?: string;
}

type TargetMode = "all" | "specific" | "off";
type ViewState = "history" | "input" | "analyzing" | "results" | "executing" | "completed";

function parseStats(raw: AiCommandBatchStats | string | null): AiCommandBatchStats {
  if (!raw) return { total: 0, pending: 0, approved: 0, rejected: 0, executed: 0, failed: 0 };
  if (typeof raw === "string") return JSON.parse(raw);
  return raw;
}

export default function AiCommandTab({ projectId, pages = [] }: AiCommandTabProps) {
  const [viewState, setViewState] = useState<ViewState>("history");
  const [prompt, setPrompt] = useState("");

  // Target selection
  const [pagesMode, setPagesMode] = useState<TargetMode>("all");
  const [postsMode, setPostsMode] = useState<TargetMode>("all");
  const [layoutsMode, setLayoutsMode] = useState<TargetMode>("all");
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set());
  const [selectedLayouts, setSelectedLayouts] = useState<Set<string>>(new Set(["wrapper", "header", "footer"]));

  // Posts fetched internally
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [postsLoaded, setPostsLoaded] = useState(false);

  // Batch state
  const [batches, setBatches] = useState<AiCommandBatch[]>([]);
  const [batchesLoaded, setBatchesLoaded] = useState(false);
  const [batch, setBatch] = useState<AiCommandBatch | null>(null);
  const [recommendations, setRecommendations] = useState<AiCommandRecommendation[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingRecId, setLoadingRecId] = useState<string | null>(null);
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);

  // Load batches on mount
  useEffect(() => {
    if (batchesLoaded) return;
    (async () => {
      try {
        const res = await listAiCommandBatches(projectId);
        setBatches(res.data || []);
      } catch { /* ignore */ }
      setBatchesLoaded(true);
    })();
  }, [projectId, batchesLoaded]);

  // Fetch posts on mount
  useEffect(() => {
    if (postsLoaded) return;
    (async () => {
      try {
        const response = await fetch(`/api/admin/websites/${projectId}/posts`);
        if (response.ok) {
          const data = await response.json();
          setPosts(data.data || []);
        }
      } catch { /* ignore */ }
      setPostsLoaded(true);
    })();
  }, [projectId, postsLoaded]);

  // Unique pages by path
  const uniquePages = (() => {
    const seen = new Map<string, WebsitePage>();
    for (const p of pages) {
      const existing = seen.get(p.path);
      if (!existing || (p.status === "draft" && existing.status !== "draft")) {
        seen.set(p.path, p);
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.path.localeCompare(b.path));
  })();

  const buildTargets = (): AiCommandTargets => {
    const t: AiCommandTargets = {};
    if (pagesMode === "all") t.pages = "all";
    else if (pagesMode === "specific" && selectedPageIds.size > 0) t.pages = Array.from(selectedPageIds);
    if (postsMode === "all") t.posts = "all";
    else if (postsMode === "specific" && selectedPostIds.size > 0) t.posts = Array.from(selectedPostIds);
    if (layoutsMode === "all") t.layouts = "all";
    else if (layoutsMode === "specific" && selectedLayouts.size > 0) t.layouts = Array.from(selectedLayouts);
    return t;
  };

  const hasAnyTarget = () => {
    return (pagesMode === "all") || (pagesMode === "specific" && selectedPageIds.size > 0) ||
           (postsMode === "all") || (postsMode === "specific" && selectedPostIds.size > 0) ||
           (layoutsMode === "all") || (layoutsMode === "specific" && selectedLayouts.size > 0);
  };

  // Poll batch status
  useEffect(() => {
    if (!batch || (viewState !== "analyzing" && viewState !== "executing")) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetchAiCommandBatch(projectId, batch.id);
        const updated = res.data;
        setBatch(updated);
        if (viewState === "analyzing" && (updated.status === "ready" || updated.status === "failed")) {
          clearInterval(interval);
          if (updated.status === "ready") {
            const recsRes = await fetchAiCommandRecommendations(projectId, batch.id);
            setRecommendations(recsRes.data);
            setExpandedGroups(new Set(recsRes.data.map((r) => subGroupKey(r))));
          }
          setViewState("results");
          refreshBatchList();
        }
        if (viewState === "executing" && (updated.status === "completed" || updated.status === "failed")) {
          clearInterval(interval);
          const recsRes = await fetchAiCommandRecommendations(projectId, batch.id);
          setRecommendations(recsRes.data);
          setViewState("completed");
          refreshBatchList();
        }
      } catch { /* retry */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [batch, viewState, projectId]);

  const refreshBatchList = async () => {
    try {
      const res = await listAiCommandBatches(projectId);
      setBatches(res.data || []);
    } catch { /* ignore */ }
  };

  // Open an existing batch
  const openBatch = useCallback(async (b: AiCommandBatch) => {
    setBatch(b);
    if (b.status === "analyzing") {
      setViewState("analyzing");
      return;
    }
    if (b.status === "executing") {
      setViewState("executing");
      return;
    }
    try {
      const recsRes = await fetchAiCommandRecommendations(projectId, b.id);
      setRecommendations(recsRes.data);
      // Only expand groups that have pending items
      const pending = recsRes.data.filter((r) => r.status === "pending");
      setExpandedGroups(new Set(pending.map((r) => subGroupKey(r))));
    } catch {
      toast.error("Failed to load recommendations");
    }
    setViewState(b.status === "completed" ? "completed" : "results");
  }, [projectId]);

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim() || isSubmitting || !hasAnyTarget()) return;
    setIsSubmitting(true);
    try {
      const res = await createAiCommandBatch(projectId, { prompt: prompt.trim(), targets: buildTargets() });
      setBatch(res.data);
      setViewState("analyzing");
      refreshBatchList();
    } catch (err) {
      toast.error("Failed to start analysis");
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  }, [prompt, projectId, isSubmitting, pagesMode, postsMode, layoutsMode, selectedPageIds, selectedPostIds, selectedLayouts]);

  const handleApproveReject = useCallback(
    async (recId: string, status: "approved" | "rejected", referenceData?: { reference_url?: string; reference_content?: string }) => {
      setLoadingRecId(recId);
      try {
        await updateAiCommandRecommendation(projectId, batch!.id, recId, status, referenceData);
        setRecommendations((prev) =>
          prev.map((r) => (r.id === recId ? { ...r, status } : r)),
        );
        const batchRes = await fetchAiCommandBatch(projectId, batch!.id);
        setBatch(batchRes.data);

        // Auto-collapse group if all items in it are now approved/rejected
        const rec = recommendations.find((r) => r.id === recId);
        if (rec) {
          const groupRecs = recommendations.filter((r) => subGroupKey(r) === subGroupKey(rec));
          const updatedGroupRecs = groupRecs.map((r) => r.id === recId ? { ...r, status } : r);
          const allActioned = updatedGroupRecs.every((r) => r.status === "approved" || r.status === "rejected");
          if (allActioned) {
            setExpandedGroups((prev) => {
              const next = new Set(prev);
              next.delete(subGroupKey(rec));
              return next;
            });
          }
        }
      } catch {
        toast.error("Failed to update recommendation");
      } finally {
        setLoadingRecId(null);
      }
    },
    [projectId, batch, recommendations],
  );

  const NEEDS_INPUT_TYPES = new Set(["create_page", "create_post"]);
  const needsInputCheck = (rec: AiCommandRecommendation) => {
    if (!NEEDS_INPUT_TYPES.has(rec.target_type)) return false;
    const meta = rec.target_meta as Record<string, unknown>;
    return !meta?.reference_url && !meta?.reference_content;
  };
  const needsUrlCheck = (rec: AiCommandRecommendation) => {
    if (rec.target_type !== "update_menu") return false;
    const meta = rec.target_meta as Record<string, unknown>;
    return meta?.url === "NEEDS_INPUT";
  };

  const handleBulkAction = useCallback(
    async (status: "approved" | "rejected") => {
      if (!batch) return;

      // Block approve if items need user input
      if (status === "approved") {
        const pendingRecs = recommendations.filter((r) => r.status === "pending");
        const needInput = pendingRecs.filter((r) => needsInputCheck(r) || needsUrlCheck(r));
        if (needInput.length > 0) {
          toast.error(
            `${needInput.length} item${needInput.length > 1 ? "s" : ""} need${needInput.length === 1 ? "s" : ""} your input before approval (reference URLs, external links). Handle those individually first.`,
            { duration: 5000 }
          );
          // Expand groups containing items that need input
          const groups = new Set(needInput.map((r) => subGroupKey(r)));
          setExpandedGroups((prev) => new Set([...prev, ...groups]));
          return;
        }
      }

      try {
        await bulkUpdateAiCommandRecommendations(projectId, batch.id, status);
        const [batchRes, recsRes] = await Promise.all([
          fetchAiCommandBatch(projectId, batch.id),
          fetchAiCommandRecommendations(projectId, batch.id),
        ]);
        setBatch(batchRes.data);
        setRecommendations(recsRes.data);
        setExpandedGroups(new Set());
      } catch {
        toast.error("Failed to bulk update");
      }
    },
    [projectId, batch, recommendations],
  );

  const handleExecute = useCallback(async () => {
    if (!batch) return;
    try {
      await executeAiCommandBatch(projectId, batch.id);
      setBatch((prev) => prev ? { ...prev, status: "executing" } : prev);
      setViewState("executing");
    } catch {
      toast.error("Failed to start execution");
    }
  }, [projectId, batch]);

  const handleDeleteBatch = useCallback(async (batchId: string) => {
    setDeletingBatchId(batchId);
    try {
      await deleteAiCommandBatch(projectId, batchId);
      setBatches((prev) => prev.filter((b) => b.id !== batchId));
      if (batch?.id === batchId) {
        setBatch(null);
        setRecommendations([]);
        setViewState("history");
      }
    } catch {
      toast.error("Failed to delete batch");
    } finally {
      setDeletingBatchId(null);
    }
  }, [projectId, batch]);

  const goToInput = () => {
    setViewState("input");
    setPrompt("");
  };

  const goToHistory = () => {
    setViewState("history");
    setBatch(null);
    setRecommendations([]);
    setExpandedGroups(new Set());
    refreshBatchList();
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const stats = parseStats(batch?.stats ?? null);
  const approvedCount = stats.approved || 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {viewState !== "history" && (
            <button onClick={goToHistory} className="text-gray-400 hover:text-gray-600 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <Sparkles className="w-5 h-5 text-alloro-orange" />
          <h3 className="text-lg font-semibold text-gray-900">AI Command</h3>
          {batch && (
            <StatusPill status={batch.status} />
          )}
        </div>
        {viewState === "history" && (
          <button
            onClick={goToInput}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-alloro-orange text-white rounded-lg hover:brightness-110 transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> New Analysis
          </button>
        )}
      </div>

      <div className="p-5">
        <AnimatePresence mode="wait">
          {/* ---- HISTORY STATE ---- */}
          {viewState === "history" && (
            <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
              {!batchesLoaded ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : batches.length === 0 ? (
                <div className="text-center py-12">
                  <Sparkles className="w-8 h-8 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm text-gray-500 mb-1">No analyses yet</p>
                  <p className="text-xs text-gray-400">Create a new analysis to get started</p>
                </div>
              ) : (
                batches.map((b) => {
                  const s = parseStats(b.stats);
                  return (
                    <div
                      key={b.id}
                      className="group flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50/50 transition-all cursor-pointer"
                      onClick={() => openBatch(b)}
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <div className="flex items-center gap-2 mb-1">
                          <StatusPill status={b.status} />
                          <span className="text-[11px] text-gray-400">
                            {new Date(b.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 truncate">{b.prompt.slice(0, 100)}</p>
                        {s.total > 0 && (
                          <div className="flex gap-1.5 mt-1.5">
                            {s.pending > 0 && <span className="text-[10px] text-gray-400">{s.pending} pending</span>}
                            {s.approved > 0 && <span className="text-[10px] text-green-600">{s.approved} approved</span>}
                            {s.rejected > 0 && <span className="text-[10px] text-red-400">{s.rejected} rejected</span>}
                            {s.executed > 0 && <span className="text-[10px] text-alloro-orange">{s.executed} executed</span>}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteBatch(b.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                        title="Delete batch"
                      >
                        {deletingBatchId === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  );
                })
              )}
            </motion.div>
          )}

          {/* ---- INPUT STATE ---- */}
          {viewState === "input" && (
            <motion.div key="input" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Paste a QA checklist, describe changes, or give a simple instruction..."
                className="w-full min-h-[180px] p-4 border border-gray-200 rounded-lg text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-alloro-orange/20 focus:border-alloro-orange transition-colors"
              />
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Targets</p>
                <TargetSection icon={<FileText className="w-3.5 h-3.5" />} label="Pages" mode={pagesMode} onModeChange={setPagesMode}>
                  {pagesMode === "specific" && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-gray-100">
                      {uniquePages.map((page) => (
                        <SelectChip key={page.id} label={page.path === "/" ? "Home (/)" : page.path} selected={selectedPageIds.has(page.id)}
                          onClick={() => setSelectedPageIds((prev) => { const n = new Set(prev); n.has(page.id) ? n.delete(page.id) : n.add(page.id); return n; })} />
                      ))}
                    </div>
                  )}
                </TargetSection>
                <TargetSection icon={<Newspaper className="w-3.5 h-3.5" />} label="Posts" mode={postsMode} onModeChange={setPostsMode}>
                  {postsMode === "specific" && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-gray-100">
                      {posts.length > 0 ? posts.map((post) => (
                        <SelectChip key={post.id} label={post.title} selected={selectedPostIds.has(post.id)}
                          onClick={() => setSelectedPostIds((prev) => { const n = new Set(prev); n.has(post.id) ? n.delete(post.id) : n.add(post.id); return n; })} />
                      )) : <span className="text-xs text-gray-400 italic">No posts found</span>}
                    </div>
                  )}
                </TargetSection>
                <TargetSection icon={<Layout className="w-3.5 h-3.5" />} label="Layouts" mode={layoutsMode} onModeChange={setLayoutsMode}>
                  {layoutsMode === "specific" && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-gray-100">
                      {(["wrapper", "header", "footer"] as const).map((field) => (
                        <SelectChip key={field} label={field.charAt(0).toUpperCase() + field.slice(1)} selected={selectedLayouts.has(field)}
                          onClick={() => setSelectedLayouts((prev) => { const n = new Set(prev); n.has(field) ? n.delete(field) : n.add(field); return n; })} />
                      ))}
                    </div>
                  )}
                </TargetSection>
              </div>
              <div className="flex justify-end">
                <button onClick={handleSubmit} disabled={!prompt.trim() || isSubmitting || !hasAnyTarget()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-alloro-orange text-white rounded-lg text-sm font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Analyze
                </button>
              </div>
            </motion.div>
          )}

          {/* ---- ANALYZING STATE ---- */}
          {viewState === "analyzing" && (
            <motion.div key="analyzing" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-sm text-gray-800 font-medium mb-1">Analyzing your content...</p>
                <p className="text-xs text-gray-500 truncate">{batch?.prompt.slice(0, 120)}...</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center text-sm text-gray-600">
                  <Loader2 className="w-4 h-4 animate-spin text-alloro-orange mr-2" />
                  {stats.total > 0 ? `Found ${stats.total} recommendation(s) so far...` : "Scanning targets..."}
                </div>
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <motion.div className="h-full bg-alloro-orange rounded-full" animate={{ width: ["0%", "60%", "80%", "90%"] }} transition={{ duration: 30, ease: "easeOut" }} />
                </div>
              </div>
            </motion.div>
          )}

          {/* ---- EXECUTING STATE ---- */}
          {viewState === "executing" && (
            <motion.div key="executing" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-sm text-gray-800 font-medium">Executing approved changes...</p>
                <p className="text-xs text-gray-500 mt-1">{stats.executed || 0} of {approvedCount} completed{stats.failed > 0 && ` (${stats.failed} failed)`}</p>
              </div>
              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <motion.div className="h-full bg-alloro-orange rounded-full transition-all duration-500"
                  style={{ width: approvedCount > 0 ? `${(((stats.executed || 0) + (stats.failed || 0)) / approvedCount) * 100}%` : "0%" }} />
              </div>
              <RecommendationList recommendations={recommendations} expandedGroups={expandedGroups} toggleGroup={toggleGroup} onApproveReject={handleApproveReject} readonly loadingRecId={null} />
            </motion.div>
          )}

          {/* ---- RESULTS / COMPLETED STATE ---- */}
          {(viewState === "results" || viewState === "completed") && (
            <motion.div key="results" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
              <div className={`rounded-lg p-4 border ${viewState === "completed" ? "bg-green-50/60 border-green-200" : "bg-gray-50 border-gray-200"}`}>
                <p className="text-sm font-medium text-gray-800">{batch?.summary || "Analysis complete."}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {stats.total > 0 && <StatBadge label="Total" count={stats.total} color="gray" />}
                  {stats.pending > 0 && <StatBadge label="Pending" count={stats.pending} color="slate" />}
                  {stats.approved > 0 && <StatBadge label="Approved" count={stats.approved} color="green" />}
                  {stats.rejected > 0 && <StatBadge label="Rejected" count={stats.rejected} color="red" />}
                  {stats.executed > 0 && <StatBadge label="Executed" count={stats.executed} color="alloro" />}
                  {stats.failed > 0 && <StatBadge label="Failed" count={stats.failed} color="red" />}
                </div>
              </div>

              {viewState === "results" && stats.total > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <button onClick={() => handleBulkAction("approved")} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors">
                      <Check className="w-3.5 h-3.5" /> Approve All
                    </button>
                    <button onClick={() => handleBulkAction("rejected")} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors">
                      <X className="w-3.5 h-3.5" /> Reject All
                    </button>
                  </div>
                  <button onClick={handleExecute} disabled={approvedCount === 0}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-alloro-orange text-white rounded-lg text-sm font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                    <Zap className="w-4 h-4" />
                    Execute {approvedCount} Change{approvedCount !== 1 ? "s" : ""}
                  </button>
                </div>
              )}

              {viewState === "completed" && (
                <div className="flex justify-end">
                  <button onClick={goToHistory} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Back to History
                  </button>
                </div>
              )}

              {recommendations.length > 0 ? (
                <RecommendationList recommendations={recommendations} expandedGroups={expandedGroups} toggleGroup={toggleGroup}
                  onApproveReject={handleApproveReject} readonly={viewState === "completed"} loadingRecId={loadingRecId} />
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
                  <p className="text-sm">No changes recommended. Content looks good.</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status pill
// ---------------------------------------------------------------------------

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    analyzing: { bg: "bg-amber-50", text: "text-amber-600", label: "Analyzing" },
    ready: { bg: "bg-gray-100", text: "text-gray-600", label: "Pending Review" },
    executing: { bg: "bg-blue-50", text: "text-blue-600", label: "Executing" },
    completed: { bg: "bg-green-50", text: "text-green-600", label: "Completed" },
    failed: { bg: "bg-red-50", text: "text-red-600", label: "Failed" },
  };
  const s = map[status] || map.ready;
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Target Section
// ---------------------------------------------------------------------------

function TargetSection({ icon, label, mode, onModeChange, children }: {
  icon: React.ReactNode; label: string; mode: TargetMode; onModeChange: (mode: TargetMode) => void; children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border p-3 transition-colors ${mode === "off" ? "border-gray-100 bg-gray-50/50 opacity-50" : "border-gray-200 bg-white"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={mode === "off" ? "text-gray-300" : "text-gray-500"}>{icon}</span>
          <span className={`text-sm font-medium ${mode === "off" ? "text-gray-400" : "text-gray-700"}`}>{label}</span>
          {mode === "all" && <span className="text-[10px] font-medium text-alloro-orange bg-alloro-orange/8 px-1.5 py-0.5 rounded">ALL</span>}
        </div>
        <div className="flex items-center gap-0.5 bg-gray-100 rounded-md p-0.5">
          {(["all", "specific", "off"] as const).map((m) => (
            <button key={m} onClick={() => onModeChange(m)}
              className={`px-2.5 py-1 text-[11px] rounded font-medium transition-all ${mode === m ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}>
              {m === "all" ? "All" : m === "specific" ? "Pick" : "Off"}
            </button>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}

function SelectChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
        selected ? "border-alloro-orange/30 bg-alloro-orange/8 text-alloro-orange" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
      }`}>
      {selected && <Check className="w-3 h-3" />}
      {label}
    </button>
  );
}

function StatBadge({ label, count, color }: { label: string; count: number; color: string }) {
  const colors: Record<string, string> = {
    gray: "bg-gray-100 text-gray-600", slate: "bg-gray-100 text-gray-500",
    green: "bg-green-50 text-green-700", red: "bg-red-50 text-red-600",
    alloro: "bg-alloro-orange/10 text-alloro-orange",
  };
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${colors[color] || colors.gray}`}>{count} {label}</span>;
}

// ---------------------------------------------------------------------------
// Recommendation grouping + list
// ---------------------------------------------------------------------------

function groupKey(rec: AiCommandRecommendation): string {
  if (rec.target_type === "layout") return "Layouts";
  if (rec.target_type === "post" || rec.target_type === "update_post_meta") return "Posts";
  if (rec.target_type === "create_redirect" || rec.target_type === "update_redirect" || rec.target_type === "delete_redirect") return "Redirects";
  if (rec.target_type === "create_page") return "New Pages";
  if (rec.target_type === "create_post") return "New Posts";
  if (rec.target_type === "create_menu" || rec.target_type === "update_menu") return "Menu Changes";
  if (rec.target_type === "update_page_path") return "Pages";
  return "Pages";
}

// Flag-specific labels override target_type labels
const FLAG_LABELS: Record<string, { label: string; color: string }> = {
  fix_broken_link: { label: "Broken Link", color: "bg-red-50 text-red-600" },
  fix_html: { label: "Fix HTML", color: "bg-amber-50 text-amber-700" },
  fix_seo: { label: "SEO Issue", color: "bg-blue-50 text-blue-600" },
  fix_architecture: { label: "Architecture", color: "bg-purple-50 text-purple-600" },
  fix_content: { label: "Content Issue", color: "bg-amber-50 text-amber-600" },
};

const TOOL_LABELS: Record<string, { label: string; color: string }> = {
  page_section: { label: "Edit HTML", color: "bg-gray-100 text-gray-600" },
  layout: { label: "Edit Layout", color: "bg-gray-100 text-gray-600" },
  post: { label: "Edit Post", color: "bg-gray-100 text-gray-600" },
  create_page: { label: "Create Page", color: "bg-blue-50 text-blue-600" },
  create_post: { label: "Create Post", color: "bg-blue-50 text-blue-600" },
  create_menu: { label: "Create Menu", color: "bg-purple-50 text-purple-600" },
  update_menu: { label: "Update Menu", color: "bg-purple-50 text-purple-600" },
  create_redirect: { label: "Create Redirect", color: "bg-green-50 text-green-600" },
  update_redirect: { label: "Update Redirect", color: "bg-green-50 text-green-600" },
  delete_redirect: { label: "Delete Redirect", color: "bg-red-50 text-red-500" },
  update_post_meta: { label: "Update Post", color: "bg-gray-100 text-gray-600" },
  update_page_path: { label: "Update Page", color: "bg-gray-100 text-gray-600" },
};

function getToolLabel(rec: AiCommandRecommendation): { label: string; color: string } | null {
  const meta = rec.target_meta as Record<string, unknown>;
  const flagType = meta?.flag_type as string | undefined;
  if (flagType && FLAG_LABELS[flagType]) return FLAG_LABELS[flagType];
  return TOOL_LABELS[rec.target_type] || null;
}

function subGroupKey(rec: AiCommandRecommendation): string {
  return rec.target_label;
}

interface RecommendationListProps {
  recommendations: AiCommandRecommendation[];
  expandedGroups: Set<string>;
  toggleGroup: (key: string) => void;
  onApproveReject: (id: string, status: "approved" | "rejected", referenceData?: { reference_url?: string; reference_content?: string }) => void;
  readonly?: boolean;
  loadingRecId: string | null;
}

function RecommendationList({ recommendations, expandedGroups, toggleGroup, onApproveReject, readonly, loadingRecId }: RecommendationListProps) {
  const groups = new Map<string, Map<string, AiCommandRecommendation[]>>();
  for (const rec of recommendations) {
    const gk = groupKey(rec);
    const sk = subGroupKey(rec);
    if (!groups.has(gk)) groups.set(gk, new Map());
    const sub = groups.get(gk)!;
    if (!sub.has(sk)) sub.set(sk, []);
    sub.get(sk)!.push(rec);
  }

  const order = ["Layouts", "Pages", "Posts", "New Posts", "New Pages", "Menu Changes", "Redirects"];

  return (
    <div className="space-y-4">
      {order.map((gk) => {
        const subGroups = groups.get(gk);
        if (!subGroups || subGroups.size === 0) return null;

        return (
          <div key={gk}>
            <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{gk}</h4>
            <div className="space-y-1">
              {Array.from(subGroups.entries()).map(([sk, recs]) => {
                const isExpanded = expandedGroups.has(sk);
                const statusSummary = getStatusSummary(recs);
                const pendingCount = recs.filter((r) => r.status === "pending").length;
                const approvedCount = recs.filter((r) => r.status === "approved").length;
                const rejectedCount = recs.filter((r) => r.status === "rejected").length;

                return (
                  <div key={sk} className={`border rounded-lg overflow-hidden transition-colors ${
                    statusSummary === "approved" ? "border-green-200/60" :
                    statusSummary === "rejected" ? "border-gray-100 opacity-60" :
                    "border-gray-100"
                  }`}>
                    <button onClick={() => toggleGroup(sk)}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50/80 transition-colors text-left">
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                        <span className="text-sm font-medium text-gray-700">{sk}</span>
                        <div className="flex items-center gap-1">
                          {pendingCount > 0 && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{pendingCount}</span>}
                          {approvedCount > 0 && <span className="text-[10px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded-full">{approvedCount}</span>}
                          {rejectedCount > 0 && <span className="text-[10px] bg-red-50 text-red-400 px-1.5 py-0.5 rounded-full">{rejectedCount}</span>}
                        </div>
                      </div>
                      <StatusDot status={statusSummary} />
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                          <div className="px-4 pb-3 space-y-1.5">
                            {recs.map((rec) => (
                              <RecommendationCard key={rec.id} rec={rec} onApproveReject={onApproveReject}
                                readonly={readonly} isLoading={loadingRecId === rec.id} />
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getStatusSummary(recs: AiCommandRecommendation[]): string {
  const statuses = new Set(recs.map((r) => r.status));
  if (statuses.size === 1) return recs[0].status;
  return "mixed";
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-gray-300", approved: "bg-green-400", rejected: "bg-red-300",
    executed: "bg-alloro-orange", failed: "bg-red-500", mixed: "bg-gray-400",
  };
  return <span className={`w-2 h-2 rounded-full ${colors[status] || colors.pending}`} />;
}

function RecommendationCard({ rec, onApproveReject, readonly, isLoading }: {
  rec: AiCommandRecommendation;
  onApproveReject: (id: string, status: "approved" | "rejected", referenceData?: { reference_url?: string; reference_content?: string }) => void;
  readonly?: boolean;
  isLoading: boolean;
}) {
  const [showInstruction, setShowInstruction] = useState(false);
  const [refUrl, setRefUrl] = useState("");
  const [refContent, setRefContent] = useState("");

  const needsReference = rec.target_type === "create_page" || rec.target_type === "create_post";
  const needsUrlInput = rec.target_type === "update_menu" && (rec.target_meta as Record<string, unknown>)?.url === "NEEDS_INPUT";
  const meta = rec.target_meta as Record<string, unknown>;
  const hasReference = !!(meta?.reference_url || meta?.reference_content);

  const statusIcon = {
    pending: null,
    approved: <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />,
    rejected: <XCircle className="w-4 h-4 text-red-300 shrink-0" />,
    executed: <CheckCircle className="w-4 h-4 text-alloro-orange shrink-0" />,
    failed: <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />,
  }[rec.status];

  const executionError =
    rec.status === "failed" && rec.execution_result
      ? (typeof rec.execution_result === "string" ? JSON.parse(rec.execution_result) : rec.execution_result).error
      : null;

  const handleApprove = () => {
    if (needsReference && !hasReference) {
      // Can't approve without reference — input is already visible
      if (!refUrl.trim() && !refContent.trim()) return;
      onApproveReject(rec.id, "approved", {
        reference_url: refUrl.trim() || undefined,
        reference_content: refContent.trim() || undefined,
      });
    } else if (needsUrlInput) {
      return; // URL input is inline
    } else {
      onApproveReject(rec.id, rec.status === "approved" ? "rejected" : "approved");
    }
  };

  return (
    <motion.div
      layout
      className={`rounded-lg border p-3 transition-all ${
        rec.status === "approved" ? "border-green-200/60 bg-green-50/40"
        : rec.status === "rejected" ? "border-gray-100 bg-gray-50/30"
        : rec.status === "executed" ? "border-alloro-orange/20 bg-alloro-orange/5"
        : rec.status === "failed" ? "border-red-200/60 bg-red-50/40"
        : "border-gray-100 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`flex-1 min-w-0 ${rec.status === "rejected" ? "opacity-50" : ""}`}>
          <div className="flex items-start gap-2 mb-1">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-gray-400 shrink-0" /> : statusIcon}
            <div className="flex-1 min-w-0">
              {(() => {
                const tool = getToolLabel(rec);
                return tool ? (
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${tool.color} shrink-0`}>
                      {tool.label}
                    </span>
                  </div>
                ) : null;
              })()}
              <p className={`text-sm leading-relaxed ${rec.status === "rejected" ? "text-gray-400 line-through" : "text-gray-700"}`}>
                {rec.recommendation}
              </p>
            </div>
          </div>

          {executionError && <p className="text-xs text-red-500 mt-1 ml-6">{executionError}</p>}

          {/* Reference data indicator for approved create_page/create_post */}
          {needsReference && hasReference && rec.status === "approved" && (
            <p className="text-[11px] text-green-600 mt-1 ml-6">
              Reference: {meta.reference_url ? (meta.reference_url as string) : "Content provided"}
            </p>
          )}

          {/* Reference input for create_page/create_post */}
          {needsReference && !hasReference && rec.status === "pending" && (
            <div className="ml-6 mt-2 space-y-2 p-2.5 bg-gray-50 rounded-lg border border-gray-100">
              <p className="text-[11px] font-medium text-gray-500">Reference content required for page creation:</p>
              <input
                type="url"
                value={refUrl}
                onChange={(e) => setRefUrl(e.target.value)}
                placeholder="Old site URL to scrape (e.g., https://oldsite.com/pricing)"
                className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-alloro-orange/20 focus:border-alloro-orange"
              />
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400">or</span>
              </div>
              <textarea
                value={refContent}
                onChange={(e) => setRefContent(e.target.value)}
                placeholder="Paste content text directly..."
                rows={3}
                className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-xs font-mono resize-y focus:outline-none focus:ring-1 focus:ring-alloro-orange/20 focus:border-alloro-orange"
              />
              <button
                onClick={handleApprove}
                disabled={!refUrl.trim() && !refContent.trim()}
                className="inline-flex items-center gap-1 px-3 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Check className="w-3 h-3" /> Approve with Reference
              </button>
            </div>
          )}

          {/* URL input for menu items with NEEDS_INPUT */}
          {needsUrlInput && rec.status === "pending" && (
            <div className="ml-6 mt-2 space-y-2 p-2.5 bg-amber-50/50 rounded-lg border border-amber-200/50">
              <p className="text-[11px] font-medium text-amber-700">URL required — the AI doesn't know this link:</p>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={refUrl}
                  onChange={(e) => setRefUrl(e.target.value)}
                  placeholder="https://payment-portal.example.com or /internal-page"
                  className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-alloro-orange/20 focus:border-alloro-orange"
                />
                <button
                  onClick={() => {
                    if (!refUrl.trim()) return;
                    // Store the URL in target_meta by approving with updated meta
                    onApproveReject(rec.id, "approved", { reference_url: refUrl.trim() });
                  }}
                  disabled={!refUrl.trim()}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  <Check className="w-3 h-3" /> Approve
                </button>
              </div>
            </div>
          )}

          {/* Needs input indicator — only show for non-visible inputs */}
          {needsUrlInput && rec.status === "pending" && (
            <p className="text-[11px] text-amber-600 mt-1 ml-6">Requires URL before approval</p>
          )}

          {rec.status !== "rejected" && (
            <button onClick={() => setShowInstruction(!showInstruction)}
              className="text-[11px] text-gray-400 hover:text-gray-500 mt-1 ml-6 transition-colors">
              {showInstruction ? "Hide" : "Show"} instruction
            </button>
          )}

          {showInstruction && rec.status !== "rejected" && (
            <p className="text-[11px] text-gray-500 mt-1.5 ml-6 font-mono bg-gray-50 p-2 rounded border border-gray-100">
              {rec.instruction}
            </p>
          )}
        </div>

        {!readonly && rec.status !== "executed" && rec.status !== "failed" && !isLoading && (
          <div className="flex gap-0.5 shrink-0">
            <button
              onClick={handleApprove}
              disabled={isLoading}
              className={`p-1.5 rounded-md transition-all ${
                rec.status === "approved"
                  ? "bg-green-100 text-green-600 hover:bg-green-200"
                  : "hover:bg-green-50 text-gray-300 hover:text-green-600"
              }`}
              title={rec.status === "approved" ? "Undo approve" : "Approve"}
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={() => onApproveReject(rec.id, rec.status === "rejected" ? "approved" : "rejected")}
              disabled={isLoading}
              className={`p-1.5 rounded-md transition-all ${
                rec.status === "rejected"
                  ? "bg-red-50 text-red-500 hover:bg-red-100"
                  : "hover:bg-red-50 text-gray-300 hover:text-red-500"
              }`}
              title={rec.status === "rejected" ? "Undo reject" : "Reject"}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
