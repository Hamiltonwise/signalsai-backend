/**
 * Intelligence Panel — PatientPath SEO/AEO/CRO Dashboard (WO-8)
 *
 * Route: /admin/organizations/:id/intelligence
 * Three tabs: SEO Audit, AEO Content, CRO Experiments
 * Combined Intelligence Score at top
 */

import { useState } from "react";
import { useParams } from "react-router-dom";
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
} from "lucide-react";

const API_BASE = "/api/admin";

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

// ─── SEO Tab ──────────────────────────────────────────────

function SEOTab({ orgId }: { orgId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["intel-seo", orgId],
    queryFn: () => fetchJSON(`/intelligence/seo/${orgId}`),
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <LoadingState />;

  const audit = data?.audit;
  if (!audit) {
    return (
      <EmptyState
        icon={<Search className="h-8 w-8 text-gray-300" />}
        text="No SEO audit data yet. First audit runs Sunday 8pm PT."
      />
    );
  }

  const factors = typeof audit.factors === "string" ? JSON.parse(audit.factors) : audit.factors;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-3xl font-semibold text-[#212D40]">{audit.seo_score}/100</p>
          <p className="text-xs text-gray-400 mt-1">Last audited {formatDate(audit.audited_at)}</p>
        </div>
        {audit.score_delta != null && audit.score_delta !== 0 && (
          <DeltaBadge delta={audit.score_delta} label="pts" />
        )}
      </div>

      <div className="space-y-2">
        {Array.isArray(factors) && factors.map((f: any, i: number) => (
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
                {f.name.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
              </span>
            </div>
            <span className="text-xs text-gray-400">{f.details}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AEO Tab ──────────────────────────────────────────────

function AEOTab({ orgId }: { orgId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["intel-aeo", orgId],
    queryFn: () => fetchJSON(`/intelligence/aeo/${orgId}`),
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <LoadingState />;

  const faqs = data?.faqs || [];
  if (faqs.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquare className="h-8 w-8 text-gray-300" />}
        text="No FAQ content generated yet. AEO content is created when a PatientPath site is built."
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
        {faqs.length} FAQs ({faqs.filter((f: any) => f.status === "published").length} published)
      </p>
      {faqs.map((faq: any, i: number) => (
        <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-[#212D40]">{faq.question}</p>
            <StatusBadge status={faq.status} />
          </div>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">{faq.answer}</p>
        </div>
      ))}
    </div>
  );
}

// ─── CRO Tab ──────────────────────────────────────────────

function CROTab({ orgId }: { orgId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["intel-cro", orgId],
    queryFn: () => fetchJSON(`/intelligence/cro/${orgId}`),
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <LoadingState />;

  const experiments = data?.experiments || [];
  if (experiments.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 className="h-8 w-8 text-gray-300" />}
        text="No CRO experiments running. Experiments start automatically when a PatientPath site receives traffic."
      />
    );
  }

  return (
    <div className="space-y-4">
      {experiments.map((exp: any) => (
        <div key={exp.id} className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-[#212D40]">{exp.experiment_name}</p>
            {exp.concluded ? (
              <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                Concluded
              </span>
            ) : (
              <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                Running
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            {["a", "b", "c"].map((v) => {
              const text = exp[`variant_${v}`];
              if (!text) return null;
              const conversions = exp[`variant_${v}_conversions`] || 0;
              const rate = exp.total_impressions > 0 ? ((conversions / exp.total_impressions) * 100).toFixed(1) : "0.0";
              const isWinner = exp.winning_variant === v;
              return (
                <div
                  key={v}
                  className={`rounded-lg p-3 ${isWinner ? "bg-emerald-50 border border-emerald-200" : "bg-gray-50"}`}
                >
                  <p className="text-xs font-bold uppercase text-gray-400 mb-1">
                    Variant {v.toUpperCase()} {isWinner && "Winner"}
                  </p>
                  <p className="text-xs text-gray-600 mb-2 line-clamp-2">{text}</p>
                  <p className="text-lg font-bold text-[#212D40]">{rate}%</p>
                  <p className="text-xs text-gray-400">{conversions} conv</p>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            {exp.total_impressions} impressions
            {exp.concluded ? ` | Concluded ${formatDate(exp.concluded_at)}` : ` | Started ${formatDate(exp.started_at)}`}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Shared Components ────────────────────────────────────

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
        positive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
      }`}
    >
      {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {positive ? "+" : ""}{delta} {label}
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
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors[status] || "bg-gray-100 text-gray-500"}`}>
      {status}
    </span>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Main Component ───────────────────────────────────────

const TABS = [
  { key: "seo", label: "SEO Audit", icon: Search },
  { key: "aeo", label: "AEO Content", icon: MessageSquare },
  { key: "cro", label: "CRO Tests", icon: BarChart3 },
] as const;

export default function IntelligencePanel() {
  const { id } = useParams<{ id: string }>();
  const orgId = Number(id);
  const [activeTab, setActiveTab] = useState<"seo" | "aeo" | "cro">("seo");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-bold text-[#212D40] mb-6">Intelligence Panel</h1>

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
      {activeTab === "seo" && <SEOTab orgId={orgId} />}
      {activeTab === "aeo" && <AEOTab orgId={orgId} />}
      {activeTab === "cro" && <CROTab orgId={orgId} />}
    </div>
  );
}
