/**
 * RankingInFlightBanner
 *
 * Shows live progress for a freshly-kicked-off ranking batch. Renders at the
 * top of the rankings dashboard when the URL carries `?batchId=...` (typically
 * after the Curate page's "Run ranking" finalize).
 *
 * Polls /api/practice-ranking/batch/:batchId/status every 4s and renders the
 * granular step message + progress %. Auto-clears when the batch completes
 * or fails.
 *
 * Spec: plans/04282026-no-ticket-rankings-dashboard-in-flight-batch-banner/spec.md
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, X, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  getBatchStatus,
  type GetBatchStatusResponse,
} from "../../api/practiceRanking";

const POLL_INTERVAL_MS = 4000;

interface Props {
  batchId: string;
  onComplete: () => void;
  onDismiss: () => void;
}

export function RankingInFlightBanner({
  batchId,
  onComplete,
  onDismiss,
}: Props) {
  const [status, setStatus] = useState<GetBatchStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const completedFiredRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    async function poll() {
      try {
        const res = await getBatchStatus(batchId);
        if (cancelled) return;
        setStatus(res);
        setError(null);
        if (
          (res.status === "completed" || res.status === "failed") &&
          !completedFiredRef.current
        ) {
          completedFiredRef.current = true;
          // Brief moment of "done" UI before we tell the parent to clear
          window.setTimeout(() => {
            if (!cancelled) onComplete();
          }, 1200);
          return;
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const msg =
            err instanceof Error ? err.message : "Couldn't reach the server";
          setError(msg);
        }
      }
      if (!cancelled) {
        timer = window.setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    poll();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [batchId, onComplete]);

  // Pull the most useful message + progress from rankings[0].statusDetail
  // (the finalize-and-run flow always produces single-location batches).
  const ranking = status?.rankings?.[0];
  const detail = ranking?.statusDetail ?? null;
  const stepMessage =
    detail?.message ||
    (status?.status === "completed"
      ? "Ranking ready"
      : status?.status === "failed"
        ? "Ranking failed"
        : "Starting analysis…");
  const progress =
    typeof detail?.progress === "number"
      ? detail.progress
      : typeof status?.progress === "number"
        ? status.progress
        : 0;
  const isDone = status?.status === "completed";
  const isFailed =
    status?.status === "failed" || ranking?.status === "failed";

  const Icon = isFailed ? AlertTriangle : isDone ? CheckCircle2 : Loader2;
  const iconClass = isFailed
    ? "text-red-500"
    : isDone
      ? "text-green-500"
      : "text-alloro-orange animate-spin";
  const barClass = isFailed
    ? "bg-red-500"
    : isDone
      ? "bg-green-500"
      : "bg-alloro-orange";

  return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-sm px-5 py-4 mb-6">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-alloro-orange/10 flex items-center justify-center flex-shrink-0">
          <Icon size={18} className={iconClass} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 mb-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-alloro-textDark/40">
              {isDone
                ? "Ranking complete"
                : isFailed
                  ? "Ranking failed"
                  : "Ranking in progress"}
            </span>
            <button
              onClick={onDismiss}
              className="w-6 h-6 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 flex items-center justify-center"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
          <p className="text-sm font-bold text-alloro-textDark">
            {ranking?.gbpLocationName || "Your practice"}
            <span className="font-medium text-slate-500"> — {stepMessage}</span>
          </p>
          {error && (
            <p className="mt-1 text-xs text-red-600">{error}</p>
          )}
          <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-[width] duration-700 ease-out ${barClass}`}
              style={{ width: `${Math.max(2, progress)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
