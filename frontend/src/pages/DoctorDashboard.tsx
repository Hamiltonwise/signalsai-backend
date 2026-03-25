/**
 * Doctor Dashboard — Client-Facing Intelligence Layer
 *
 * UX Rules enforced:
 * - Every card has ONE job.
 * - Every number has a label.
 * - Every action has a specific outcome.
 * - Empty states are never dead ends.
 * - Mobile first.
 *
 * A front desk employee should know what to do in under 10 seconds.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Copy,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Globe,
  Share2,
  Flame,
  Shield,
  Star,
  MapPin,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLocationContext } from "@/contexts/locationContext";
import { apiGet } from "@/api/index";
import agents from "@/api/agents";
import ReviewRequestCard from "@/components/dashboard/ReviewRequestCard";
import OneActionCard from "@/components/dashboard/OneActionCard";
import CSAgentChat from "@/components/dashboard/CSAgentChat";
import TTFVSensor from "@/components/dashboard/TTFVSensor";
import BillingPromptBar from "@/components/dashboard/BillingPromptBar";
import PatientPathBreadcrumb from "@/components/dashboard/PatientPathBreadcrumb";
import CompetitorDrawer from "@/components/dashboard/CompetitorDrawer";
import GBPConnectCard from "@/components/dashboard/GBPConnectCard";
import OnboardingChecklist from "@/components/dashboard/OnboardingChecklist";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";
import { getPriorityItem } from "@/hooks/useLocalStorage";

// ─── Types ──────────────────────────────────────────────────────────

interface RankingData {
  rankPosition: number | null;
  totalCompetitors: number | null;
  rankScore: number | null;
  specialty: string | null;
  location: string | null;
  placeId?: string | null;
  topCompetitor?: {
    name: string;
    reviewCount: number;
    rating: number;
  } | null;
  clientReviews?: number | null;
  previousPosition?: number | null;
}

interface ProoflineFinding {
  type: string;
  title: string;
  detail: string;
}

interface WebsiteInfo {
  generated_hostname: string;
  status: string;
  last_updated?: string;
}

// ─── Greeting ───────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// ─── Score Helpers ──────────────────────────────────────────────────

function scoreColor(score: number | null): string {
  if (!score) return "text-gray-400";
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-[#D56753]";
}

function scoreBg(score: number | null): string {
  if (!score) return "bg-gray-100";
  if (score >= 80) return "bg-emerald-50";
  if (score >= 60) return "bg-amber-50";
  return "bg-[#D56753]/5";
}

// ═══════════════════════════════════════════════════════════════════
// POSITION CARD — One job: show where you rank
// ═══════════════════════════════════════════════════════════════════

function PositionCard({ ranking }: { ranking: RankingData | null }) {
  if (!ranking || !ranking.rankPosition) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-gray-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-[#212D40]">Market Position</p>
            <p className="text-xs text-gray-400">Not available yet</p>
          </div>
        </div>
        <p className="text-sm text-gray-500">
          Your first market scan is scheduled. Check back tomorrow to see where you rank.
        </p>
      </div>
    );
  }

  const delta =
    ranking.previousPosition && ranking.rankPosition
      ? ranking.previousPosition - ranking.rankPosition
      : null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex items-start justify-between mb-1">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
          Market Position
        </p>
        {delta !== null && delta !== 0 && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
              delta > 0
                ? "bg-emerald-50 text-emerald-700"
                : delta <= -2
                  ? "bg-amber-50 text-amber-700"
                  : "bg-gray-100 text-gray-600"
            }`}
          >
            {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {delta > 0 ? "+" : ""}{delta} position{Math.abs(delta) !== 1 ? "s" : ""} since last scan
          </span>
        )}
      </div>

      <div className="mt-2">
        <span className="text-5xl font-black text-[#212D40]">
          #{ranking.rankPosition}
        </span>
        <span className="text-lg text-gray-400 ml-2">
          of {ranking.totalCompetitors}
        </span>
      </div>

      <p className="text-sm text-gray-500 mt-2">
        {ranking.totalCompetitors} {ranking.specialty || "competitor"}s in {ranking.location || "your market"}
      </p>

      {ranking.rankScore != null && (
        <div className="mt-4">
          <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${scoreBg(ranking.rankScore)} ${scoreColor(ranking.rankScore)}`}>
            Score: {ranking.rankScore}/100
          </span>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// COMPETITOR GAP — One job: name who's beating you and by how much
// ═══════════════════════════════════════════════════════════════════

function CompetitorGap({ ranking, onCompetitorClick }: { ranking: RankingData | null; onCompetitorClick?: (comp: { name: string; rating: number; reviewCount: number }) => void }) {
  if (!ranking?.topCompetitor) return null;

  const comp = ranking.topCompetitor;
  const reviewGap =
    comp.reviewCount && ranking.clientReviews
      ? comp.reviewCount - ranking.clientReviews
      : null;

  return (
    <button
      type="button"
      onClick={() => onCompetitorClick?.({ name: comp.name, rating: comp.rating, reviewCount: comp.reviewCount })}
      className="w-full text-left rounded-2xl px-5 py-4 hover:shadow-md transition-shadow"
      style={{ backgroundColor: "rgba(213, 103, 83, 0.05)" }}
    >
      <p className="text-xs font-bold uppercase tracking-wider text-[#D56753] mb-2">
        Your Top Competitor
      </p>
      <p className="text-base font-semibold text-[#212D40] leading-relaxed">
        <span className="font-bold">{comp.name}</span>{" "}
        {ranking.rankPosition === 1 ? "is closest to your position" : "holds position #1"}
        {comp.rating ? ` with a ${comp.rating}-star rating` : ""}
        {reviewGap != null && reviewGap > 0 ? ` and ${reviewGap} more review${reviewGap !== 1 ? "s" : ""} than you` : ""}.
      </p>
      {reviewGap != null && reviewGap > 0 && reviewGap <= 10 && (
        <p className="text-xs text-[#D56753] font-medium mt-2">
          {reviewGap} review{reviewGap !== 1 ? "s" : ""} to close the gap. That's {Math.ceil(reviewGap / 3)} weeks at 3 per week.
        </p>
      )}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PROOFLINE FINDINGS — One job: show what the agents discovered
// ═══════════════════════════════════════════════════════════════════

function ProoflineFindings({ findings }: { findings: ProoflineFinding[] }) {
  if (findings.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
            <Star className="w-5 h-5 text-gray-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-[#212D40]">Agent Findings</p>
            <p className="text-xs text-gray-400">Scanning your market</p>
          </div>
        </div>
        <p className="text-sm text-gray-500">
          Alloro agents are analyzing your competitors. First findings appear after the next scheduled run.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">
        This Week's Findings
      </p>
      <div className="space-y-3">
        {findings.slice(0, 3).map((f, i) => (
          <div key={i} className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-lg bg-[#D56753]/10 text-[#D56753] flex items-center justify-center text-xs font-bold mt-0.5">
              {i + 1}
            </span>
            <p className="text-sm text-gray-700 leading-relaxed">{f.detail || f.title}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// WEBSITE CARD — One job: link to your live site
// ═══════════════════════════════════════════════════════════════════

function WebsiteCard({ website }: { website: WebsiteInfo | null }) {
  if (!website) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
            <Globe className="w-5 h-5 text-gray-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-[#212D40]">Your Website</p>
            <p className="text-xs text-gray-400">In progress</p>
          </div>
        </div>
        <p className="text-sm text-gray-500">
          Your PatientPath website is being built. You'll get a notification when it's live.
        </p>
      </div>
    );
  }

  const siteUrl = `https://${website.generated_hostname}.sites.getalloro.com`;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <Globe className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-[#212D40]">Your Website</p>
            <p className="text-xs text-gray-500">{website.generated_hostname}</p>
          </div>
        </div>
        <a
          href={siteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-lg bg-[#212D40] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#212D40]/90 transition-colors"
        >
          View site
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// REFERRAL CARD — One job: let you share your referral link
// ═══════════════════════════════════════════════════════════════════

function ReferralCard({ referralCode }: { referralCode: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!referralCode) return null;

  const link = `${window.location.origin}/checkup?ref=${referralCode}`;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-[#212D40]/5 flex items-center justify-center">
          <Share2 className="w-5 h-5 text-[#212D40]" />
        </div>
        <div>
          <p className="text-sm font-bold text-[#212D40]">Refer a Colleague</p>
          <p className="text-xs text-gray-500">You both get one month free</p>
        </div>
      </div>
      <div className="flex gap-2">
        <input
          readOnly
          value={link}
          className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-500 truncate"
        />
        <button
          onClick={() => {
            navigator.clipboard.writeText(link).then(() => {
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
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// GROWTH MODE CARDS
// ═══════════════════════════════════════════════════════════════════

function GapToNext({ ranking }: { ranking: RankingData | null }) {
  if (!ranking?.rankPosition || ranking.rankPosition <= 1) {
    return (
      <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-6">
        <p className="text-lg font-bold text-emerald-800">You're #1</p>
        <p className="text-sm text-emerald-600 mt-1">Every review keeps you there. Don't stop.</p>
      </div>
    );
  }

  const comp = ranking.topCompetitor;
  const reviewGap = comp?.reviewCount && ranking.clientReviews
    ? comp.reviewCount - ranking.clientReviews
    : null;

  return (
    <div className="rounded-2xl border-2 border-[#D56753]/20 bg-white p-6">
      <p className="text-xs font-bold uppercase tracking-wider text-[#D56753] mb-3">
        What It Takes to Reach Position #{ranking.rankPosition - 1}
      </p>
      {comp && (
        <p className="text-base font-semibold text-[#212D40] mb-4">
          {comp.name} is one spot ahead.
        </p>
      )}
      {reviewGap != null && reviewGap > 0 && (
        <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-[#212D40]">Reviews needed</p>
            <p className="text-xs text-gray-500">They have {comp?.reviewCount}. You have {ranking.clientReviews}.</p>
          </div>
          <span className="text-lg font-black text-[#D56753]">{reviewGap}</span>
        </div>
      )}
    </div>
  );
}

function CompetitorActivityFeed({ ranking }: { ranking: RankingData | null }) {
  if (!ranking?.topCompetitor) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
            <Users className="w-5 h-5 text-gray-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-[#212D40]">Competitor Activity</p>
            <p className="text-xs text-gray-400">Market data appears after your first scan.</p>
          </div>
        </div>
      </div>
    );
  }

  const comp = ranking.topCompetitor;
  const activities: { text: string; dot: string }[] = [];
  if (comp.reviewCount > 0) activities.push({ text: `${comp.name} has ${comp.reviewCount} reviews at ${comp.rating} stars`, dot: "bg-amber-400" });
  if (ranking.totalCompetitors && ranking.totalCompetitors > 5) activities.push({ text: `${ranking.totalCompetitors} practices compete in ${ranking.location || "your market"}`, dot: "bg-blue-400" });
  if (ranking.rankPosition && ranking.rankPosition > 3) activities.push({ text: "Top 3 positions get 70% of new patient search clicks", dot: "bg-gray-300" });

  if (activities.length === 0) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">Competitor Activity</p>
      <div className="space-y-3">
        {activities.map((a, i) => (
          <div key={i} className="flex items-start gap-3 text-sm">
            <span className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${a.dot}`} />
            <p className="text-gray-600">{a.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function GrowthPositionTrack({ ranking }: { ranking: RankingData | null }) {
  if (!ranking?.rankPosition || !ranking.totalCompetitors) return null;

  const maxPos = Math.min(ranking.totalCompetitors, 10);
  const positions = Array.from({ length: maxPos }, (_, i) => i + 1);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">Your Position</p>
      <div className="flex items-center gap-1">
        {positions.map((pos) => (
          <div key={pos} className="flex-1 flex flex-col items-center gap-1.5">
            <div className={`w-full h-2.5 rounded-full ${pos === ranking.rankPosition ? "bg-[#D56753]" : pos < ranking.rankPosition! ? "bg-[#212D40]/15" : "bg-gray-100"}`} />
            <span className={`text-[10px] font-bold ${pos === ranking.rankPosition ? "text-[#D56753]" : "text-gray-300"}`}>{pos}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
        <span>#1 — Top of market</span>
        <span>#{maxPos}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MODE TOGGLE
// ═══════════════════════════════════════════════════════════════════

function ModeToggle({ mode, onChange }: { mode: "standard" | "growth"; onChange: (m: "standard" | "growth") => void }) {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1 shrink-0">
      <button
        onClick={() => onChange("standard")}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${mode === "standard" ? "bg-white text-[#212D40] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
      >
        <Shield className="h-3.5 w-3.5" />
        Overview
      </button>
      <button
        onClick={() => onChange("growth")}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${mode === "growth" ? "bg-[#D56753] text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
      >
        <Flame className="h-3.5 w-3.5" />
        Growth
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function DoctorDashboard() {
  const { userProfile, billingStatus, hasGoogleConnection } = useAuth();
  const { selectedLocation } = useLocationContext();

  const orgId = userProfile?.organizationId || null;
  const locationId = selectedLocation?.id ?? null;
  const firstName = userProfile?.firstName || "Doctor";
  const practiceName = selectedLocation?.name || userProfile?.practiceName || "Your Practice";
  const locationName = selectedLocation?.name || null;

  const userRole = getPriorityItem("user_role") as string | null;
  const isOwnerOrManager = userRole === "admin" || userRole === "manager";
  const canSendReviews = userRole !== "viewer";

  const { data: rankingData } = useQuery({
    queryKey: ["client-ranking", orgId, locationId],
    queryFn: async (): Promise<RankingData | null> => {
      if (!orgId) return null;
      const token = localStorage.getItem("auth_token");
      const res = await fetch(
        `/api/practice-ranking/latest?googleAccountId=${orgId}${locationId ? `&locationId=${locationId}` : ""}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) return null;
      const json = await res.json();
      if (!json.success || !json.rankings?.length) return null;
      const latest = json.rankings[0];
      return {
        rankPosition: latest.rank_position ?? latest.rankPosition ?? null,
        totalCompetitors: latest.total_competitors ?? latest.totalCompetitors ?? null,
        rankScore: latest.rank_score ?? latest.rankScore ?? null,
        specialty: latest.specialty || null,
        location: latest.location || null,
        placeId: latest.raw_data?.client_gbp?.placeId ?? latest.gbp_location_id ?? null,
        topCompetitor: null,
        clientReviews: null,
        previousPosition: null,
      };
    },
    enabled: !!orgId,
    staleTime: 10 * 60_000,
  });

  const { data: agentData } = useQuery({
    queryKey: ["client-agent-data", orgId, locationId],
    queryFn: () => agents.getLatestAgentData(orgId!, locationId),
    enabled: !!orgId,
    staleTime: 10 * 60_000,
  });

  const prooflineFindings: ProoflineFinding[] = (() => {
    if (!agentData?.success) return [];
    // Backend returns { success, agents: { proofline: { results: ... } } }
    const prooflineData = agentData.agents?.proofline;
    if (!prooflineData?.results) return [];
    const output = typeof prooflineData.results === "string" ? tryParse(prooflineData.results) : prooflineData.results;
    if (typeof output === "object" && output !== null) {
      const f = (output as any).findings || (output as any).items || [];
      if (Array.isArray(f)) return f.slice(0, 3);
    }
    return [];
  })();

  const { data: websiteData } = useQuery({
    queryKey: ["client-website", orgId],
    queryFn: async (): Promise<WebsiteInfo | null> => {
      const res = await apiGet({ path: "/user/website" });
      if (!res?.success || !res?.website) return null;
      return res.website;
    },
    enabled: !!orgId,
    staleTime: 10 * 60_000,
  });

  const { data: profileData } = useQuery({
    queryKey: ["client-profile"],
    queryFn: async () => apiGet({ path: "/profile/get" }),
    staleTime: 10 * 60_000,
  });

  const referralCode = profileData?.referral_code || profileData?.organization?.referral_code || null;
  const [mode, setMode] = useState<"standard" | "growth">("standard");
  const [drawerCompetitor, setDrawerCompetitor] = useState<{ name: string; rating: number; reviewCount: number } | null>(null);
  const isLoading = !rankingData && !agentData && !websiteData && !profileData;

  return (
    <>
    {/* Billing prompt bar — top of dashboard, quiet, dismissable */}
    <BillingPromptBar
      orgId={orgId}
      score={rankingData?.rankScore ?? null}
      finding={prooflineFindings[0]?.detail || null}
    />

    <div className="mx-auto max-w-2xl space-y-5 px-4 py-6 sm:py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-[#212D40] truncate">
            {mode === "growth" ? `Close the gap, ${firstName}.` : `${getGreeting()}, ${firstName}.`}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {mode === "growth"
              ? `What stands between ${practiceName} and the next position.`
              : `What Alloro found this week for ${practiceName}.`}
          </p>
          {locationName && (
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {locationName}
            </p>
          )}
        </div>
        <ModeToggle mode={mode} onChange={setMode} />
      </div>

      {/* Onboarding Checklist — shows until first value delivered */}
      {!isLoading && (
        <OnboardingChecklist
          checkupScore={rankingData?.rankScore ?? null}
          gbpConnected={hasGoogleConnection}
          pmsUploaded={false}
          mondayEmailOpened={false}
          referralShared={false}
          referralCode={referralCode}
          onDismiss={() => {
            // T2 registers PATCH /api/user/onboarding-step
          }}
        />
      )}

      {isLoading && (
        <div className="space-y-4">
          <CardSkeleton height="7rem" />
          <CardSkeleton height="5rem" />
          <CardSkeleton height="8rem" />
        </div>
      )}

      {mode === "standard" ? (
        <>
          {/* ══ ABOVE THE FOLD — spec layer order ══ */}

          {/* 1. Practice Health Score ring */}
          <PositionCard ranking={rankingData ?? null} />

          {/* 2. One sentence finding */}
          <CompetitorGap ranking={rankingData ?? null} onCompetitorClick={setDrawerCompetitor} />

          {/* 3. One Action Card — deterministic rule engine */}
          <OneActionCard
            billingActive={billingStatus?.hasStripeSubscription !== false || billingStatus?.isAdminGranted === true}
            driftGP={null /* TODO: wire to referral drift data when available */}
            rankingDrop={
              rankingData?.previousPosition && rankingData?.rankPosition &&
              rankingData.rankPosition - rankingData.previousPosition >= 2
                ? {
                    previousPosition: rankingData.previousPosition,
                    currentPosition: rankingData.rankPosition,
                    keyword: rankingData.specialty || undefined,
                  }
                : null
            }
            competitorVelocity={null /* TODO: wire when review velocity data is available */}
            gbpConnected={hasGoogleConnection}
            topCompetitorName={rankingData?.topCompetitor?.name}
          />

          {/* GBP Connect prompt — show when not connected */}
          {!hasGoogleConnection && <GBPConnectCard gbpConnected={hasGoogleConnection} orgId={orgId} />}

          {/* 4. PatientPath breadcrumb — quiet, lower */}
          {isOwnerOrManager && <WebsiteCard website={websiteData ?? null} />}

          {/* ══ BELOW THE FOLD ══ */}
          {isOwnerOrManager && <ProoflineFindings findings={prooflineFindings} />}
          {canSendReviews && <ReviewRequestCard placeId={rankingData?.placeId ?? null} practiceName={practiceName} />}
          {isOwnerOrManager && <ReferralCard referralCode={referralCode} />}
        </>
      ) : (
        <>
          <GrowthPositionTrack ranking={rankingData ?? null} />
          <GapToNext ranking={rankingData ?? null} />
          {/* One Action Card in growth mode too */}
          <OneActionCard
            billingActive={billingStatus?.hasStripeSubscription !== false || billingStatus?.isAdminGranted === true}
            driftGP={null}
            rankingDrop={
              rankingData?.previousPosition && rankingData?.rankPosition &&
              rankingData.rankPosition - rankingData.previousPosition >= 2
                ? {
                    previousPosition: rankingData.previousPosition,
                    currentPosition: rankingData.rankPosition,
                    keyword: rankingData.specialty || undefined,
                  }
                : null
            }
            competitorVelocity={null}
            gbpConnected={hasGoogleConnection}
            topCompetitorName={rankingData?.topCompetitor?.name}
          />
          <CompetitorActivityFeed ranking={rankingData ?? null} />
          {canSendReviews && <ReviewRequestCard placeId={rankingData?.placeId ?? null} practiceName={practiceName} />}
          {isOwnerOrManager && <ReferralCard referralCode={referralCode} />}
        </>
      )}

      {/* CS Agent — floating chat */}
      <CSAgentChat
        practiceName={practiceName}
        score={rankingData?.rankScore ?? null}
        locationId={locationId}
      />

      {/* TTFV Sensor — bottom bar, 90s after first load */}
      <TTFVSensor orgId={orgId} onYes={() => { /* billing prompt auto-shows via ttfv-status check */ }} />

      {/* Competitor Detail Drawer */}
      {drawerCompetitor && (
        <CompetitorDrawer
          competitor={drawerCompetitor}
          clientReviews={rankingData?.clientReviews || 0}
          clientVelocityPerWeek={0}
          onClose={() => setDrawerCompetitor(null)}
        />
      )}

      {/* PatientPath Breadcrumb — quiet lower-right card */}
      <PatientPathBreadcrumb
        status={websiteData ? "live" : null}
        liveUrl={websiteData ? `https://${websiteData.generated_hostname}.sites.getalloro.com` : null}
        hostname={websiteData?.generated_hostname || null}
      />
    </div>
    </>
  );
}

function tryParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}
