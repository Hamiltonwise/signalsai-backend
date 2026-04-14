/**
 * AttachmentPreviewModal — renders a single attachment inline when possible.
 *
 * Fetches a fresh 1-hour presigned URL on mount, then picks a preview mode
 * by MIME type:
 *   - image/*       → <img> fit-contain
 *   - application/pdf → <embed>
 *   - video/mp4     → <video controls>
 *   - text/csv      → papaparse → HTML table (first 1000 rows)
 *   - text/plain, text/markdown → plain <pre> (NOT rendered as markdown)
 *   - everything else → icon + filename + big Download button
 *
 * Closes on backdrop click or ESC. Fetches text-based previews through the
 * presigned URL client-side — S3 serves range-friendly bytes, and plain-text
 * never hits an HTML parser on our side.
 */

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, File as FileIcon } from "lucide-react";
import Papa from "papaparse";
import { getAttachmentDownloadUrl } from "../../api/pm";
import type { PmTaskAttachment } from "../../types/pm";

interface AttachmentPreviewModalProps {
  taskId: string;
  attachment: PmTaskAttachment;
  onClose: () => void;
  onDownload: (att: PmTaskAttachment) => void;
}

const CSV_ROW_CAP = 1000;

function getPreviewKind(
  mime: string
):
  | "image"
  | "pdf"
  | "video"
  | "csv"
  | "text"
  | "none" {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime === "video/mp4") return "video";
  if (mime === "text/csv") return "csv";
  if (mime === "text/plain" || mime === "text/markdown") return "text";
  return "none";
}

export function AttachmentPreviewModal({
  taskId,
  attachment,
  onClose,
  onDownload,
}: AttachmentPreviewModalProps) {
  const kind = useMemo(() => getPreviewKind(attachment.mime_type), [
    attachment.mime_type,
  ]);
  const [url, setUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [csvRows, setCsvRows] = useState<string[][] | null>(null);
  const [csvTruncated, setCsvTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Fetch the presigned URL; for text/csv also fetch the body content.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { url: presigned } = await getAttachmentDownloadUrl(
          taskId,
          attachment.id
        );
        if (cancelled) return;
        setUrl(presigned);

        if (kind === "text") {
          const res = await fetch(presigned);
          const text = await res.text();
          if (!cancelled) setTextContent(text);
        } else if (kind === "csv") {
          const res = await fetch(presigned);
          const text = await res.text();
          if (cancelled) return;
          const parsed = Papa.parse<string[]>(text, {
            skipEmptyLines: true,
          });
          const rows = (parsed.data as string[][]) || [];
          const truncated = rows.length > CSV_ROW_CAP;
          setCsvRows(truncated ? rows.slice(0, CSV_ROW_CAP) : rows);
          setCsvTruncated(truncated);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[AttachmentPreview] fetch failed:", err);
          setError("Failed to load preview");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId, attachment.id, kind]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          onClick={(e) => e.stopPropagation()}
          className="flex h-[90vh] w-[90vw] max-w-[1200px] flex-col overflow-hidden rounded-xl shadow-2xl"
          style={{
            backgroundColor: "var(--color-pm-bg-secondary)",
            border: "1px solid var(--color-pm-border)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between gap-3 border-b px-5 py-3"
            style={{ borderColor: "var(--color-pm-border)" }}
          >
            <p className="truncate text-sm font-medium text-pm-text-primary">
              {attachment.filename}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onDownload(attachment)}
                title="Download"
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-pm-text-secondary hover:bg-pm-bg-hover hover:text-pm-text-primary"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </button>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-pm-text-muted hover:bg-pm-bg-hover hover:text-pm-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div
            className="flex-1 overflow-auto"
            style={{ backgroundColor: "var(--color-pm-bg-primary)" }}
          >
            {error ? (
              <p className="p-6 text-sm text-pm-danger">{error}</p>
            ) : !url ? (
              <p className="p-6 text-sm text-pm-text-muted">Loading...</p>
            ) : kind === "image" ? (
              <div className="flex h-full w-full items-center justify-center p-4">
                <img
                  src={url}
                  alt={attachment.filename}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ) : kind === "pdf" ? (
              <embed
                src={url}
                type="application/pdf"
                className="h-full w-full"
              />
            ) : kind === "video" ? (
              <div className="flex h-full w-full items-center justify-center bg-black p-4">
                <video
                  src={url}
                  controls
                  className="max-h-full max-w-full"
                />
              </div>
            ) : kind === "csv" ? (
              <div className="p-4">
                {csvRows === null ? (
                  <p className="text-sm text-pm-text-muted">Parsing...</p>
                ) : (
                  <>
                    <div className="overflow-auto rounded-lg border" style={{ borderColor: "var(--color-pm-border)" }}>
                      <table className="min-w-full text-xs">
                        <tbody>
                          {csvRows.map((row, rIdx) => (
                            <tr
                              key={rIdx}
                              className={
                                rIdx === 0
                                  ? "font-semibold"
                                  : rIdx % 2 === 0
                                  ? ""
                                  : "bg-pm-bg-secondary"
                              }
                            >
                              {row.map((cell, cIdx) => (
                                <td
                                  key={cIdx}
                                  className="border px-2 py-1 text-pm-text-primary"
                                  style={{
                                    borderColor: "var(--color-pm-border)",
                                  }}
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {csvTruncated && (
                      <p className="mt-3 text-[11px] text-pm-text-muted">
                        Showing first {CSV_ROW_CAP} rows — download for full file
                      </p>
                    )}
                  </>
                )}
              </div>
            ) : kind === "text" ? (
              <pre
                className="h-full w-full overflow-auto p-4 text-xs text-pm-text-primary"
                style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
              >
                {textContent ?? "Loading..."}
              </pre>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8 text-center">
                <FileIcon className="h-16 w-16 text-pm-text-muted" />
                <div>
                  <p className="text-sm font-medium text-pm-text-primary">
                    {attachment.filename}
                  </p>
                  <p className="mt-1 text-xs text-pm-text-muted">
                    Preview not available for this file type.
                  </p>
                </div>
                <button
                  onClick={() => onDownload(attachment)}
                  className="flex items-center gap-2 rounded-lg bg-pm-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110"
                >
                  <Download className="h-4 w-4" />
                  Download
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
