/**
 * AAE 2026 Conference Dashboard -- /admin/aae
 *
 * Mission control for Corey at the AAE booth.
 * Dark theme, mobile-first, auto-refreshes every 30s.
 * Shows scans, completions, accounts, shares in real time.
 */

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  Scan,
  CheckCircle2,
  UserPlus,
  Share2,
  Sparkles,
  DollarSign,
  ArrowRight,
  Radio,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────

interface AAECounts {
  scans: number;
  completions: number;
  accounts: number;
  shares: number;
}

interface AAEEvent {
  id: string;
  event_type: string;
  org_name: string;
  city: string | null;
  created_at: string;
}

interface AAEFinding {
  practice: string;
  finding: string;
  score: number | null;
  created_at: string;
}

interface AAEData {
  success: boolean;
  counts: AAECounts;
  recentEvents: AAEEvent[];
  topFindings: AAEFinding[];
  mrr: {
    current: number;
    projected: number;
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000,
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function eventLabel(type: string): { label: string; color: string } {
  if (type.includes("started") || type.includes("scan_started"))
    return { label: "SCANNED", color: "text-blue-400" };
  if (
    type.includes("analyzed") ||
    type.includes("complete") ||
    type.includes("scan_completed")
  )
    return { label: "COMPLETED", color: "text-[#D56753]" };
  if (type.includes("account"))
    return { label: "SIGNED UP", color: "text-emerald-400" };
  if (type.includes("share") || type.includes("colleague") || type.includes("invite"))
    return { label: "SHARED", color: "text-purple-400" };
  if (type.includes("gate"))
    return { label: "VIEWED GATE", color: "text-amber-400" };
  if (type.includes("email"))
    return { label: "EMAIL CAPTURED", color: "text-cyan-400" };
  return { label: type.split(".").pop()?.toUpperCase() || "EVENT", color: "text-gray-400" };
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents);
}

// ── Component ───────────────────────────────────────────────────────

export default function AAEDashboard() {
  const [data, setData] = useState<AAEData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [countdown, setCountdown] = useState(30);

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/aae-dashboard", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("fetch failed");
      const json: AAEData = await res.json();
      setData(json);
    } catch {
      // Keep existing data on error
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
      setCountdown(30);
    }
  }, []);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Countdown timer
  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 30 : prev - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  // ── Loading State ───────────────────────────────────────────────

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-[#212D40] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Radio className="w-10 h-10 text-[#D56753] animate-pulse" />
          <p className="text-gray-400 text-sm font-medium">
            Connecting to AAE Live...
          </p>
        </div>
      </div>
    );
  }

  const counts = data?.counts || {
    scans: 0,
    completions: 0,
    accounts: 0,
    shares: 0,
  };
  const events = data?.recentEvents || [];
  const findings = data?.topFindings || [];
  const mrr = data?.mrr || { current: 0, projected: 0 };

  // Funnel percentages (relative to scans as 100%)
  const maxFunnel = Math.max(counts.scans, 1);
  const funnelBars = [
    {
      label: "Scans",
      count: counts.scans,
      pct: 100,
      color: "bg-blue-500",
    },
    {
      label: "Completions",
      count: counts.completions,
      pct: Math.round((counts.completions / maxFunnel) * 100),
      color: "bg-[#D56753]",
    },
    {
      label: "Accounts",
      count: counts.accounts,
      pct: Math.round((counts.accounts / maxFunnel) * 100),
      color: "bg-emerald-500",
    },
    {
      label: "Shares",
      count: counts.shares,
      pct: Math.round((counts.shares / maxFunnel) * 100),
      color: "bg-purple-500",
    },
  ];

  // ── Empty State ─────────────────────────────────────────────────

  const isEmpty =
    counts.scans === 0 &&
    counts.completions === 0 &&
    counts.accounts === 0 &&
    counts.shares === 0;

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#212D40] text-white">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Radio className="w-6 h-6 text-[#D56753]" />
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#D56753] rounded-full animate-ping" />
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#D56753] rounded-full" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight">
                AAE 2026 LIVE
              </h1>
              <p className="text-[11px] text-gray-500 font-medium">
                Salt Lake City, April 15-18
              </p>
            </div>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-xs text-gray-400"
          >
            <RefreshCw className="w-3 h-3" />
            <span>{countdown}s</span>
          </button>
        </div>

        {/* Last refresh */}
        <p className="text-[10px] text-gray-600 -mt-4">
          Last update: {lastRefresh.toLocaleTimeString()}
        </p>

        {isEmpty ? (
          /* Pre-conference waiting state */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-[#D56753]/10 flex items-center justify-center mb-6">
              <Radio className="w-8 h-8 text-[#D56753]" />
            </div>
            <h2 className="text-lg font-bold text-white mb-2">
              Standing by for first scan
            </h2>
            <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
              This dashboard activates the moment the first doctor scans
              the QR code at the Alloro booth.
            </p>
            <div className="mt-8 flex items-center gap-2 text-[11px] text-gray-600">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              Monitoring behavioral_events in real time
            </div>
          </div>
        ) : (
          <>
            {/* Big 4 Numbers */}
            <div className="grid grid-cols-2 gap-3">
              <BigNumber
                icon={Scan}
                label="Scans"
                value={counts.scans}
                color="text-blue-400"
                bgColor="bg-blue-500/10"
              />
              <BigNumber
                icon={CheckCircle2}
                label="Completions"
                value={counts.completions}
                color="text-[#D56753]"
                bgColor="bg-[#D56753]/10"
              />
              <BigNumber
                icon={UserPlus}
                label="Accounts"
                value={counts.accounts}
                color="text-emerald-400"
                bgColor="bg-emerald-500/10"
              />
              <BigNumber
                icon={Share2}
                label="Shared"
                value={counts.shares}
                color="text-purple-400"
                bgColor="bg-purple-500/10"
              />
            </div>

            {/* Live Feed */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2 h-2 bg-[#D56753] rounded-full animate-pulse" />
                <p className="text-xs font-bold uppercase tracking-widest text-[#D56753]">
                  Live Feed
                </p>
              </div>
              {events.length === 0 ? (
                <p className="text-sm text-gray-600">
                  Waiting for first event...
                </p>
              ) : (
                <div className="space-y-2">
                  {events.map((event, i) => {
                    const { label, color } = eventLabel(event.event_type);
                    return (
                      <div
                        key={event.id}
                        className={`flex items-center justify-between rounded-xl px-3 py-2.5 transition-all ${
                          i === 0
                            ? "bg-white/[0.06] ring-1 ring-[#D56753]/30"
                            : "bg-white/[0.02]"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white truncate">
                            {event.org_name}
                            {event.city ? (
                              <span className="text-gray-500 font-normal">
                                {" "}
                                {event.city}
                              </span>
                            ) : null}
                          </p>
                          <p className="text-[10px] text-gray-600 mt-0.5">
                            {timeAgo(event.created_at)}
                          </p>
                        </div>
                        <span
                          className={`text-[10px] font-black tracking-wider ${color} shrink-0 ml-2`}
                        >
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Conversion Funnel */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">
                Conversion Funnel
              </p>
              <div className="space-y-3">
                {funnelBars.map((bar, i) => (
                  <div key={bar.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-400 font-medium">
                        {bar.label}
                      </span>
                      <span className="text-xs font-black text-white">
                        {bar.count}
                      </span>
                    </div>
                    <div className="h-3 rounded-full bg-white/[0.05] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${bar.color} transition-all duration-700 ease-out`}
                        style={{
                          width: `${Math.max(bar.pct, bar.count > 0 ? 4 : 0)}%`,
                        }}
                      />
                    </div>
                    {i < funnelBars.length - 1 && (
                      <div className="flex justify-center py-0.5">
                        <ArrowRight className="w-3 h-3 text-gray-700 rotate-90" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {counts.scans > 0 && (
                <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between">
                  <span className="text-[11px] text-gray-500">
                    Scan-to-account rate
                  </span>
                  <span className="text-sm font-black text-[#D56753]">
                    {Math.round((counts.accounts / counts.scans) * 100)}%
                  </span>
                </div>
              )}
            </div>

            {/* Top Findings (Oz Moments) */}
            {findings.length > 0 && (
              <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
                    Oz Moments
                  </p>
                </div>
                <div className="space-y-3">
                  {findings.map((f, i) => (
                    <div
                      key={i}
                      className="rounded-xl bg-white/[0.03] px-3 py-3"
                    >
                      <p className="text-sm text-white leading-relaxed">
                        "{f.finding}"
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[10px] text-gray-500">
                          {f.practice}
                        </span>
                        {f.score && (
                          <span className="text-[10px] font-black text-[#D56753]">
                            Score: {f.score}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* MRR */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
                  Revenue
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
                    Current MRR
                  </p>
                  <p className="text-2xl font-black text-emerald-400">
                    {formatCurrency(mrr.current)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
                    If all convert
                  </p>
                  <p className="text-2xl font-black text-[#D56753]">
                    {formatCurrency(mrr.projected)}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Footer */}
        <p className="text-center text-[10px] text-gray-700 pb-4">
          Alloro Business Clarity Platform
        </p>
      </div>
    </div>
  );
}

// ── Big Number Card ─────────────────────────────────────────────────

function BigNumber({
  icon: Icon,
  label,
  value,
  color,
  bgColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4">
      <div className="flex items-center gap-2 mb-3">
        <div
          className={`w-8 h-8 rounded-lg ${bgColor} flex items-center justify-center`}
        >
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
          {label}
        </p>
      </div>
      <p className={`text-4xl font-black ${color}`}>{value}</p>
    </div>
  );
}
