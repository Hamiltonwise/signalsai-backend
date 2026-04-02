/**
 * Compliance Scanner -- Marketing claim verification.
 *
 * Scans website for FTC-risky marketing claims. Shows findings with
 * severity and fix suggestions. Scan on demand, results persist.
 */

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, AlertTriangle, Info, Loader2, RefreshCw } from "lucide-react";

const API = "/api/compliance";

async function apiFetch(path: string) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error((await res.json()).error || "Request failed");
  return res.json();
}

interface Finding {
  page: string;
  claim: string;
  concern: string;
  severity: "high" | "medium" | "low";
  suggestion: string;
}

function SeverityBadge({ severity }: { severity: string }) {
  const styles = {
    high: "bg-red-50 text-red-700 border-red-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    low: "bg-blue-50 text-blue-600 border-blue-200",
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${styles[severity as keyof typeof styles] || styles.low}`}>
      {severity.toUpperCase()}
    </span>
  );
}

export default function ComplianceScanner() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["compliance-findings"],
    queryFn: () => apiFetch("/findings"),
    staleTime: 5 * 60_000,
  });

  const scanMutation = useMutation({
    mutationFn: () => apiFetch("/scan"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["compliance-findings"] }),
  });

  const findings: Finding[] = data?.findings || [];
  const lastScan = data?.lastScan;
  const pagesScanned = data?.pagesScanned || 0;
  const autoScanTriggered = useRef(false);

  // Auto-scan on first visit if no scan exists. The product comes to you.
  useEffect(() => {
    if (!isLoading && !lastScan && !autoScanTriggered.current && !scanMutation.isPending) {
      autoScanTriggered.current = true;
      scanMutation.mutate();
    }
  }, [isLoading, lastScan]); // eslint-disable-line react-hooks/exhaustive-deps

  const highCount = findings.filter(f => f.severity === "high").length;
  const mediumCount = findings.filter(f => f.severity === "medium").length;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#D56753]" />
          <h3 className="font-semibold text-gray-900">Marketing Compliance</h3>
          {findings.length === 0 && lastScan && (
            <span className="text-xs text-emerald-600 font-medium">All clear</span>
          )}
          {highCount > 0 && (
            <span className="text-xs text-red-600 font-medium">{highCount} high priority</span>
          )}
        </div>
        <button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#D56753] transition-colors disabled:opacity-50"
        >
          {scanMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          {scanMutation.isPending ? "Scanning..." : "Scan now"}
        </button>
      </div>

      {/* Status line */}
      {lastScan && (
        <p className="text-xs text-gray-400 mb-3">
          Last scan: {new Date(lastScan).toLocaleDateString()} ({pagesScanned} pages)
          {findings.length > 0 && ` - ${findings.length} finding${findings.length !== 1 ? "s" : ""}`}
          {mediumCount > 0 && ` (${mediumCount} medium)`}
        </p>
      )}

      {/* No scan yet -- auto-scan is running */}
      {!lastScan && !isLoading && (
        <div className="text-center py-6">
          {scanMutation.isPending ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin text-[#D56753] mx-auto mb-2" />
              <p className="text-sm text-gray-600">Scanning your website for compliance concerns...</p>
              <p className="text-xs text-gray-400 mt-1">This takes about 15 seconds</p>
            </>
          ) : (
            <>
              <ShieldCheck className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500 mb-3">
                No website pages found to scan yet.
              </p>
            </>
          )}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      )}

      {/* Findings */}
      {findings.length > 0 && (
        <div className="space-y-2">
          {findings.map((finding, idx) => {
            const key = `${finding.page}-${idx}`;
            const isExpanded = expanded === key;
            return (
              <div
                key={key}
                className="border border-gray-100 rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => setExpanded(isExpanded ? null : key)}
                  className="w-full flex items-start gap-3 p-3 text-left hover:bg-gray-50 transition-colors"
                >
                  {finding.severity === "high" ? (
                    <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  ) : (
                    <Info className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs text-gray-400">{finding.page}</span>
                      <SeverityBadge severity={finding.severity} />
                    </div>
                    <p className="text-sm text-gray-800 line-clamp-2">
                      &ldquo;{finding.claim}&rdquo;
                    </p>
                  </div>
                </button>
                {isExpanded && (
                  <div className="px-3 pb-3 pt-0 ml-7 space-y-2 border-t border-gray-50">
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-0.5">Concern</p>
                      <p className="text-sm text-gray-700">{finding.concern}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-0.5">Suggested fix</p>
                      <p className="text-sm text-gray-700">{finding.suggestion}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Clean scan */}
      {findings.length === 0 && lastScan && !isLoading && (
        <div className="text-center py-4">
          <ShieldCheck className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
          <p className="text-sm text-gray-600">No compliance concerns found.</p>
          <p className="text-xs text-gray-400 mt-1">Your website content looks good.</p>
        </div>
      )}
    </div>
  );
}
