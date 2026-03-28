/**
 * GP Referral Intelligence — /dashboard/referrals
 *
 * The feature that makes Alloro worth $2,000/month to a specialist.
 * Three sections: Top Referrers, Drift Alerts, This Week's Move.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Phone,
  CheckCircle2,
  Upload,
  Camera,
  FileText,
} from "lucide-react";
import { apiGet, apiPost } from "@/api/index";
import { useLocationContext } from "@/contexts/locationContext";

// ─── Types ──────────────────────────────────────────────────────────

interface Referrer {
  name: string;
  referrals: number;
  revenue: number;
  trend: "up" | "flat" | "down";
  recentReferrals: number;
  priorReferrals: number;
}

interface DriftAlert {
  name: string;
  lastReferralMonth: string;
  daysSinceLastReferral: number;
  priorReferrals: number;
  annualValueAtRisk: number;
}

interface RecommendedAction {
  gpName: string;
  referralsLastQuarter: number;
  daysSilent: number;
  estimatedAnnualValue: number;
  message: string;
}

interface IntelligenceData {
  success: boolean;
  hasData: boolean;
  topReferrers: Referrer[];
  driftAlerts: DriftAlert[];
  recommendedAction: RecommendedAction | null;
}

// ─── Trend Icon ─────────────────────────────────────────────────────

function TrendIcon({ trend }: { trend: "up" | "flat" | "down" }) {
  if (trend === "up") return <TrendingUp className="h-4 w-4 text-emerald-500" />;
  if (trend === "down") return <TrendingDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-gray-400" />;
}

// ─── Top Referrers ──────────────────────────────────────────────────

function TopReferrers({ referrers }: { referrers: Referrer[] }) {
  if (referrers.length === 0) return null;

  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">
        Top Referrers
      </h2>
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-3 font-medium text-gray-500 w-8">#</th>
              <th className="px-4 py-3 font-medium text-gray-500">Referring Doctor</th>
              <th className="px-4 py-3 font-medium text-gray-500 text-right">Referrals</th>
              <th className="px-4 py-3 font-medium text-gray-500 text-right">Est. Revenue</th>
              <th className="px-4 py-3 font-medium text-gray-500 text-center w-16">Trend</th>
            </tr>
          </thead>
          <tbody>
            {referrers.map((r, i) => (
              <tr key={r.name} className="border-t border-gray-100">
                <td className="px-4 py-3 text-gray-400 font-medium">{i + 1}</td>
                <td className="px-4 py-3 font-semibold text-[#212D40]">{r.name}</td>
                <td className="px-4 py-3 text-right text-[#212D40]">{r.referrals}</td>
                <td className="px-4 py-3 text-right font-semibold text-[#212D40]">
                  {r.revenue != null && !isNaN(r.revenue) ? `$${r.revenue.toLocaleString()}` : "$--"}
                </td>
                <td className="px-4 py-3 text-center">
                  <TrendIcon trend={r.trend} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Drift Alerts ───────────────────────────────────────────────────

function DriftAlerts({ alerts }: { alerts: DriftAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-wider text-[#D56753] mb-4 flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5" />
        Drift Alerts
      </h2>
      <div className="space-y-3">
        {alerts.map((a) => (
          <div
            key={a.name}
            className="rounded-2xl p-5"
            style={{ backgroundColor: "rgba(213, 103, 83, 0.06)" }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-base font-bold text-[#212D40]">{a.name}</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  Last referral: {a.lastReferralMonth} &middot;{" "}
                  <span className="font-semibold text-[#D56753]">
                    {a.daysSinceLastReferral} days silent
                  </span>
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {a.priorReferrals} referral{a.priorReferrals !== 1 ? "s" : ""} previously
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-medium text-[#D56753] uppercase tracking-wide">
                  Annual Revenue at Risk
                </p>
                <p className="text-xl font-bold text-[#D56753]">
                  {a.annualValueAtRisk != null && !isNaN(a.annualValueAtRisk) ? `$${a.annualValueAtRisk.toLocaleString()}` : "$--"}
                </p>
                <p className="text-[10px] text-gray-400">estimated per year</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── This Week's Move ───────────────────────────────────────────────

function ThisWeeksMove({ action }: { action: RecommendedAction | null }) {
  const [logged, setLogged] = useState(false);

  if (!action) return null;

  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">
        This Week's Move
      </h2>
      <div className="rounded-2xl border-2 border-[#D56753]/20 bg-white p-6 shadow-sm">
        <p className="text-base leading-relaxed text-[#212D40]">
          {action.message}
        </p>
        <div className="mt-5">
          {logged ? (
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              Outreach logged
            </div>
          ) : (
            <button
              onClick={() => setLogged(true)}
              className="flex items-center gap-2 rounded-xl bg-[#D56753] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-105 active:scale-[0.98]"
            >
              <Phone className="h-4 w-4" />
              Log outreach
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Empty State ────────────────────────────────────────────────────

function EmptyState() {
  const isTouchDevice = typeof window !== "undefined" && "ontouchstart" in window;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-8">
      <h3 className="text-lg font-bold text-[#212D40] text-center mb-2">
        See which GPs are sending you patients
      </h3>
      <p className="text-sm text-gray-500 text-center mb-6">
        Upload your scheduling data. One file is all it takes.
      </p>

      {/* Three equal upload options */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Option 1: Drag and drop / file input */}
        <label className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 cursor-pointer hover:border-[#D56753]/40 hover:bg-[#D56753]/[0.02] transition-all">
          <Upload className="h-6 w-6 text-[#D56753]" />
          <span className="text-sm font-semibold text-[#212D40]">Drag and drop any file</span>
          <input type="file" accept=".csv,.xlsx,.xls,.txt,.pdf,.jpg,.jpeg,.png" className="hidden" />
        </label>

        {/* Option 2: Take a photo (mobile) / Upload image (desktop) */}
        <label className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 cursor-pointer hover:border-[#D56753]/40 hover:bg-[#D56753]/[0.02] transition-all">
          <Camera className="h-6 w-6 text-[#D56753]" />
          <span className="text-sm font-semibold text-[#212D40]">
            {isTouchDevice ? "Take a photo" : "Upload an image"}
          </span>
          <input
            type="file"
            accept="image/*"
            capture={isTouchDevice ? "environment" : undefined}
            className="hidden"
          />
        </label>

        {/* Option 3: Paste text */}
        <a
          href="/pmsStatistics"
          className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 hover:border-[#D56753]/40 hover:bg-[#D56753]/[0.02] transition-all"
        >
          <FileText className="h-6 w-6 text-[#D56753]" />
          <span className="text-sm font-semibold text-[#212D40]">Paste text</span>
        </a>
      </div>

      <p className="text-xs text-gray-400 text-center mt-4">
        Works with Dentrix, Eaglesoft, OpenDental, and any spreadsheet format.
      </p>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export default function ReferralIntelligence() {
  const { selectedLocation } = useLocationContext();
  const locationId = selectedLocation?.id ?? null;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["referral-intelligence", locationId],
    queryFn: async (): Promise<IntelligenceData> => {
      const params = locationId ? `?location_id=${locationId}` : "";
      return apiGet({ path: `/referral-intelligence${params}` });
    },
    staleTime: 10 * 60_000,
  });

  const hasData = data?.hasData ?? false;

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#212D40]">
          Referral Intelligence
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Who sends you patients, who stopped, and what to do about it.
        </p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-gray-200 bg-white" />
          ))}
        </div>
      )}

      {/* Error state */}
      {!isLoading && isError && (
        <div className="rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-400">
          <p className="text-base font-medium">Referral data temporarily unavailable</p>
          <p className="text-sm mt-1">Please try again in a few minutes.</p>
        </div>
      )}

      {/* No data */}
      {!isLoading && !isError && !hasData && <EmptyState />}

      {/* Data present */}
      {!isLoading && hasData && data && (
        <>
          {/* This Week's Move — at the top for impact */}
          <ThisWeeksMove action={data.recommendedAction} />

          {/* Drift Alerts */}
          <DriftAlerts alerts={data.driftAlerts} />

          {/* Thank-You Drafts (WO-47) */}
          <ThankYouDrafts referrers={data.topReferrers} />

          {/* Top Referrers */}
          <TopReferrers referrers={data.topReferrers} />
        </>
      )}
    </div>
  );
}

