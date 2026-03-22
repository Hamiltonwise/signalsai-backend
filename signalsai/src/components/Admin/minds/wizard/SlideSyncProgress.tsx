import { useState, useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, AlertCircle, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { ActionButton } from "../../../ui/DesignSystem";
import { SyncStepTimeline } from "./SyncStepTimeline";
import {
  startScrapeCompare,
  getSyncRun,
  type SyncRunDetails,
  type SyncStep,
} from "../../../../api/minds";

interface SlideSyncProgressProps {
  mindId: string;
  mindName: string;
  runId: string | null;
  onRunStarted: (runId: string) => void;
  onComplete: (runId: string) => void;
  onBack: () => void;
}

export function SlideSyncProgress({
  mindId,
  mindName,
  runId,
  onRunStarted,
  onComplete,
  onBack,
}: SlideSyncProgressProps) {
  const [details, setDetails] = useState<SyncRunDetails | null>(null);
  const [steps, setSteps] = useState<SyncStep[]>([]);
  const [starting, setStarting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [failed, setFailed] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = (id: string) => {
    stopPolling();

    // Immediate first fetch
    (async () => {
      const d = await getSyncRun(mindId, id);
      if (d) {
        setDetails(d);
        setSteps(d.steps);
        if (d.run.status === "completed") {
          setFinished(true);
          toast.success("Scrape & Compare completed");
          return;
        }
        if (d.run.status === "failed") {
          setFailed(true);
          toast.error(d.run.error_message || "Run failed");
          return;
        }
      }
    })();

    pollRef.current = setInterval(async () => {
      if (document.hidden) return;
      const d = await getSyncRun(mindId, id);
      if (!d) return;
      setDetails(d);
      setSteps(d.steps);
      if (d.run.status === "completed") {
        stopPolling();
        setFinished(true);
        toast.success("Scrape & Compare completed");
      } else if (d.run.status === "failed") {
        stopPolling();
        setFailed(true);
        toast.error(d.run.error_message || "Run failed");
      }
    }, 3000);
  };

  // Auto-start or resume polling on mount
  useEffect(() => {
    if (runId) {
      startPolling(runId);
    } else {
      handleStart();
    }
    return () => stopPolling();
  }, []);

  const handleStart = async () => {
    setStarting(true);
    setFailed(false);
    setFinished(false);
    const newRunId = await startScrapeCompare(mindId);
    if (newRunId) {
      onRunStarted(newRunId);
      startPolling(newRunId);
    } else {
      toast.error("Failed to start Scrape & Compare");
    }
    setStarting(false);
  };

  const handleRetry = () => {
    setDetails(null);
    setSteps([]);
    handleStart();
  };

  const runStatus = details?.run.status || "queued";

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Agentic Classroom
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {finished
              ? `${mindName} finished today's lesson. Time for intake.`
              : failed
              ? `${mindName} ran into trouble in class.`
              : `${mindName} is sitting in class right now, reading and understanding the material.`}
          </p>
        </div>
        {(runStatus === "queued" || runStatus === "running") && (
          <div className="flex items-center gap-2 text-xs text-alloro-orange font-medium">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Processing…
          </div>
        )}
      </div>

      {/* Timeline */}
      {steps.length > 0 ? (
        <SyncStepTimeline steps={steps} />
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          {starting ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-alloro-orange mb-4" />
              <p className="text-sm text-gray-500">Starting Scrape & Compare…</p>
            </>
          ) : (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-gray-300 mb-4" />
              <p className="text-sm text-gray-400">Waiting for run data…</p>
            </>
          )}
        </div>
      )}

      {/* Error state */}
      {failed && details?.run.error_message && (
        <div className="mt-4 rounded-xl bg-red-50 border border-red-100 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">Run Failed</p>
            <p className="text-xs text-red-600 mt-1">{details.run.error_message}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-6 flex items-center justify-between">
        <ActionButton
          label="Back to Library"
          icon={<ArrowLeft className="h-4 w-4" />}
          onClick={onBack}
          variant="ghost"
          size="sm"
        />

        {failed && (
          <ActionButton
            label="Retry"
            icon={<RotateCcw className="h-4 w-4" />}
            onClick={handleRetry}
            variant="secondary"
            loading={starting}
          />
        )}

        {finished && runId && (
          <ActionButton
            label="Go to Intake"
            icon={<ArrowRight className="h-4 w-4" />}
            onClick={() => onComplete(runId)}
            variant="primary"
          />
        )}
      </div>
    </div>
  );
}
