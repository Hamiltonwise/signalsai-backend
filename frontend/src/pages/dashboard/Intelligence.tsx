/**
 * WO-8: Dashboard Intelligence View
 *
 * Shows SEO score, AEO status, and CRO results for the authenticated org.
 * Three tabs matching the admin Intelligence Panel.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, MessageSquare, BarChart3, Loader2 } from "lucide-react";
import FocusKeywords from "@/components/dashboard/FocusKeywords";

function getToken(): string {
  return localStorage.getItem("auth_token") || "";
}

async function fetchJSON(path: string) {
  const res = await fetch(`/api/admin${path}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) return null;
  return res.json();
}

type Tab = "seo" | "aeo" | "cro";

const TABS: { id: Tab; label: string; icon: typeof Search }[] = [
  { id: "seo", label: "SEO Audit", icon: Search },
  { id: "aeo", label: "AEO Content", icon: MessageSquare },
  { id: "cro", label: "CRO Tests", icon: BarChart3 },
];

export default function Intelligence() {
  const [activeTab, setActiveTab] = useState<Tab>("seo");

  // Get org ID from user profile
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const res = await fetch("/api/profile", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const orgId = profile?.organizationId;

  const { data: scoreData } = useQuery({
    queryKey: ["intel-score", orgId],
    queryFn: () => fetchJSON(`/intelligence/score/${orgId}`),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  });

  if (!orgId) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const score = scoreData?.combinedScore ?? 0;
  const scoreColor = score >= 80 ? "text-green-600" : score >= 60 ? "text-amber-600" : "text-red-600";

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Intelligence</h1>
        <div className="text-right">
          <p className="text-sm text-gray-500">Intelligence Score</p>
          <p className={`text-3xl font-bold ${scoreColor}`}>{score}/100</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${
              activeTab === id
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "seo" && <SEOContent orgId={orgId} />}
      {activeTab === "aeo" && <AEOContent orgId={orgId} />}
      {activeTab === "cro" && <CROContent orgId={orgId} />}
    </div>
  );
}

function SEOContent({ orgId }: { orgId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["intel-seo", orgId],
    queryFn: () => fetchJSON(`/intelligence/seo/${orgId}`),
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <LoadingCard />;

  const audit = data?.audit;
  if (!audit) {
    return <EmptyCard message="No SEO audit yet. Your first audit runs Sunday at 8pm PT." />;
  }

  const factors = typeof audit.factors === "string" ? JSON.parse(audit.factors) : audit.factors || [];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">SEO Score: {audit.seo_score}/100</h2>
          {audit.score_delta !== 0 && (
            <span className={audit.score_delta > 0 ? "text-green-600" : "text-red-600"}>
              {audit.score_delta > 0 ? "+" : ""}{audit.score_delta} pts
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {Array.isArray(factors) && factors.map((f: any, i: number) => (
            <div key={i} className="flex items-center gap-2 rounded border px-3 py-2 text-sm">
              <span className={`h-2 w-2 rounded-full ${f.passed ? "bg-green-500" : "bg-red-500"}`} />
              <span className="text-gray-700">{f.name?.replace(/_/g, " ")}</span>
            </div>
          ))}
        </div>
      </div>
      <FocusKeywords />
    </div>
  );
}

function AEOContent({ orgId }: { orgId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["intel-aeo", orgId],
    queryFn: () => fetchJSON(`/intelligence/aeo/${orgId}`),
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <LoadingCard />;

  const faqs = data?.faqs || [];
  if (faqs.length === 0) {
    return <EmptyCard message="No AEO content generated yet. FAQ content is created automatically when your website is built." />;
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold">FAQ Content ({faqs.length} questions)</h2>
      {faqs.map((faq: any) => (
        <div key={faq.id} className="rounded border px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="font-medium text-gray-900">{faq.question}</p>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              faq.status === "published" ? "bg-green-100 text-green-800" :
              faq.status === "approved" ? "bg-blue-100 text-blue-800" :
              "bg-gray-100 text-gray-600"
            }`}>
              {faq.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600">{faq.answer}</p>
        </div>
      ))}
    </div>
  );
}

function CROContent({ orgId }: { orgId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["intel-cro", orgId],
    queryFn: () => fetchJSON(`/intelligence/cro/${orgId}`),
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <LoadingCard />;

  const experiments = data?.experiments || [];
  if (experiments.length === 0) {
    return <EmptyCard message="No CRO experiments running yet. Tests begin automatically after your website goes live." />;
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold">CRO Experiments</h2>
      {experiments.map((exp: any) => (
        <div key={exp.id} className="rounded border px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="font-medium text-gray-900">{exp.experiment_name}</p>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              exp.concluded ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
            }`}>
              {exp.concluded ? "Concluded" : "Running"}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {exp.total_impressions} impressions
            {exp.winning_variant ? ` | Winner: Variant ${exp.winning_variant.toUpperCase()}` : ""}
          </p>
        </div>
      ))}
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="flex h-40 items-center justify-center rounded-lg border border-gray-200 bg-white">
      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
    </div>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-lg border border-gray-200 bg-white px-6 text-center text-sm text-gray-500">
      {message}
    </div>
  );
}