// ─── Thank-You Drafts (WO-47) ───────────────────────────────────────

function ThankYouDrafts({ referrers }: { referrers: Referrer[] }) {
  // Show drafts for top 3 referrers who recently sent cases
  const eligible = referrers
    .filter((r) => r.recentReferrals > 0)
    .slice(0, 3);

  if (eligible.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
        Thank Your Top Sources
      </p>
      {eligible.map((gp) => (
        <ThankYouCard key={gp.name} gp={gp} />
      ))}
    </div>
  );
}

function ThankYouCard({ gp }: { gp: Referrer }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedDraft, setEditedDraft] = useState("");
  const [sent, setSent] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);

  if (skipped || sent) return null;

  async function generateDraft() {
    setIsGenerating(true);
    try {
      const res = await apiPost({
        path: "/referral-intelligence/thank-you-draft",
        passedData: { gpName: gp.name },
      });
      if (res.success && res.draft) {
        setDraft(res.draft);
        setEditedDraft(res.draft);
      }
    } catch {
      // Fail silently
    } finally {
      setIsGenerating(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(editedDraft || draft || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleSendEmail() {
    if (!email) {
      setShowEmailInput(true);
      return;
    }
    // In production, this would call an email API
    setSent(true);
  }

  if (!draft) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[#212D40]">Dr. {gp.name}</p>
          <p className="text-xs text-gray-500">
            {gp.recentReferrals} recent referral{gp.recentReferrals !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={generateDraft}
          disabled={isGenerating}
          className="px-3 py-1.5 text-xs font-semibold text-[#D56753] border border-[#D56753]/30 rounded-lg hover:bg-[#D56753]/5 disabled:opacity-40 transition-colors"
        >
          {isGenerating ? "Drafting..." : "Draft thank-you"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#D56753]/20 bg-[#D56753]/[0.02] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          Draft: Thank-you to Dr. {gp.name}
        </p>
      </div>

      {isEditing ? (
        <textarea
          value={editedDraft}
          onChange={(e) => setEditedDraft(e.target.value)}
          rows={4}
          className="w-full text-sm text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-[#D56753]/30"
        />
      ) : (
        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
          {editedDraft || draft}
        </p>
      )}

      {showEmailInput && (
        <div className="flex items-center gap-2">
          <input
            type="email"
            placeholder="Dr.'s email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#D56753]/30"
          />
          <button
            onClick={handleSendEmail}
            disabled={!email}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-[#D56753] rounded-lg disabled:opacity-40"
          >
            Send
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleSendEmail}
          className="px-3 py-1.5 text-xs font-semibold text-white bg-[#D56753] rounded-lg hover:bg-[#C25544] transition-colors"
        >
          Send via email
        </button>
        <button
          onClick={handleCopy}
          className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          {copied ? "Copied!" : "Copy text"}
        </button>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          {isEditing ? "Done editing" : "Edit"}
        </button>
        <button
          onClick={() => setSkipped(true)}
          className="px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
