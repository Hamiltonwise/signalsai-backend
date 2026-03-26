/**
 * Batch Checkup Runner — WO18
 *
 * Three-state admin screen:
 * 1. Upload: paste CSV or upload file
 * 2. Processing: live progress bar + results appearing
 * 3. Complete: summary + sortable table + CSV download
 */

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload,
  Play,
  Download,
  Copy,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  BarChart3,
} from "lucide-react";
import {
  submitBatch,
  pollBatch,
  type BatchPractice,
  type BatchResult,
  type BatchStatus,
} from "@/api/batch-checkup";

// ─── CSV Parser ──────────────────────────────────────────────────────

function parseCSV(text: string): BatchPractice[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.toLowerCase().startsWith("practice"))
    .map((line) => {
      // Support: "Name, City, State" or "Name, City State"
      const parts = line.split(",").map((s) => s.trim());
      if (parts.length >= 3) {
        return { name: parts[0], city: parts[1], state: parts[2] };
      }
      if (parts.length === 2) {
        // Try to split "City State" or "City, State"
        const cityState = parts[1].trim();
        const stateMatch = cityState.match(/^(.+?)\s+([A-Z]{2})$/);
        if (stateMatch) {
          return { name: parts[0], city: stateMatch[1], state: stateMatch[2] };
        }
        return { name: parts[0], city: cityState, state: "" };
      }
      return null;
    })
    .filter((p): p is BatchPractice => p !== null && !!p.name);
}

// ─── CSV Export ──────────────────────────────────────────────────────

function exportCSV(results: BatchResult[]): string {
  const header =
    "practice_name,city,state,score,top_competitor,competitor_reviews,practice_reviews,primary_gap,email_paragraph";
  const rows = results
    .filter((r) => r.status === "completed")
    .map(
      (r) =>
        `"${esc(r.practiceName)}","${esc(r.city)}","${esc(r.state)}",${r.score ?? ""},"${esc(r.topCompetitorName || "Unknown")}",${r.topCompetitorReviews ?? ""},${r.practiceReviews ?? ""},"${esc(r.primaryGap)}","${esc(r.emailParagraph)}"`,
    );
  return [header, ...rows].join("\n");
}

