/**
 * Doctor Dashboard — Client-Facing Intelligence Layer (WO17)
 *
 * What a logged-in doctor sees. Their practice data, not the agent management layer.
 * Read-only. Only their organization's data. No admin controls visible.
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
  Target,
  Zap,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLocationContext } from "@/contexts/locationContext";
import { apiGet } from "@/api/index";
import agents from "@/api/agents";
import ReviewRequestCard from "@/components/dashboard/ReviewRequestCard";
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

// ─── Position Card ──────────────────────────────────────────────────

function PositionCard({ ranking }: { ranking: RankingData | null }) {
  if (!ranking || !ranking.rankPosition) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center">
        <p className="text-lg font-bold text-[#212D40]">Your Market Position</p>
        <p className="text-sm text-gray-400 mt-2">
          Your first market scan runs tonight.
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
      <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
        Your Market Position
      </p>
      <div className="flex items-center gap-4">
        <div className="text-center">
          <span className="text-5xl font-bold text-[#212D40]">
            #{ranking.rankPosition}
          </span>
          <p className="text-sm text-gray-400 mt-1">
            of {ranking.totalCompetitors}{" "}
            {ranking.specialty ? `${ranking.specialty}s` : "competitors"} in{" "}
            {ranking.location || "your market"}
          </p>
        </div>
        {delta !== null && delta !== 0 && (
          <div
            className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold ${
              delta > 0
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-600"
            }`}
          >
            {delta > 0 ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )}
            {delta > 0 ? "+" : ""}
            {delta}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Competitor Gap ─────────────────────────────────────────────────

function CompetitorGap({ ranking }: { ranking: RankingData | null }) {
  if (!ranking?.topCompetitor) return null;

  const comp = ranking.topCompetitor;
  const reviewGap =
    comp.reviewCount && ranking.clientReviews
      ? comp.reviewCount - ranking.clientReviews
      : null;

  return (
    <div
      className="rounded-2xl p-5"
      style={{ backgroundColor: "rgba(213, 103, 83, 0.05)" }}
    >
      <p className="text-base font-medium text-[#212D40] leading-relaxed">
        <span className="font-bold">{comp.name}</span> holds position #1
        {reviewGap && reviewGap > 0
          ? ` with ${reviewGap} more reviews than you`
          : ""}
        {comp.rating ? ` and a ${comp.rating}★ rating` : ""}.
      </p>
    </div>
  );
}

// ─── Why Generator — every task gets a predicted outcome ─────────────

function generateFindingWhy(
  finding: ProoflineFinding,
  ranking: RankingData | null,
): string {
  const comp = ranking?.topCompetitor;
  const compName = comp?.name || "your top competitor";
  const position = ranking?.rankPosition;
  const reviewGap = comp?.reviewCount && ranking?.clientReviews
    ? comp.reviewCount - ranking.clientReviews
    : null;

  // Match finding type to a specific, outcome-driven "why"
  if (/review/i.test(finding.detail || finding.title || finding.type)) {
    if (reviewGap && reviewGap > 0) {
      return `Getting from ${ranking?.clientReviews} to ${comp?.reviewCount! + 1} reviews passes ${compName} on Google. That closes one of the three reasons patients choose them over you when they search.`;
    }
    return `Practices that actively collect reviews rank higher in local search. Every new review directly improves your visibility to patients searching right now.`;
  }

  if (/rating|star/i.test(finding.detail || finding.title || finding.type)) {
    return `Practices that respond to reviews rank higher and convert more referrals from doctors who research you before sending a patient.`;
  }

  if (/photo|image/i.test(finding.detail || finding.title || finding.type)) {
    return `Businesses with 20+ photos get 35% more clicks to their website from Google. Most of your competitors already have them.`;
  }

  if (/hour|schedule/i.test(finding.detail || finding.title || finding.type)) {
    return `Incomplete business profiles rank lower in local search. This fix takes 2 minutes and directly improves your position.`;
  }

  if (/website|web/i.test(finding.detail || finding.title || finding.type)) {
    return `A website linked in your Google profile is a ranking signal. Without one, you're giving that advantage to every competitor who has one.`;
  }

  if (/rank|position/i.test(finding.detail || finding.title || finding.type)) {
    if (position && position > 3) {
      return `Top 3 positions capture 70% of new patient clicks. Moving from #${position} to #${position - 1} means more patients see you first.`;
    }
    return `Your market position directly affects how many new patients find you through Google search.`;
  }

  // Generic fallback — still outcome-driven
  return `This directly affects where you appear when patients search for a ${ranking?.specialty || "provider"} in ${ranking?.location || "your area"}. Closing this gap moves you up.`;
}

// ─── Proofline Findings ─────────────────────────────────────────────

function ProoflineFindings({
  findings,
  ranking,
}: {
  findings: ProoflineFinding[];
  ranking: RankingData | null;
}) {
  if (findings.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-bold text-[#212D40] mb-2">
          What We Found This Week
        </h3>
        <p className="text-sm text-gray-400">
          Alloro is monitoring your market. First findings arrive after your next
          agent run.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <h3 className="text-sm font-bold text-[#212D40] mb-4">
        What We Found This Week
      </h3>
      <div className="space-y-4">
        {findings.slice(0, 3).map((f, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex gap-3 text-sm">
              <span className="shrink-0 w-5 h-5 rounded-full bg-[#D56753]/10 text-[#D56753] flex items-center justify-center text-xs font-bold mt-0.5">
                {i + 1}
              </span>
              <p className="text-[#212D40] font-medium">{f.detail || f.title}</p>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed ml-8">
              {generateFindingWhy(f, ranking)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Website Card ───────────────────────────────────────────────────

function WebsiteCard({ website }: { website: WebsiteInfo | null }) {
  if (!website) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-2">
          <Globe className="h-4 w-4 text-gray-400" />
          <h3 className="text-sm font-bold text-[#212D40]">Your PatientPath Site</h3>
        </div>
        <p className="text-sm text-gray-400">
          Your PatientPath website is being prepared.
        </p>
      </div>
    );
  }

  const siteUrl = `https://${website.generated_hostname}.sites.getalloro.com`;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex items-center gap-2 mb-3">
        <Globe className="h-4 w-4 text-[#D56753]" />
        <h3 className="text-sm font-bold text-[#212D40]">Your PatientPath Site</h3>
      </div>
      <p className="text-sm text-gray-500 mb-3">{website.generated_hostname}</p>
      <a
        href={siteUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[#D56753] hover:text-[#D56753]/80 transition-colors"
      >
        View your site
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

// ─── Referral Card ──────────────────────────────────────────────────

function ReferralCard({ referralCode }: { referralCode: string | null }) {
  const [copied, setCopied] = useState(false);

  if (!referralCode) return null;

  const link = `https://getalloro.com/checkup?ref=${referralCode}`;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex items-center gap-2 mb-2">
        <Share2 className="h-4 w-4 text-gray-400" />
        <h3 className="text-sm font-bold text-[#212D40]">Refer a Colleague</h3>
      </div>
      <p className="text-sm text-gray-500 mb-3">
        Know another doctor flying blind? Share this. You both get one month free.
      </p>
      <div className="flex gap-2">
        <input
          readOnly
          value={link}
          className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500 truncate"
        />
        <button
          onClick={() => {
            navigator.clipboard.writeText(link).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
          className="flex items-center gap-1.5 rounded-lg border border-[#212D40]/20 px-3 py-2 text-xs font-medium text-[#212D40] hover:border-[#212D40]/40 transition-colors"
        >
          <Copy className="h-3 w-3" />
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

// ─── Growth Mode: Gap-to-Next ────────────────────────────────────────

function GapToNext({ ranking }: { ranking: RankingData | null }) {
  if (!ranking?.rankPosition || ranking.rankPosition <= 1) {
    return (
      <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-6 text-center">
        <p className="text-lg font-bold text-emerald-800">You're #1.</p>
        <p className="text-sm text-emerald-600 mt-1">Defend the position. Every review keeps you there.</p>
      </div>
    );
  }

  const comp = ranking.topCompetitor;
  const reviewGap = comp?.reviewCount && ranking.clientReviews
    ? comp.reviewCount - ranking.clientReviews
    : null;

  return (
    <div className="rounded-2xl border-2 border-[#D56753]/20 bg-white p-6">
      <div className="flex items-center gap-2 mb-4">
        <Target className="h-5 w-5 text-[#D56753]" />
        <h3 className="text-sm font-bold uppercase tracking-wider text-[#D56753]">
          Gap to #{ranking.rankPosition - 1}
        </h3>
      </div>

      {comp && (
        <p className="text-base font-semibold text-[#212D40] mb-4">
          {comp.name} is {ranking.rankPosition === 2 ? "the only one" : "one spot"} ahead of you.
        </p>
      )}

      {/* Closeable units — each with a "why" */}
      <div className="space-y-4">
        {reviewGap != null && reviewGap > 0 && (
          <div className="bg-[#212D40]/[0.03] rounded-xl px-4 py-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[#212D40]">
                  {reviewGap} review{reviewGap !== 1 ? "s" : ""}
                </p>
                <p className="text-xs text-gray-500">
                  They have {comp?.reviewCount}. You have {ranking.clientReviews}.
                </p>
              </div>
              <span className="text-xs font-bold text-[#D56753] bg-[#D56753]/10 px-2.5 py-1 rounded-full">
                Closeable
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Getting from {ranking.clientReviews} to {(comp?.reviewCount || 0) + 1} reviews passes {comp?.name} on Google. That closes one of the three reasons patients choose them over you when they search.
            </p>
          </div>
        )}

        {comp?.rating && ranking.rankScore != null && (
          <div className="bg-[#212D40]/[0.03] rounded-xl px-4 py-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[#212D40]">
                  {comp.rating}★ vs your {(ranking.rankScore / 20).toFixed(1)}★
                </p>
                <p className="text-xs text-gray-500">
                  Rating gap affects search ranking
                </p>
              </div>
              <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
                Long-term
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Practices that respond to every review see their average rating climb over 3-6 months. Each 0.1★ improvement directly affects where Google places you in local search results.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Growth Mode: This Week's Move ──────────────────────────────────

function RecommendedMove({
  ranking,
  findings,
}: {
  ranking: RankingData | null;
  findings: ProoflineFinding[];
}) {
  const comp = ranking?.topCompetitor;
  const compName = comp?.name || "your nearest competitor";
  const reviewGap = comp ? (comp.reviewCount || 0) - (ranking?.clientReviews || 0) : 0;

  // Pick the most impactful action with a specific "why"
  let move = {
    title: "Ask 3 happy customers for a Google review this week",
    why: `Review velocity is the fastest way to climb in local search. Every new review is a signal to Google that your business is active and trusted.`,
  };

  if (reviewGap > 0 && reviewGap <= 5) {
    move = {
      title: `Get ${reviewGap} review${reviewGap !== 1 ? "s" : ""} to pass ${compName}`,
      why: `You're ${reviewGap} away from overtaking ${compName}. Getting from ${ranking?.clientReviews} to ${(comp?.reviewCount || 0) + 1} reviews changes your rank on Google. That's one good week of asking.`,
    };
  } else if (reviewGap > 5 && reviewGap <= 15) {
    move = {
      title: `Request 3 reviews this week to close the gap with ${compName}`,
      why: `Getting from ${ranking?.clientReviews} to ${(comp?.reviewCount || 0) + 1} reviews passes ${compName} on Google. At 3 per week, that's ${Math.ceil(reviewGap / 3)} weeks. Start with your most recent happy customer.`,
    };
  }

  if (findings.length > 0 && findings[0].detail) {
    const finding = findings[0];
    if (/photo/i.test(finding.detail)) {
      move = {
        title: "Add 5 new photos to your Google Business Profile",
        why: `Businesses with 20+ photos get 35% more clicks from Google. ${compName} likely already has them. This takes 10 minutes and works immediately.`,
      };
    }
    if (/hour|schedule/i.test(finding.detail)) {
      move = {
        title: "Update your GBP hours",
        why: `Incomplete business profiles rank 23% lower in local search. This fix takes 2 minutes and directly improves your position.`,
      };
    }
    if (/respond|reply.*review/i.test(finding.detail)) {
      move = {
        title: "Respond to your last 5 reviews",
        why: `Practices that respond to reviews rank higher and convert more referrals from doctors who research you before sending a patient.`,
      };
    }
  }

  return (
    <div className="rounded-2xl border border-[#D56753]/20 bg-[#D56753]/[0.03] p-6">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="h-5 w-5 text-[#D56753]" />
        <h3 className="text-sm font-bold uppercase tracking-wider text-[#D56753]">
          This Week's Move
        </h3>
      </div>
      <p className="text-base font-bold text-[#212D40]">{move.title}</p>
      <p className="text-sm text-slate-500 mt-2 leading-relaxed">{move.why}</p>
    </div>
  );
}

// ─── Growth Mode: Competitor Activity Feed ──────────────────────────

function CompetitorActivityFeed({ ranking }: { ranking: RankingData | null }) {
  if (!ranking?.topCompetitor) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-bold text-[#212D40] mb-2">Competitor Activity</h3>
        <p className="text-sm text-gray-400">Market data appears after your first scan.</p>
      </div>
    );
  }

  // Build activity items from available data
  const activities: { text: string; type: "warning" | "info" | "neutral" }[] = [];

  const comp = ranking.topCompetitor;
  if (comp.reviewCount > 0) {
    activities.push({
      text: `${comp.name} has ${comp.reviewCount} reviews with a ${comp.rating}★ rating`,
      type: "warning",
    });
  }
  if (ranking.totalCompetitors && ranking.totalCompetitors > 5) {
    activities.push({
      text: `${ranking.totalCompetitors} ${ranking.specialty || "practice"}s compete in ${ranking.location || "your market"}`,
      type: "info",
    });
  }
  if (ranking.rankPosition && ranking.rankPosition > 3) {
    activities.push({
      text: `Top 3 positions get 70% of new patient clicks`,
      type: "neutral",
    });
  }

  if (activities.length === 0) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <h3 className="text-sm font-bold text-[#212D40] mb-4">Competitor Activity</h3>
      <div className="space-y-3">
        {activities.map((a, i) => (
          <div key={i} className="flex items-start gap-3 text-sm">
            <span
              className={`mt-1 shrink-0 w-2 h-2 rounded-full ${
                a.type === "warning"
                  ? "bg-amber-400"
                  : a.type === "info"
                    ? "bg-blue-400"
                    : "bg-gray-300"
              }`}
            />
            <p className="text-gray-600">{a.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Growth Mode: Position Track ────────────────────────────────────

function GrowthPositionTrack({ ranking }: { ranking: RankingData | null }) {
  if (!ranking?.rankPosition || !ranking.totalCompetitors) return null;

  const maxPos = Math.min(ranking.totalCompetitors, 10);
  const positions = Array.from({ length: maxPos }, (_, i) => i + 1);
  const practicePos = ranking.rankPosition;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">
        Your Position Track
      </h3>
      <div className="flex items-center gap-1">
        {positions.map((pos) => (
          <div key={pos} className="flex-1 flex flex-col items-center gap-1.5">
            <div
              className={`w-full h-2 rounded-full ${
                pos === practicePos
                  ? "bg-[#D56753]"
                  : pos < practicePos
                    ? "bg-[#212D40]/15"
                    : "bg-gray-100"
              }`}
            />
            <span
              className={`text-[10px] font-bold ${
                pos === practicePos
                  ? "text-[#D56753]"
                  : "text-gray-300"
              }`}
            >
              {pos}
            </span>
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

// ─── Mode Toggle ────────────────────────────────────────────────────

function ModeToggle({
  mode,
  onChange,
}: {
  mode: "standard" | "growth";
  onChange: (mode: "standard" | "growth") => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1">
      <button
        onClick={() => onChange("standard")}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
          mode === "standard"
            ? "bg-white text-[#212D40] shadow-sm"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        <Shield className="h-3.5 w-3.5" />
        Standard
      </button>
      <button
        onClick={() => onChange("growth")}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
          mode === "growth"
            ? "bg-[#D56753] text-white shadow-sm"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        <Flame className="h-3.5 w-3.5" />
        Growth
      </button>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export default function DoctorDashboard() {
  const { userProfile } = useAuth();
  const { selectedLocation } = useLocationContext();

  const orgId = userProfile?.organizationId || null;
  const locationId = selectedLocation?.id ?? null;
  const firstName = userProfile?.firstName || "Doctor";
  const practiceName = selectedLocation?.name || userProfile?.practiceName || "Your Practice";
  const locationName = selectedLocation?.name || null;

  // Role-based gating
  const userRole = getPriorityItem("user_role") as string | null;
  const isOwnerOrManager = userRole === "admin" || userRole === "manager";
  const canSendReviews = userRole !== "viewer"; // owner + manager + staff

  // Ranking data
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

  // Agent data (Proofline findings)
  const { data: agentData } = useQuery({
    queryKey: ["client-agent-data", orgId, locationId],
    queryFn: () => agents.getLatestAgentData(orgId!, locationId),
    enabled: !!orgId,
    staleTime: 10 * 60_000,
  });

  // Extract proofline findings from agent data
  const prooflineFindings: ProoflineFinding[] = (() => {
    if (!agentData?.successful) return [];
    const results = agentData.results || agentData.data || [];
    const proofline = Array.isArray(results)
      ? results.find((r: any) => r.agent_type === "proofline")
      : null;
    if (!proofline?.agent_output) return [];
    const output =
      typeof proofline.agent_output === "string"
        ? tryParse(proofline.agent_output)
        : proofline.agent_output;
    if (typeof output === "object" && output !== null) {
      const findings = (output as any).findings || (output as any).items || [];
      if (Array.isArray(findings)) return findings.slice(0, 3);
    }
    return [];
  })();

  // Website info
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

  // Referral code
  const { data: profileData } = useQuery({
    queryKey: ["client-profile"],
    queryFn: async () => apiGet({ path: "/profile" }),
    staleTime: 10 * 60_000,
  });

  const referralCode = profileData?.referral_code || profileData?.organization?.referral_code || null;

  const [mode, setMode] = useState<"standard" | "growth">("standard");

  const isLoading =
    !rankingData && !agentData && !websiteData && !profileData;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      {/* Header: Greeting + Mode Toggle */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#212D40]">
            {mode === "growth"
              ? `Let's close the gap, ${firstName}.`
              : `${getGreeting()}, ${firstName}.`}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {mode === "growth"
              ? `Here's exactly what stands between ${practiceName} and the next position.`
              : `Here's what Alloro found this week for ${practiceName}.`}
          </p>
          {locationName && (
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              Viewing: {locationName}
            </p>
          )}
        </div>
        <ModeToggle mode={mode} onChange={setMode} />
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl border border-gray-200 bg-white"
            />
          ))}
        </div>
      )}

      {mode === "standard" ? (
        <>
          {/* ── Standard Mode ── */}
          <PositionCard ranking={rankingData ?? null} />
          <CompetitorGap ranking={rankingData ?? null} />
          {isOwnerOrManager && <ProoflineFindings findings={prooflineFindings} ranking={rankingData ?? null} />}
          {isOwnerOrManager && <WebsiteCard website={websiteData ?? null} />}
          {canSendReviews && (
            <ReviewRequestCard
              placeId={rankingData?.placeId ?? null}
              practiceName={practiceName}
            />
          )}
          {isOwnerOrManager && <ReferralCard referralCode={referralCode} />}
        </>
      ) : (
        <>
          {/* ── Growth Mode ── */}
          <GrowthPositionTrack ranking={rankingData ?? null} />
          <GapToNext ranking={rankingData ?? null} />
          <RecommendedMove
            ranking={rankingData ?? null}
            findings={prooflineFindings}
          />
          <CompetitorActivityFeed ranking={rankingData ?? null} />
          {canSendReviews && (
            <ReviewRequestCard
              placeId={rankingData?.placeId ?? null}
              practiceName={practiceName}
            />
          )}
          {isOwnerOrManager && <ReferralCard referralCode={referralCode} />}
        </>
      )}
    </div>
  );
}

function tryParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}
