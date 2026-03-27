import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Inbox,
  Mail,
  MailOpen,
  MailCheck,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  Download,
  ShieldAlert,
  CheckCircle2,
  FileText,
  Image,
} from "lucide-react";
import { toast } from "react-hot-toast";
import {
  fetchFormSubmissions,
  fetchFormSubmission,
  toggleFormSubmissionRead,
  deleteFormSubmission,
} from "../../api/websites";
import type { FormSubmission, FileValue, FormSection, FormContents } from "../../api/websites";

function isFileValue(value: unknown): value is FileValue {
  return (
    typeof value === "object" &&
    value !== null &&
    "s3Key" in value &&
    "name" in value
  );
}

function isSectionsFormat(contents: FormContents): contents is FormSection[] {
  return Array.isArray(contents);
}

/** Extract preview text from either format */
function previewFields(contents: FormContents): string {
  if (isSectionsFormat(contents)) {
    // Grab first 2 text fields from first section
    const textFields: string[] = [];
    for (const section of contents) {
      for (const [k, v] of section.fields) {
        if (typeof v === "string" && v.trim()) {
          textFields.push(`${k}: ${v}`);
          if (textFields.length >= 2) break;
        }
      }
      if (textFields.length >= 2) break;
    }
    return textFields.join(" \u00b7 ");
  }
  // Legacy flat format
  const textEntries = Object.entries(contents).filter(
    ([, v]) => typeof v === "string",
  ) as [string, string][];
  return textEntries.slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(" \u00b7 ");
}

interface Props {
  projectId: string;
  isAdmin?: boolean;
  fetchSubmissionsFn?: (projectId: string, page: number, limit: number, filter?: string) => Promise<any>;
  toggleReadFn?: (projectId: string, submissionId: string, is_read: boolean) => Promise<any>;
  deleteSubmissionFn?: (projectId: string, submissionId: string) => Promise<any>;
  onExport?: () => void;
}

type TabFilter = "all" | "verified" | "flagged" | "optins";