function esc(v: string | null | undefined): string {
  return (v || "").replace(/"/g, '""');
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Status Dot ──────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-red-500" />;
  return <Clock className="h-4 w-4 text-amber-400" />;
}

// ─── Main Component ──────────────────────────────────────────────────

export default function BatchCheckup() {
  const [csvText, setCsvText] = useState("");
  const [practices, setPractices] = useState<BatchPractice[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchStatus, setBatchStatus] = useState<BatchStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);
  const [pollTimedOut, setPollTimedOut] = useState(false);

  // Parse CSV on text change
  useEffect(() => {
    if (csvText.trim()) {
      setPractices(parseCSV(csvText));
    } else {
      setPractices([]);
    }
  }, [csvText]);

  // Poll for results
  useEffect(() => {
    if (!batchId || batchStatus?.status === "completed" || pollTimedOut) return;

    pollCountRef.current = 0;
    pollRef.current = setInterval(async () => {
      pollCountRef.current += 1;
      if (pollCountRef.current > 60) {
        if (pollRef.current) clearInterval(pollRef.current);
        setPollTimedOut(true);
        return;
      }
      try {
        const status = await pollBatch(batchId);
        setBatchStatus(status);
        if (status.status === "completed") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // Keep polling
      }
    }, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [batchId, batchStatus?.status, pollTimedOut]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvText((ev.target?.result as string) || "");
    };
    reader.readAsText(file);
  }, []);

  const handleSubmit = async () => {
    if (practices.length === 0) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await submitBatch(practices);
      if (res.success && res.batchId) {
        setBatchId(res.batchId);
        setBatchStatus({
          success: true,
          batchId: res.batchId,
          status: "processing",
          total: res.total,
          completed: 0,
          failed: 0,
          results: [],
        });
      } else {
        setError("Failed to submit batch. Please try again.");
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setCsvText("");
    setPractices([]);
    setBatchId(null);
    setBatchStatus(null);
    setError(null);
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const results = batchStatus?.results || [];
  const completedResults = results.filter((r) => r.status === "completed");
  const isComplete = batchStatus?.status === "completed";
  // Summary stats
  const avgScore =
    completedResults.length > 0
      ? Math.round(
          completedResults.reduce((s, r) => s + (r.score || 0), 0) /
            completedResults.length,
        )
      : 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#212D40] flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-[#D56753]" />
          Market Checkup
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          See how any practice stacks up against its competition. In seconds.
          Enter up to 50 practices.
        </p>
      </div>

      {/* ── State 1: Upload ── */}
      {!batchId && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <label className="block text-sm font-semibold text-[#212D40] mb-2">
              Practices to analyze
            </label>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={`Cascade Endodontics, Bend, OR\nSmith Orthodontics, Portland, OR\nMountain View Dental, Denver, CO`}
              rows={8}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-[#212D40] placeholder:text-gray-400 focus:outline-none focus:border-[#D56753] focus:ring-2 focus:ring-[#D56753]/10"
            />
            <p className="text-xs text-gray-400 mt-1.5">
              One per line: Practice Name, City, State
            </p>

            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-[#212D40] hover:border-gray-300 hover:shadow-sm transition-all"
              >
                <Upload className="h-4 w-4" />
                Upload CSV
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
              {practices.length > 0 && (
                <span className="text-xs text-gray-400">
                  {practices.length} practice{practices.length !== 1 ? "s" : ""}{" "}
                  detected
                </span>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={practices.length === 0 || submitting || practices.length > 50}
            className="flex items-center gap-2 rounded-xl bg-[#D56753] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : practices.length === 0 ? (
              "Enter practices above to begin"
            ) : (
              <>
                <Play className="h-4 w-4" />
                Analyze {practices.length} Practice{practices.length !== 1 ? "s" : ""} &rarr;
              </>
            )}
          </button>

          {practices.length > 50 && (
            <p className="text-xs text-red-500">
              Maximum 50 practices per batch. Please reduce your list.
            </p>
          )}

          {/* Empty state — blurred sample result */}
          {practices.length === 0 && !batchId && (
            <div className="relative mt-2 select-none" aria-hidden="true">
              <div className="absolute inset-0 backdrop-blur-[3px] bg-white/40 rounded-2xl z-10 flex items-center justify-center">
                <span className="text-sm font-medium text-gray-400">
                  Your results will appear here
                </span>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden opacity-60">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="px-4 py-3 font-medium text-gray-400 w-8"></th>
                      <th className="px-4 py-3 font-medium text-gray-400">Practice</th>
                      <th className="px-4 py-3 font-medium text-gray-400">City</th>
                      <th className="px-4 py-3 font-medium text-gray-400 text-right">Score</th>
                      <th className="px-4 py-3 font-medium text-gray-400">Top Competitor</th>
                      <th className="px-4 py-3 font-medium text-gray-400">Gap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: "Cascade Endodontics", city: "Bend, OR", score: 72, comp: "High Desert Endo", gap: "14 more reviews" },
                      { name: "Smith Orthodontics", city: "Portland, OR", score: 58, comp: "Rose City Braces", gap: "32 more reviews" },
                      { name: "Mountain View Dental", city: "Denver, CO", score: 81, comp: "Mile High Dental", gap: "Leading market" },
                    ].map((r, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-4 py-3"><CheckCircle2 className="h-4 w-4 text-gray-300" /></td>
                        <td className="px-4 py-3 font-medium text-gray-400">{r.name}</td>
                        <td className="px-4 py-3 text-gray-300">{r.city}</td>
                        <td className="px-4 py-3 text-right font-bold text-gray-300">{r.score}</td>
                        <td className="px-4 py-3 text-gray-300">{r.comp}</td>
                        <td className="px-4 py-3 text-gray-300">{r.gap}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── State 2: Processing / State 3: Complete ── */}
      {batchId && batchStatus && (
        <div className="space-y-6">
          {/* Progress bar */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-[#212D40]">
                {isComplete ? "Analysis Complete" : "Analyzing..."}
              </span>
              <span className="text-sm text-gray-500">
                {batchStatus.completed + batchStatus.failed} / {batchStatus.total}
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${isComplete ? "bg-emerald-500" : "bg-[#D56753]"}`}
                style={{
                  width: `${((batchStatus.completed + batchStatus.failed) / Math.max(batchStatus.total, 1)) * 100}%`,
                }}
              />
            </div>
            {!isComplete && !pollTimedOut && (
              <p className="text-xs text-gray-400 mt-2">
                ~{Math.max(0, (batchStatus.total - batchStatus.completed - batchStatus.failed) * 2)}s remaining
              </p>
            )}
            {pollTimedOut && !isComplete && (
              <p className="text-sm text-amber-600 mt-3">
                Analysis is taking longer than expected. Check back in a few minutes.
              </p>
            )}
          </div>

          {/* Summary (when complete) */}
          {isComplete && completedResults.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
                <p className="text-2xl font-bold text-[#212D40]">
                  {completedResults.length}
                </p>
                <p className="text-xs text-gray-500">Analyzed</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
                <p className="text-2xl font-bold text-[#212D40]">{avgScore}</p>
                <p className="text-xs text-gray-500">Avg Score</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
                <p className="text-2xl font-bold text-red-500">
                  {completedResults.filter((r) => (r.score || 0) < 60).length}
                </p>
                <p className="text-xs text-gray-500">Below 60</p>
              </div>
            </div>
          )}

          {/* Results table */}
          {results.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="px-4 py-3 font-medium text-gray-500 w-8"></th>
                      <th className="px-4 py-3 font-medium text-gray-500">Practice</th>
                      <th className="px-4 py-3 font-medium text-gray-500">City</th>
                      <th className="px-4 py-3 font-medium text-gray-500 text-right">Score</th>
                      <th className="px-4 py-3 font-medium text-gray-500">Top Competitor</th>
                      <th className="px-4 py-3 font-medium text-gray-500">Gap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.id} className="border-t border-gray-100">
                        <td className="px-4 py-3">
                          <StatusDot status={r.status} />
                        </td>
                        <td className="px-4 py-3 font-medium text-[#212D40]" title={r.practiceName}>
                          {r.practiceName}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {r.city}{r.state ? `, ${r.state}` : ""}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {r.score != null ? (
                            <span
                              className={`font-bold ${
                                r.score >= 80
                                  ? "text-emerald-600"
                                  : r.score >= 60
                                    ? "text-amber-600"
                                    : "text-[#D56753]"
                              }`}
                            >
                              {r.score}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600 truncate max-w-[200px]" title={r.topCompetitorName || ""}>
                          {r.topCompetitorName || "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-500 truncate max-w-[200px]" title={r.primaryGap || ""}>
                          {r.primaryGap || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actions */}
          {isComplete && (
            <div className="flex gap-3">
              <button
                onClick={() => {
                  const csv = exportCSV(completedResults);
                  downloadCSV(csv, `batch-checkup-${batchId?.slice(0, 8)}.csv`);
                }}
                className="flex items-center gap-2 rounded-xl bg-[#212D40] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#212D40]/90 transition-colors"
              >
                <Download className="h-4 w-4" />
                Download CSV
              </button>
              <button
                onClick={() => {
                  const text = completedResults
                    .map(
                      (r) =>
                        `${r.practiceName}\t${r.city}\t${r.score}\t${r.topCompetitorName || ""}\t${r.primaryGap || ""}\t${r.emailParagraph || ""}`,
                    )
                    .join("\n");
                  navigator.clipboard.writeText(text).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  });
                }}
                className="flex items-center gap-2 rounded-xl border border-[#212D40]/20 px-5 py-2.5 text-sm font-medium text-[#212D40] hover:border-[#212D40]/40 transition-colors"
              >
                <Copy className="h-4 w-4" />
                {copied ? "Copied!" : "Copy for ProspectAI"}
              </button>
              <button
                onClick={handleReset}
                className="text-sm text-gray-500 hover:text-[#212D40] transition-colors px-3"
              >
                Run another batch
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
