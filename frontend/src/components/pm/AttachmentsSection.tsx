/**
 * AttachmentsSection — inline file attachments for a PM task.
 *
 * Mounted inside TaskDetailPanel. Provides:
 * - Drag-and-drop + click-to-browse upload with progress bar
 * - List of attachments with per-type icon, uploader, size, timestamp
 * - Click → open preview modal (AttachmentPreviewModal)
 * - Hover-reveal Download + Delete buttons (Delete only for the uploader)
 *
 * All I/O goes through the /api/pm/tasks/:id/attachments endpoints in
 * src/routes/pm/attachments.ts. Downloads/previews use server-issued
 * presigned URLs (1h) so we never expose raw S3 URLs.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import {
  File as FileIcon,
  FileImage,
  FileText,
  FileSpreadsheet,
  Film,
  Upload,
  Download,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  listAttachments,
  uploadAttachment,
  deleteAttachment,
  getAttachmentDownloadUrl,
} from "../../api/pm";
import type { PmTaskAttachment } from "../../types/pm";
import { AttachmentPreviewModal } from "./AttachmentPreviewModal";
import { getCurrentUserId } from "../../utils/currentUser";

interface AttachmentsSectionProps {
  taskId: string;
  taskCreatedBy: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function iconForMime(mime: string) {
  if (mime.startsWith("image/")) return FileImage;
  if (mime.startsWith("video/")) return Film;
  if (mime === "text/csv" || mime.includes("spreadsheet") || mime.includes("excel"))
    return FileSpreadsheet;
  if (
    mime === "application/pdf" ||
    mime.startsWith("text/") ||
    mime.includes("word") ||
    mime === "application/json"
  )
    return FileText;
  return FileIcon;
}

export function AttachmentsSection({
  taskId,
  taskCreatedBy,
}: AttachmentsSectionProps) {
  const [attachments, setAttachments] = useState<PmTaskAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploads, setUploads] = useState<
    Array<{ id: string; filename: string; progress: number; error?: string }>
  >([]);
  const [previewing, setPreviewing] = useState<PmTaskAttachment | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentUserId = getCurrentUserId();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listAttachments(taskId)
      .then((rows) => {
        if (!cancelled) setAttachments(rows);
      })
      .catch(() => {
        if (!cancelled) setAttachments([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      setUploadError(null);
      const list = Array.from(files);
      for (const file of list) {
        const tempId = `${Date.now()}-${file.name}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        setUploads((prev) => [
          ...prev,
          { id: tempId, filename: file.name, progress: 0 },
        ]);
        try {
          const uploaded = await uploadAttachment(taskId, file, (pct) => {
            setUploads((prev) =>
              prev.map((u) => (u.id === tempId ? { ...u, progress: pct } : u))
            );
          });
          setAttachments((prev) => [uploaded, ...prev]);
          setUploads((prev) => prev.filter((u) => u.id !== tempId));
        } catch (err: unknown) {
          const e = err as {
            response?: { data?: { error?: string } };
            message?: string;
          };
          const msg =
            e?.response?.data?.error || e?.message || "Upload failed";
          setUploads((prev) =>
            prev.map((u) => (u.id === tempId ? { ...u, error: msg } : u))
          );
          setUploadError(msg);
        }
      }
    },
    [taskId]
  );

  const onBrowseClick = () => fileInputRef.current?.click();
  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      e.target.value = "";
    }
  };
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  };

  const handleDelete = async (att: PmTaskAttachment) => {
    try {
      await deleteAttachment(taskId, att.id);
      setAttachments((prev) => prev.filter((a) => a.id !== att.id));
    } catch (err) {
      console.error("[AttachmentsSection] delete failed:", err);
    }
  };

  const handleDownload = async (att: PmTaskAttachment) => {
    try {
      const { url } = await getAttachmentDownloadUrl(taskId, att.id);
      // Trigger browser download: anchor + click
      const a = document.createElement("a");
      a.href = url;
      a.download = att.filename;
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("[AttachmentsSection] download failed:", err);
    }
  };

  const canDelete = (att: PmTaskAttachment): boolean => {
    if (currentUserId === null) return false;
    return att.uploaded_by === currentUserId || taskCreatedBy === currentUserId;
  };

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-pm-text-secondary">
        Attachments
      </label>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
        onClick={onBrowseClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onBrowseClick();
        }}
        className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed py-4 text-xs transition-colors"
        style={{
          borderColor: isDragOver
            ? "var(--color-pm-accent)"
            : "var(--color-pm-border)",
          backgroundColor: isDragOver
            ? "var(--color-pm-bg-hover)"
            : "var(--color-pm-bg-primary)",
          color: "var(--color-pm-text-muted)",
        }}
      >
        <Upload className="mb-1 h-4 w-4" />
        <span>
          <span className="font-medium text-pm-text-primary">Click to upload</span>{" "}
          or drag & drop
        </span>
        <span className="mt-0.5 text-[11px]">Up to 100 MB per file</span>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={onInputChange}
        />
      </div>

      {uploadError && (
        <p className="mt-2 text-[11px] text-pm-danger">{uploadError}</p>
      )}

      {/* In-flight uploads */}
      {uploads.length > 0 && (
        <div className="mt-3 space-y-2">
          {uploads.map((u) => (
            <div
              key={u.id}
              className="rounded-lg border p-2 text-xs"
              style={{
                borderColor: "var(--color-pm-border)",
                backgroundColor: "var(--color-pm-bg-primary)",
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-pm-text-primary">
                  {u.filename}
                </span>
                <span className="text-pm-text-muted">
                  {u.error ? "failed" : `${Math.round(u.progress * 100)}%`}
                </span>
              </div>
              <div
                className="mt-1 h-1 overflow-hidden rounded-full"
                style={{ backgroundColor: "var(--color-pm-border)" }}
              >
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${Math.round(u.progress * 100)}%`,
                    backgroundColor: u.error
                      ? "var(--color-pm-danger)"
                      : "var(--color-pm-accent)",
                  }}
                />
              </div>
              {u.error && (
                <p className="mt-1 text-[11px] text-pm-danger">{u.error}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* List */}
      {loading ? (
        <p className="mt-3 text-[11px] text-pm-text-muted">Loading...</p>
      ) : attachments.length === 0 && uploads.length === 0 ? null : (
        <ul className="mt-3 space-y-1.5">
          {attachments.map((att) => {
            const Icon = iconForMime(att.mime_type);
            return (
              <li
                key={att.id}
                className="group flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-pm-bg-hover"
                style={{
                  borderColor: "var(--color-pm-border)",
                  backgroundColor: "var(--color-pm-bg-primary)",
                }}
              >
                <button
                  onClick={() => setPreviewing(att)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <Icon className="h-5 w-5 shrink-0 text-pm-text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-pm-text-primary">
                      {att.filename}
                    </p>
                    <p className="truncate text-[11px] text-pm-text-muted">
                      {att.uploaded_by_name} · {formatBytes(att.size_bytes)} ·{" "}
                      {formatDistanceToNow(new Date(att.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => handleDownload(att)}
                    title="Download"
                    className="rounded p-1 text-pm-text-muted hover:bg-pm-bg-secondary hover:text-pm-text-primary"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  {canDelete(att) && (
                    <button
                      onClick={() => handleDelete(att)}
                      title="Delete"
                      className="rounded p-1 text-pm-text-muted hover:bg-red-500/10 hover:text-pm-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {previewing && (
        <AttachmentPreviewModal
          taskId={taskId}
          attachment={previewing}
          onClose={() => setPreviewing(null)}
          onDownload={handleDownload}
        />
      )}
    </div>
  );
}
