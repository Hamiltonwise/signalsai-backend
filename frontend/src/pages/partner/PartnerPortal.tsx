/**
 * Partner Portal — /partner
 *
 * Three screens for referral partners and agencies:
 * 1. Portfolio: practices referred, with health status
 * 2. Checkup: run scans, share results with doctors
 * 3. Performance: referral code stats
 *
 * Separate surface from Doctor Dashboard and HQ Admin.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Briefcase,
  Search,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
  Copy,
  Users,
  DollarSign,
  Target,
  ArrowRight,
} from "lucide-react";
import { apiGet } from "@/api/index";

// ─── Types ──────────────────────────────────────────────────────────

interface PortfolioPractice {
  id: number;
  name: string;
  city: string | null;
  specialty: string | null;
  score: number | null;
  previousScore: number | null;
  rankPosition: number | null;
  subscriptionStatus: string | null;
  subscriptionTier: string | null;
  createdAt: string;
}

interface PortfolioStats {
  totalReferred: number;
  totalMRR: number;
  avgScore: number | null;
  referralCode: string | null;
}

interface PerformanceData {
  referralCode: string | null;
  totalScans: number;
  emailsCaptured: number;
  accountsCreated: number;
  activeSubscriptions: number;
  estimatedMRR: number;
}

// ─── Sidebar ────────────────────────────────────────────────────────

type PartnerTab = "portfolio" | "checkup" | "performance";

function PartnerSidebar({
  active,
  onChange,
}: {
  active: PartnerTab;
  onChange: (tab: PartnerTab) => void;
}) {
  const items: { key: PartnerTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "portfolio", label: "Portfolio", icon: Briefcase },
    { key: "checkup", label: "Checkup", icon: Search },
    { key: "performance", label: "Performance", icon: BarChart3 },
  ];

  return (
    <nav className="flex lg:flex-col gap-1 lg:w-56 lg:shrink-0">
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => onChange(item.key)}
          className={`flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
            active === item.key
              ? "bg-[#D56753] text-white shadow-sm"
              : "text-gray-500 hover:text-[#212D40] hover:bg-gray-100"
          }`}
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </button>
      ))}
    </nav>
  );
}

// ─── Screen 1: Portfolio View ───────────────────────────────────────

function PortfolioView() {
  const { data, isLoading } = useQuery({
    queryKey: ["partner-portfolio"],
    queryFn: async () => {
      const res = await apiGet({ path: "/partner/portfolio" });
      return res?.success ? res : null;
    },
    staleTime: 5 * 60_000,
  });

  const portfolio: PortfolioPractice[] = data?.portfolio || [];
  const stats: PortfolioStats = data?.stats || { totalReferred: 0, totalMRR: 0, avgScore: null, referralCode: null };

  return (
    <div className="space-y-6">
      {/* Stats header */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-black text-[#212D40]">{stats.totalReferred}</p>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">Practices</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-black text-emerald-600">${stats.totalMRR}</p>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">MRR Attributed</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-black text-[#212D40]">{stats.avgScore ?? "—"}</p>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">Avg Score</p>
        </div>
      </div>

      {/* Practice cards */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-gray-200 bg-white" />
          ))}
        </div>
      )}

      {!isLoading && portfolio.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center">
          <Search className="h-8 w-8 text-gray-300 mx-auto mb-3" />
          <p className="text-base font-semibold text-[#212D40]">Run your first Checkup to add a practice.</p>
          <p className="text-sm text-gray-400 mt-1">
            Use the Checkup tab to scan any practice and add it to your portfolio.
          </p>
        </div>
      )}

      {portfolio.map((p) => {
        const scoreDelta = p.score && p.previousScore ? p.score - p.previousScore : null;
        const trend = scoreDelta && scoreDelta > 0 ? "up" : scoreDelta && scoreDelta < 0 ? "down" : "flat";

        return (
          <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-5 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#212D40] truncate">{p.name}</p>
              <p className="text-xs text-gray-500">
                {p.city && `${p.city} · `}{p.specialty || "Practice"}
              </p>
              <div className="flex items-center gap-3 mt-2">
                {p.subscriptionStatus === "active" && (
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Active</span>
                )}
                {p.subscriptionStatus !== "active" && (
                  <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    {p.subscriptionStatus || "Pending"}
                  </span>
                )}
                {p.rankPosition && (
                  <span className="text-[10px] text-gray-400">Rank #{p.rankPosition}</span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0 ml-4">
              <p className={`text-2xl font-black ${
                p.score && p.score >= 70 ? "text-emerald-600" : p.score && p.score >= 50 ? "text-amber-600" : "text-[#D56753]"
              }`}>
                {p.score ?? "—"}
              </p>
              <div className="flex items-center justify-end gap-1 mt-0.5">
                {trend === "up" && <TrendingUp className="h-3 w-3 text-emerald-500" />}
                {trend === "down" && <TrendingDown className="h-3 w-3 text-red-500" />}
                {trend === "flat" && <Minus className="h-3 w-3 text-gray-300" />}
                <span className="text-[10px] text-gray-400">/100</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Screen 2: Checkup Launcher ─────────────────────────────────────

function CheckupLauncher() {
  const [copied, setCopied] = useState(false);

  const { data: perfData } = useQuery({
    queryKey: ["partner-performance"],
    queryFn: async () => {
      const res = await apiGet({ path: "/partner/performance" });
      return res?.success ? res.performance : null;
    },
    staleTime: 5 * 60_000,
  });

  const refCode = perfData?.referralCode;
  const checkupUrl = refCode
    ? `${window.location.origin}/checkup?ref=${refCode}`
    : `${window.location.origin}/checkup`;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h3 className="text-base font-bold text-[#212D40] mb-2">Run a Checkup</h3>
        <p className="text-sm text-gray-500 mb-4">
          Search any practice to generate a live Business Health Score. Results are automatically added to your portfolio.
        </p>
        <a
          href={checkupUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-[#D56753] text-white text-sm font-semibold px-5 py-3 shadow-[0_4px_14px_rgba(213,103,83,0.35)] hover:brightness-105 transition-all"
        >
          Open Checkup
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h3 className="text-base font-bold text-[#212D40] mb-2">Share with a Doctor</h3>
        <p className="text-sm text-gray-500 mb-4">
          Send this link to a doctor. They'll see the full Checkup experience with the blur gate.
          When they sign up, the account is attributed to you.
        </p>
        <div className="flex gap-2">
          <input
            readOnly
            value={checkupUrl}
            className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-500 truncate"
          />
          <button
            onClick={() => {
              navigator.clipboard.writeText(checkupUrl).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-xs font-semibold transition-all ${
              copied
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-[#212D40] text-white hover:bg-[#212D40]/90"
            }`}
          >
            <Copy className="h-3 w-3" />
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
        {refCode && (
          <p className="text-[11px] text-gray-400 mt-2">
            Your referral code: <span className="font-mono font-bold">{refCode}</span>
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Screen 3: Performance Dashboard ────────────────────────────────

function PerformanceDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["partner-performance"],
    queryFn: async () => {
      const res = await apiGet({ path: "/partner/performance" });
      return res?.success ? res.performance as PerformanceData : null;
    },
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-gray-200 bg-white" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-400">
        <BarChart3 className="h-8 w-8 mx-auto mb-3 opacity-40" />
        <p className="text-sm">Performance data appears after your first referral.</p>
      </div>
    );
  }

  const funnel = [
    { label: "Checkup Scans", value: data.totalScans, icon: Search },
    { label: "Emails Captured", value: data.emailsCaptured, icon: Target },
    { label: "Accounts Created", value: data.accountsCreated, icon: Users },
    { label: "Active Subscriptions", value: data.activeSubscriptions, icon: DollarSign },
  ];

  return (
    <div className="space-y-6">
      {/* Referral code */}
      {data.referralCode && (
        <div className="bg-[#212D40] rounded-2xl p-5 text-white flex items-center justify-between">
          <div>
            <p className="text-xs text-white/50 uppercase tracking-wider font-bold">Your Referral Code</p>
            <p className="text-2xl font-mono font-black mt-1">{data.referralCode}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/50 uppercase tracking-wider font-bold">Estimated MRR</p>
            <p className="text-2xl font-black mt-1">${data.estimatedMRR}</p>
          </div>
        </div>
      )}

      {/* Funnel */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Conversion Funnel</p>
        {funnel.map((step, i) => {
          const pct = funnel[0].value > 0
            ? Math.round((step.value / funnel[0].value) * 100)
            : 0;
          return (
            <div key={step.label} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#D56753]/10 flex items-center justify-center">
                  <step.icon className="h-4 w-4 text-[#D56753]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#212D40]">{step.label}</p>
                  {i > 0 && funnel[0].value > 0 && (
                    <p className="text-[10px] text-gray-400">{pct}% of scans</p>
                  )}
                </div>
              </div>
              <p className="text-xl font-black text-[#212D40]">{step.value}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export default function PartnerPortal() {
  const [activeTab, setActiveTab] = useState<PartnerTab>("portfolio");

  return (
    <div className="min-h-dvh bg-[#FAFAF8]">
      {/* Header */}
      <header className="bg-[#212D40] text-white py-4 px-5">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#D56753] flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L14 14H2L8 2Z" fill="white" opacity="0.9"/>
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight">alloro</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 bg-white/10 px-2.5 py-0.5 rounded-full ml-2">
              Partner
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <PartnerSidebar active={activeTab} onChange={setActiveTab} />

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="mb-6">
              <h1 className="text-2xl font-extrabold text-[#212D40]">
                {activeTab === "portfolio" && "Your Portfolio"}
                {activeTab === "checkup" && "Run a Checkup"}
                {activeTab === "performance" && "Referral Performance"}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {activeTab === "portfolio" && "Practices you've referred to Alloro."}
                {activeTab === "checkup" && "Scan any practice and share the results."}
                {activeTab === "performance" && "Your referral code performance."}
              </p>
            </div>

            {activeTab === "portfolio" && <PortfolioView />}
            {activeTab === "checkup" && <CheckupLauncher />}
            {activeTab === "performance" && <PerformanceDashboard />}
          </div>
        </div>
      </div>
    </div>
  );
}
