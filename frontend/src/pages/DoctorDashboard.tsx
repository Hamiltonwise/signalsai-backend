/**
 * Doctor Dashboard — Client-Facing Intelligence Layer (WO17)
 *
 * What a logged-in doctor sees. Their practice data, not the agent management layer.
 * Read-only. Only their organization's data. No admin controls visible.
 */

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, TrendingUp, TrendingDown, Globe, Share2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLocationContext } from "@/contexts/locationContext";
import { apiGet } from "@/api/index";
import agents from "@/api/agents";
import ReviewRequestCard from "@/components/dashboard/ReviewRequestCard";

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

// ─── Proofline Findings ─────────────────────────────────────────────

function ProoflineFindings({
  findings,
}: {
  findings: ProoflineFinding[];
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
      <div className="space-y-3">
        {findings.slice(0, 3).map((f, i) => (
          <div key={i} className="flex gap-3 text-sm">
            <span className="shrink-0 w-5 h-5 rounded-full bg-[#D56753]/10 text-[#D56753] flex items-center justify-center text-xs font-bold">
              {i + 1}
            </span>
            <p className="text-gray-600">{f.detail || f.title}</p>
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

// ─── Main Component ─────────────────────────────────────────────────

export default function DoctorDashboard() {
  const { userProfile } = useAuth();
  const { selectedLocation } = useLocationContext();

  const orgId = userProfile?.organizationId || null;
  const locationId = selectedLocation?.id ?? null;
  const firstName = userProfile?.firstName || "Doctor";
  const practiceName = userProfile?.practiceName || "Your Practice";

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

  const isLoading =
    !rankingData && !agentData && !websiteData && !profileData;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-[#212D40]">
          {getGreeting()}, {firstName}.
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Here's what Alloro found this week for {practiceName}.
        </p>
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

      {/* Position Card */}
      <PositionCard ranking={rankingData ?? null} />

      {/* Competitor Gap */}
      <CompetitorGap ranking={rankingData ?? null} />

      {/* Proofline Findings */}
      <ProoflineFindings findings={prooflineFindings} />

      {/* Website Card */}
      <WebsiteCard website={websiteData ?? null} />

      {/* Review Requests */}
      <ReviewRequestCard
        placeId={rankingData?.placeId ?? null}
        practiceName={practiceName}
      />

      {/* Referral Card */}
      <ReferralCard referralCode={referralCode} />
    </div>
  );
}

function tryParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}