export default function FormSubmissionsTab({ projectId, isAdmin: _isAdmin, fetchSubmissionsFn, toggleReadFn, deleteSubmissionFn, onExport }: Props) {
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [flaggedCount, setFlaggedCount] = useState(0);
  const [verifiedCount, setVerifiedCount] = useState(0);
  const [optinsCount, setOptinsCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabFilter>("all");
  const [detailSubmission, setDetailSubmission] = useState<FormSubmission | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const fetchFn = fetchSubmissionsFn || fetchFormSubmissions;
      const filterParam = activeTab === "all" ? undefined : activeTab;
      const res = await fetchFn(projectId, page, 20, filterParam);
      if (res.error || res.success === false) {
        toast.error(res.error || res.errorMessage || "Failed to load submissions");
        return;
      }
      setSubmissions(res.data || []);
      setTotalPages(res.pagination?.totalPages || 1);
      setTotal(res.pagination?.total || 0);
      setUnreadCount(res.unreadCount || 0);
      setFlaggedCount(res.flaggedCount || 0);
      setVerifiedCount(res.verifiedCount || 0);
      setOptinsCount(res.optinsCount || 0);
    } catch {
      toast.error("Failed to load submissions");
    } finally {
      setLoading(false);
    }
  }, [projectId, page, activeTab]);

  useEffect(() => {
    load();
  }, [load]);

  /** Check if contents has any file values that need pre-signed URLs */
  const hasFiles = (contents: FormContents): boolean => {
    if (isSectionsFormat(contents)) {
      return contents.some((s) => s.fields.some(([, v]) => isFileValue(v)));
    }
    return Object.values(contents).some(isFileValue);
  };

  const handleSelect = async (sub: FormSubmission) => {
    if (selectedId === sub.id) {
      setSelectedId(null);
      setDetailSubmission(null);
      return;
    }

    setSelectedId(sub.id);
    if (!sub.is_read) handleToggleRead(sub);

    if (hasFiles(sub.contents)) {
      setDetailLoading(true);
      try {
        const res = await fetchFormSubmission(projectId, sub.id);
        if (res.success && res.data) {
          setDetailSubmission(res.data);
        } else {
          setDetailSubmission(sub);
        }
      } catch {
        setDetailSubmission(sub);
      } finally {
        setDetailLoading(false);
      }
    } else {
      setDetailSubmission(sub);
    }
  };

  const handleTabChange = (tab: TabFilter) => {
    setActiveTab(tab);
    setPage(1);
    setSelectedId(null);
    setDetailSubmission(null);
  };

  const handleToggleRead = async (sub: FormSubmission) => {
    try {
      const toggleFn = toggleReadFn || toggleFormSubmissionRead;
      await toggleFn(projectId, sub.id, !sub.is_read);
      setSubmissions((prev) =>
        prev.map((s) => (s.id === sub.id ? { ...s, is_read: !s.is_read } : s)),
      );
      setUnreadCount((c) => (sub.is_read ? c + 1 : Math.max(0, c - 1)));
    } catch {
      toast.error("Failed to update");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const deleteFn = deleteSubmissionFn || deleteFormSubmission;
      await deleteFn(projectId, id);
      setSubmissions((prev) => prev.filter((s) => s.id !== id));
      setTotal((t) => t - 1);
      if (selectedId === id) {
        setSelectedId(null);
        setDetailSubmission(null);
      }
      toast.success("Deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  const relativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  const currentDetail = detailSubmission && detailSubmission.id === selectedId ? detailSubmission : null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-gray-100 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900">Form Submissions</h3>
          <span className="text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full font-medium">
            {total}
          </span>
          {unreadCount > 0 && (
            <span className="text-xs text-white bg-alloro-orange px-2.5 py-1 rounded-full font-medium">
              {unreadCount} new
            </span>
          )}
        </div>
        {onExport && total > 0 && (
          <button
            onClick={onExport}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition px-3 py-1.5 rounded-lg hover:bg-gray-100"
          >
            <Download size={14} />
            Export CSV
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-100 px-5 flex gap-1">
        <button
          onClick={() => handleTabChange("all")}
          className={`px-3 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === "all"
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          All
        </button>
        <button
          onClick={() => handleTabChange("verified")}
          className={`px-3 py-2 text-sm font-medium border-b-2 transition flex items-center gap-1.5 ${
            activeTab === "verified"
              ? "border-emerald-500 text-emerald-600"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          <CheckCircle2 size={14} />
          Verified
          {verifiedCount > 0 && (
            <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">
              {verifiedCount}
            </span>
          )}
        </button>
        <button
          onClick={() => handleTabChange("flagged")}
          className={`px-3 py-2 text-sm font-medium border-b-2 transition flex items-center gap-1.5 ${
            activeTab === "flagged"
              ? "border-amber-500 text-amber-600"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          <ShieldAlert size={14} />
          Flagged
          {flaggedCount > 0 && (
            <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
              {flaggedCount}
            </span>
          )}
        </button>
        <button
          onClick={() => handleTabChange("optins")}
          className={`px-3 py-2 text-sm font-medium border-b-2 transition flex items-center gap-1.5 ${
            activeTab === "optins"
              ? "border-sky-500 text-sky-600"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          <MailCheck size={14} />
          Confirmed Opt-ins
          {optinsCount > 0 && (
            <span className="text-xs bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded-full font-medium">
              {optinsCount}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
      ) : submissions.length === 0 ? (
        <div className="p-8 text-center">
          <Inbox className="mx-auto mb-3 text-gray-300" size={32} />
          <p className="text-gray-400 text-sm">
            {activeTab === "verified"
              ? "No verified submissions"
              : activeTab === "flagged"
                ? "No flagged submissions"
                : activeTab === "optins"
                  ? "No confirmed opt-ins yet"
                  : "No form submissions yet"}
          </p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="divide-y divide-gray-100">
            {submissions.map((sub) => (
              <div
                key={sub.id}
                className={`px-5 py-3 flex items-center gap-4 hover:bg-gray-50 cursor-pointer transition ${
                  !sub.is_read ? "bg-alloro-orange/5" : ""
                } ${sub.is_flagged ? "bg-amber-50/50" : ""}`}
                onClick={() => handleSelect(sub)}
              >
                <div className="flex-shrink-0">
                  {sub.is_flagged ? (
                    <ShieldAlert size={16} className="text-amber-500" />
                  ) : sub.is_read ? (
                    <MailOpen size={16} className="text-gray-300" />
                  ) : (
                    <Mail size={16} className="text-alloro-orange" />
                  )}
                </div>

                <div className="w-36 flex-shrink-0">
                  <span className={`text-sm ${!sub.is_read ? "font-semibold text-gray-900" : "text-gray-600"}`}>
                    {sub.form_name}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-400 truncate">
                    {previewFields(sub.contents)}
                  </p>
                </div>

                <div className="flex-shrink-0 text-xs text-gray-400">
                  {relativeTime(sub.submitted_at)}
                </div>

                <div className="flex-shrink-0 flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleToggleRead(sub); }}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
                    title={sub.is_read ? "Mark unread" : "Mark read"}
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(sub.id); }}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Detail panel */}
          <AnimatePresence>
            {currentDetail && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t border-gray-200 overflow-hidden"
              >
                <div className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="font-semibold text-gray-900">{currentDetail.form_name}</h4>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(currentDetail.submitted_at).toLocaleString()}
                        {" \u00b7 Sent to: "}
                        {currentDetail.recipients_sent_to.join(", ")}
                      </p>
                    </div>
                    <button
                      onClick={() => { setSelectedId(null); setDetailSubmission(null); }}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {currentDetail.is_flagged && currentDetail.flag_reason && (
                    <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 flex items-start gap-2">
                      <ShieldAlert size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-amber-700">Flagged by AI</p>
                        <p className="text-xs text-amber-600 mt-0.5">{currentDetail.flag_reason}</p>
                      </div>
                    </div>
                  )}

                  {detailLoading ? (
                    <div className="text-sm text-gray-400 py-4">Loading file details...</div>
                  ) : isSectionsFormat(currentDetail.contents) ? (
                    <SectionsView sections={currentDetail.contents} />
                  ) : (
                    <FlatView contents={currentDetail.contents} />
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-between">
              <p className="text-xs text-gray-400">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 text-gray-500"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 text-gray-500"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Render sections-format contents with grouped headers */
function SectionsView({ sections }: { sections: FormSection[] }) {
  return (
    <div className="space-y-5">
      {sections.map((section, si) => (
        <div key={si}>
          <h5 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-1.5 mb-2">
            {section.title}
          </h5>
          <div className="space-y-1.5">
            {section.fields.map(([key, value], fi) => (
              <div key={fi} className="flex gap-3">
                <span className="text-sm text-gray-400 w-44 flex-shrink-0">{key}</span>
                {isFileValue(value) ? (
                  <FileValueDisplay file={value} />
                ) : (
                  <span className="text-sm text-gray-900 font-medium">{value}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Render legacy flat key-value contents */
function FlatView({ contents }: { contents: Record<string, string | FileValue> }) {
  return (
    <div className="space-y-2">
      {Object.entries(contents).map(([key, value]) => (
        <div key={key} className="flex gap-3">
          <span className="text-sm text-gray-400 w-40 flex-shrink-0">{key}</span>
          {isFileValue(value) ? (
            <FileValueDisplay file={value} />
          ) : (
            <span className="text-sm text-gray-900 font-medium">{value}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function FileValueDisplay({ file }: { file: FileValue }) {
  const isImage = file.type.startsWith("image/");

  if (isImage && file.url) {
    return (
      <div className="flex flex-col gap-2">
        <img
          src={file.url}
          alt={file.name}
          className="max-w-48 max-h-32 rounded-lg border border-gray-200 object-contain"
        />
        <a
          href={file.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-alloro-orange hover:text-orange-700 font-medium transition"
        >
          <Download size={14} />
          {file.name}
        </a>
      </div>
    );
  }

  return (
    <a
      href={file.url || "#"}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 text-sm font-medium transition ${
        file.url
          ? "text-alloro-orange hover:text-orange-700"
          : "text-gray-400 cursor-not-allowed"
      }`}
    >
      {file.type === "application/pdf" ? <FileText size={14} /> : <Image size={14} />}
      {file.name}
      {file.url && <Download size={12} />}
    </a>
  );
}
