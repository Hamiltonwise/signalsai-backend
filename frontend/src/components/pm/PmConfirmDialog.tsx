/**
 * PmConfirmDialog — controlled animated confirmation modal.
 *
 * Replaces native window.confirm() for PM destructive actions. Renders
 * nothing when `open` is false. Parent owns state: pass the action
 * context (title / message) when opening, resolve via the confirm/cancel
 * callbacks.
 *
 * Backdrop click + Escape = cancel. Enter on the focused confirm button
 * fires the confirm handler. The confirm button carries loading state
 * while `loading` is true, preventing double-submits.
 */

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Loader2 } from "lucide-react";

interface PmConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PmConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: PmConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, loading, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onClick={() => !loading && onCancel()}
            className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
            role="dialog"
            aria-modal="true"
            className="fixed left-1/2 top-1/2 z-[95] w-[92vw] max-w-[420px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border shadow-2xl"
            style={{
              borderColor: "var(--color-pm-border)",
              backgroundColor: "var(--color-pm-bg-secondary)",
            }}
          >
            <div className="flex items-start gap-3 px-5 pt-5">
              {danger && (
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: "rgba(196, 51, 51, 0.12)" }}
                >
                  <AlertTriangle
                    className="h-5 w-5"
                    style={{ color: "var(--color-pm-danger)" }}
                  />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2
                  className="text-[15px] font-semibold"
                  style={{ color: "var(--color-pm-text-primary)" }}
                >
                  {title}
                </h2>
                {message && (
                  <p
                    className="mt-1 text-[13px]"
                    style={{ color: "var(--color-pm-text-secondary)" }}
                  >
                    {message}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4">
              <button
                type="button"
                disabled={loading}
                onClick={onCancel}
                className="rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors"
                style={{
                  color: "var(--color-pm-text-secondary)",
                  opacity: loading ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (loading) return;
                  (e.currentTarget as HTMLElement).style.backgroundColor =
                    "var(--color-pm-bg-hover)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor =
                    "transparent";
                }}
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                autoFocus
                disabled={loading}
                onClick={onConfirm}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors"
                style={{
                  backgroundColor: danger
                    ? "var(--color-pm-danger)"
                    : "#D66853",
                  color: "#FFFFFF",
                  opacity: loading ? 0.75 : 1,
                  cursor: loading ? "wait" : "pointer",
                }}
              >
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
