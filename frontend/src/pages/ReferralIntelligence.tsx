/**
 * GP Referral Intelligence -- /dashboard/referrals
 *
 * The feature that makes Alloro worth $2,000/month to a specialist.
 * Three sections: Top Referrers, Drift Alerts, This Week's Move.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ThankYouDrafts from "../components/dashboard/ThankYouDrafts";
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
  Search,
  MapPin,
  Mail,
  Copy,
  Loader2,
  X,
} from "lucide-react";
import { apiGet, apiPost } from "@/api/index";
import { useLocationContext } from "@/contexts/locationContext";
import { useAuth } from "@/hooks/useAuth";
import { PMSUploadWizardModal } from "@/components/PMS/PMSUploadWizardModal";

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

interface DiscoveredGP {
  name: string;
  address: string;
  distance: number;
  specialty: string;
  placeId: string;
  phone: string | null;
}

interface DiscoveryResponse {
  success: boolean;
  gps: DiscoveredGP[];
  gated: boolean;
  gate_message?: string;
  existing_count?: number;
  radius?: number;
  message?: string;
}

interface OutreachResult {
  success: boolean;
  letter?: {
    success: boolean;
    subject: string;
    body: string;
    confidence: number;
    dataQuality: number;
    warnings?: string[];
  };
  error?: string;
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
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">
        Top Referrers
      </h2>
      <div className="rounded-2xl border border-stone-200/60 bg-stone-50/80 overflow-hidden">
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
                <td className="px-4 py-3 font-semibold text-[#1A1D23]">{r.name}</td>
                <td className="px-4 py-3 text-right text-[#1A1D23]">{r.referrals}</td>
                <td className="px-4 py-3 text-right font-semibold text-[#1A1D23]">
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
      <h2 className="text-xs font-semibold uppercase tracking-wider text-[#D56753] mb-4 flex items-center gap-1.5">
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
                <p className="text-base font-semibold text-[#1A1D23]">{a.name}</p>
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
                  Referral Status
                </p>
                <p className="text-lg font-semibold text-[#D56753]">
                  {a.daysSinceLastReferral > 90 ? "Gone quiet" : "Slowing"}
                </p>
                <p className="text-xs text-gray-400">{a.priorReferrals} prior referral{a.priorReferrals !== 1 ? "s" : ""}</p>
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
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">
        This Week's Move
      </h2>
      <div className="rounded-2xl border-2 border-[#D56753]/20 bg-white p-6 shadow-sm">
        <p className="text-base leading-relaxed text-[#1A1D23]">
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

function EmptyState({ onUpload }: { onUpload: () => void }) {
  const isTouchDevice = typeof window !== "undefined" && "ontouchstart" in window;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-8">
      <h3 className="text-lg font-semibold text-[#1A1D23] text-center mb-2">
        See who sends you business
      </h3>
      <p className="text-sm text-gray-500 text-center mb-6">
        Drop anything that shows who your customers come from.
        A spreadsheet, a screenshot, a photo of a report. Alloro reads it.
      </p>

      {/* Three universal import options */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={onUpload}
          className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 cursor-pointer hover:border-[#D56753]/40 hover:bg-[#D56753]/[0.02] transition-all"
        >
          <Upload className="h-6 w-6 text-[#D56753]" />
          <span className="text-sm font-semibold text-[#1A1D23]">Drop a file</span>
          <span className="text-xs text-gray-400">CSV, Excel, PDF, any format</span>
        </button>

        <button
          type="button"
          onClick={onUpload}
          className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 cursor-pointer hover:border-[#D56753]/40 hover:bg-[#D56753]/[0.02] transition-all"
        >
          <Camera className="h-6 w-6 text-[#D56753]" />
          <span className="text-sm font-semibold text-[#1A1D23]">
            {isTouchDevice ? "Take a photo" : "Upload a screenshot"}
          </span>
          <span className="text-xs text-gray-400">Of a report, spreadsheet, or screen</span>
        </button>

        <button
          type="button"
          onClick={onUpload}
          className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 cursor-pointer hover:border-[#D56753]/40 hover:bg-[#D56753]/[0.02] transition-all"
        >
          <FileText className="h-6 w-6 text-[#D56753]" />
          <span className="text-sm font-semibold text-[#1A1D23]">Paste anything</span>
          <span className="text-xs text-gray-400">Names, numbers, notes from any source</span>
        </button>
      </div>

      <p className="text-xs text-gray-400 text-center mt-4">
        Alloro figures out what the data means. You don't need specific columns or formats.
        If it shows who sends you business, that's enough.
      </p>
    </div>
  );
}

// ─── GP Discovery ──────────────────────────────────────────────────

const RADIUS_OPTIONS = [
  { value: 1, label: "1 mi" },
  { value: 3, label: "3 mi" },
  { value: 5, label: "5 mi" },
  { value: 10, label: "10 mi" },
];

function GPDiscoverySection() {
  const [radius, setRadius] = useState(5);
  const [selectedGP, setSelectedGP] = useState<DiscoveredGP | null>(null);
  const [copiedField, setCopiedField] = useState<"subject" | "body" | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["gp-discovery", radius],
    queryFn: async (): Promise<DiscoveryResponse> => {
      return apiGet({ path: `/user/referrals/discover?radius=${radius}` });
    },
    staleTime: 5 * 60_000,
  });

  const outreachMutation = useMutation({
    mutationFn: async (gp: DiscoveredGP): Promise<OutreachResult> => {
      return apiPost({
        path: "/user/referrals/discover/outreach",
        passedData: {
          gpName: gp.name,
          gpAddress: gp.address,
          distance: gp.distance,
        },
      });
    },
  });

  const handleDraftIntroduction = (gp: DiscoveredGP) => {
    setSelectedGP(gp);
    outreachMutation.mutate(gp);
  };

  const handleCopy = (text: string, field: "subject" | "body") => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    });
  };

  const handleClosePreview = () => {
    setSelectedGP(null);
    outreachMutation.reset();
    setCopiedField(null);
  };

  // Gated: no PMS data
  if (data?.gated) return null;

  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-1.5">
        <Search className="h-3.5 w-3.5" />
        Discover New Referral Sources
      </h2>

      {/* Radius selector */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-gray-500">Search radius:</span>
        <div className="flex gap-1">
          {RADIUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRadius(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                radius === opt.value
                  ? "bg-[#212D40] text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      )}

      {/* Message (e.g. no API key) */}
      {!isLoading && data?.message && data.gps.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center">
          <MapPin className="h-6 w-6 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">{data.message}</p>
        </div>
      )}

      {/* GP results */}
      {!isLoading && data && data.gps.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">
            {data.gps.length} referral source{data.gps.length !== 1 ? "s" : ""} found within {data.radius || radius} miles not in your referral history
          </p>

          <div className="rounded-2xl border border-stone-200/60 bg-stone-50/80 overflow-hidden">
            {data.gps.map((gp, i) => (
              <div
                key={gp.placeId}
                className={`flex items-center justify-between px-4 py-3.5 ${
                  i > 0 ? "border-t border-gray-100" : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#1A1D23] truncate">{gp.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400">{gp.specialty}</span>
                    <span className="text-xs text-gray-300">|</span>
                    <span className="text-xs text-gray-400 flex items-center gap-0.5">
                      <MapPin className="h-3 w-3" />
                      {gp.distance} mi
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDraftIntroduction(gp)}
                  disabled={outreachMutation.isPending && selectedGP?.placeId === gp.placeId}
                  className="shrink-0 ml-3 flex items-center gap-1.5 rounded-xl bg-[#D56753] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60"
                >
                  {outreachMutation.isPending && selectedGP?.placeId === gp.placeId ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Mail className="h-3.5 w-3.5" />
                  )}
                  Draft Introduction
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No results found */}
      {!isLoading && data && !data.message && data.gps.length === 0 && !data.gated && (
        <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center">
          <MapPin className="h-6 w-6 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            No new referral sources found within {radius} miles. Try a larger radius.
          </p>
        </div>
      )}

      {/* Letter preview modal */}
      {selectedGP && outreachMutation.data?.success && outreachMutation.data.letter?.success && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <p className="text-sm font-semibold text-[#1A1D23]">Introduction to {selectedGP.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {outreachMutation.data.letter.confidence}% confidence
                </p>
              </div>
              <button
                onClick={handleClosePreview}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>

            {/* Subject */}
            <div className="px-5 py-3 border-b border-gray-50">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Subject</p>
                <button
                  onClick={() => handleCopy(outreachMutation.data!.letter!.subject, "subject")}
                  className="flex items-center gap-1 text-xs font-semibold text-[#D56753] hover:underline"
                >
                  <Copy className="h-3 w-3" />
                  {copiedField === "subject" ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="text-sm font-semibold text-[#1A1D23] mt-1">
                {outreachMutation.data.letter.subject}
              </p>
            </div>

            {/* Body */}
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Body</p>
                <button
                  onClick={() => handleCopy(outreachMutation.data!.letter!.body, "body")}
                  className="flex items-center gap-1 text-xs font-semibold text-[#D56753] hover:underline"
                >
                  <Copy className="h-3 w-3" />
                  {copiedField === "body" ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-[#1A1D23] leading-relaxed whitespace-pre-wrap">
                {outreachMutation.data.letter.body}
              </div>
            </div>

            {/* Warnings */}
            {outreachMutation.data.letter.warnings && outreachMutation.data.letter.warnings.length > 0 && (
              <div className="px-5 pb-3">
                {outreachMutation.data.letter.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-500">{w}</p>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-100">
              <button
                onClick={() => {
                  const letter = outreachMutation.data!.letter!;
                  handleCopy(`Subject: ${letter.subject}\n\n${letter.body}`, "body");
                }}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#D56753] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-105 active:scale-[0.98]"
              >
                <Copy className="h-4 w-4" />
                Copy Full Letter
              </button>
              <button
                onClick={handleClosePreview}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Outreach error */}
      {selectedGP && outreachMutation.isError && (
        <div className="mt-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-xs text-red-600">Failed to generate introduction letter. Please try again.</p>
          <button
            onClick={handleClosePreview}
            className="text-xs text-red-500 font-semibold mt-1 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export default function ReferralIntelligence() {
  const { selectedLocation } = useLocationContext();
  const { selectedDomain, userProfile } = useAuth();
  const queryClient = useQueryClient();
  const locationId = selectedLocation?.id ?? null;
  const clientId = selectedDomain?.domain || userProfile?.domainName || "";

  const [showUploadWizard, setShowUploadWizard] = useState(false);

  // Intelligence mode drives which sections render
  const { data: dashCtx } = useQuery({
    queryKey: ["dashboard-context"],
    queryFn: async () => {
      const res = await apiGet({ path: "/user/dashboard-context" });
      return res?.success ? res : null;
    },
    staleTime: 30 * 60_000,
  });
  const intelligenceMode = dashCtx?.intelligence_mode || "referral_based";
  const isReferralMode = intelligenceMode === "referral_based";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["referral-intelligence", locationId],
    queryFn: async (): Promise<IntelligenceData> => {
      const params = locationId ? `?location_id=${locationId}` : "";
      return apiGet({ path: `/referral-intelligence${params}` });
    },
    staleTime: 10 * 60_000,
  });

  const hasData = data?.hasData ?? false;

  // Page title and subtitle adapt to intelligence mode
  const pageTitle = isReferralMode ? "Referral Intelligence" : "Revenue Sources";
  const pageSubtitle = isReferralMode
    ? "Who sends you clients, who stopped, and what to do about it."
    : "Where your customers come from and how those channels are trending.";

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8 min-h-screen bg-[#F8F6F2]">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-[#1A1D23]">
          {pageTitle}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {pageSubtitle}
        </p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-stone-200/60 bg-stone-50/80" />
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
      {!isLoading && !isError && !hasData && (
        <EmptyState onUpload={() => setShowUploadWizard(true)} />
      )}

      {/* Data present */}
      {!isLoading && hasData && data && (
        <>
          {/* This Week's Move -- always visible */}
          <ThisWeeksMove action={data.recommendedAction} />

          {/* Thank-You Drafts -- referral_based only (GP-specific) */}
          {isReferralMode && <ThankYouDrafts />}

          {/* Drift Alerts -- always visible (relevant to all revenue sources) */}
          <DriftAlerts alerts={data.driftAlerts} />

          {/* Top Referrers -- always visible (relabeled by backend per mode) */}
          <TopReferrers referrers={data.topReferrers} />

          {/* GP Discovery -- referral_based only (finding referring providers) */}
          {isReferralMode && <GPDiscoverySection />}
        </>
      )}

      {/* PMS Upload Wizard Modal */}
      <PMSUploadWizardModal
        isOpen={showUploadWizard}
        onClose={() => setShowUploadWizard(false)}
        clientId={clientId}
        locationId={locationId}
        onSuccess={() => {
          setShowUploadWizard(false);
          queryClient.invalidateQueries({ queryKey: ["referral-intelligence"] });
        }}
      />
    </div>
  );
}

