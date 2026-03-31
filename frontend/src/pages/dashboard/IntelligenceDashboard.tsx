/**
 * Practice Intelligence Dashboard (WO-8)
 *
 * Route: /dashboard/intelligence
 * Shows practice owner their SEO/AEO/CRO intelligence.
 * Three tabs with combined Intelligence Score at top.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  MessageSquare,
  BarChart3,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  XCircle,
  Loader2,
  Shield,
} from "lucide-react";

const API_BASE = "/api/intelligence";

function getToken(): string {
  return localStorage.getItem("auth_token") || "";
}

async function fetchJSON(path: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) return null;
  return res.json();
}

// SEO Tab
function SEOTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-intel-seo"],
    queryFn: () => fetchJSON("/seo"),
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <LoadingState />;

  const audits = data?.audits || [];
  if (audits.length === 0) {
    return (
      <EmptyState
        icon={<Search className="h-8 w-8 text-gray-300" />}
        text="No SEO audit data yet. Your first audit will run automatically on Sunday evening."
      />
    );
  }

  const latest = audits[0];
  const factors =
    typeof latest.factors === "string"
      ? JSON.parse(latest.factors)
      : latest.factors;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-3xl font-black text-[#212D40]">
            {latest.seo_score}/100
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Last audited {formatDate(latest.audited_at)}
          </p>
        </div>
        {latest.score_delta != null && latest.score_delta !== 0 && (
          <DeltaBadge delta={latest.score_delta} label="pts" />
        )}
      </div>

      <div className="space-y-2">
        {Array.isArray(factors) &&
          factors.map((f: { name: string; passed: boolean; details: string }, i: number) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                {f.passed ? (
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-400" />
                )}
                <span className="text-sm font-medium text-[#212D40]">
                  {f.name
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (c: string) => c.toUpperCase())}
                </span>
              </div>
              <span className="text-xs text-gray-400">{f.details}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

// AEO Tab
function AEOTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-intel-aeo"],
    queryFn: () => fetchJSON("/aeo"),
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <LoadingState />;

  const faqs = data?.faqs || [];
  if (faqs.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquare className="h-8 w-8 text-gray-300" />}
        text="FAQ content for your business is being prepared. This helps search engines answer questions about your business directly."
      />
    );
  }

  const published = faqs.filter((f: { status: string }) => f.status === "published");

  return (
    <div className="space-y-4">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
        {faqs.length} FAQs ({published.length} live on your site)
      </p>
      {faqs.map((faq: { question: string; answer: string; status: string }, i: number) => (
        <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-[#212D40]">
              {faq.question}
            </p>
            <StatusBadge status={faq.status} />
          </div>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">
            {faq.answer}
          </p>
        </div>
      ))}
    </div>
  );
}

// CRO Tab
function CROTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-intel-cro"],
    queryFn: () => fetchJSON("/cro"),
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <LoadingState />;

  const experiments = data?.experiments || [];
  if (experiments.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 className="h-8 w-8 text-gray-300" />}
        text="Conversion experiments will start automatically as your site gets traffic. We test different calls-to-action to find what works best for your business."
      />
    );
  }

  return (
    <div className="space-y-4">
      {experiments.map((exp: any) => (
        <div
          key={exp.id}
          className="rounded-xl border border-gray-200 bg-white p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-[#212D40]">
              {exp.experiment_name}
            </p>
            {exp.concluded ? (
              <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                Optimized
              </span>
            ) : (
              <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                Testing
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            {["a", "b", "c"].map((v) => {
              const text = exp[`variant_${v}`];
              if (!text) return null;
              const conversions = exp[`variant_${v}_conversions`] || 0;
              const rate =
                exp.total_impressions > 0
                  ? ((conversions / exp.total_impressions) * 100).toFixed(1)
                  : "0.0";
              const isWinner = exp.winning_variant === v;
              return (
                <div
                  key={v}
                  className={`rounded-lg p-3 ${isWinner ? "bg-emerald-50 border border-emerald-200" : "bg-gray-50"}`}
                >
                  <p className="text-[10px] font-bold uppercase text-gray-400 mb-1">
                    Option {v.toUpperCase()} {isWinner && "(Best)"}
                  </p>
                  <p className="text-xs text-gray-600 mb-2 line-clamp-2">
                    {text}
                  </p>
                  <p className="text-lg font-bold text-[#212D40]">{rate}%</p>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            {exp.total_impressions} visitors tested
          </p>
        </div>
      ))}
    </div>
  );
}

// Shared components
function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
      {icon}
      <p className="text-sm text-gray-400 max-w-xs">{text}</p>
    </div>
  );
}

function DeltaBadge({ delta, label }: { delta: number; label: string }) {
  const positive = delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
        positive
          ? "bg-emerald-50 text-emerald-700"
          : "bg-red-50 text-red-600"
      }`}
    >
      {positive ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      {positive ? "+" : ""}
      {delta} {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    staged: "bg-amber-50 text-amber-600",
    approved: "bg-blue-50 text-blue-600",
    published: "bg-emerald-50 text-emerald-600",
  };
  return (
    <span
      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${colors[status] || "bg-gray-100 text-gray-500"}`}
    >
      {status}
    </span>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// Tab definitions
const TABS = [
  { key: "seo", label: "SEO Health", icon: Search },
  { key: "aeo", label: "FAQ Content", icon: MessageSquare },
  { key: "cro", label: "Optimization", icon: BarChart3 },
] as const;

// Main component
export default function IntelligenceDashboard() {
  const [activeTab, setActiveTab] = useState<"seo" | "aeo" | "cro">("seo");

  const { data: summary } = useQuery({
    queryKey: ["dashboard-intel-summary"],
    queryFn: () => fetchJSON("/summary"),
    staleTime: 5 * 60_000,
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header with Intelligence Score */}
      <div className="flex items-center gap-3 mb-6">
        <Shield className="h-5 w-5 text-[#D56753]" />
        <h1 className="text-xl font-bold text-[#212D40]">
          Business Intelligence
        </h1>
      </div>

      {/* Score summary card */}
      {summary && (
        <div className="rounded-2xl bg-gradient-to-br from-[#212D40] to-[#2a3a52] p-6 mb-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-300 uppercase tracking-wider">
                Intelligence Score
              </p>
              <p className="text-4xl font-black mt-1">
                {summary.intelligenceScore ?? "--"}
                <span className="text-lg font-normal text-gray-400">/100</span>
              </p>
              {summary.lastAudit && (
                <p className="text-xs text-gray-400 mt-2">
                  Updated {formatDate(summary.lastAudit)}
                </p>
              )}
            </div>
            <div className="flex gap-6">
              <div className="text-center">
                <p className="text-2xl font-bold">{summary.seoScore ?? "--"}</p>
                <p className="text-[10px] text-gray-400 mt-1">SEO</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{summary.aeoFaqCount}</p>
                <p className="text-[10px] text-gray-400 mt-1">FAQs</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">
                  {summary.croExperimentsActive}
                </p>
                <p className="text-[10px] text-gray-400 mt-1">Tests</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-6 bg-gray-100 rounded-xl p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-colors flex-1 justify-center ${
              activeTab === tab.key
                ? "bg-white text-[#212D40] shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "seo" && <SEOTab />}
      {activeTab === "aeo" && <AEOTab />}
      {activeTab === "cro" && <CROTab />}
    </div>
  );
}
