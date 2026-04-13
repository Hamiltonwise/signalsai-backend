/**
 * Practice Story, The Story Screen (WO11)
 *
 * Replaces the table-driven org detail view with a coach's pre-game report.
 * Data sources: existing org detail + practice rankings + agent outputs.
 * Read-only. No new API endpoints.
 */

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Eye,
  Loader2,
  Clock,
} from "lucide-react";
import ClientTimeline from "@/components/Admin/ClientTimeline";
import {
  useAdminOrganization,
} from "../../hooks/queries/useAdminQueries";
import { useAdminOrgRankings } from "../../hooks/queries/useAdminOrgTabQueries";
import { fetchAgentOutputs } from "../../api/agentOutputs";

// ─── Types ──────────────────────────────────────────────────────────

interface RankingJob {
  id: number;
  specialty: string;
  location: string | null;
  status: string;
  rank_score?: number | null;
  rank_position?: number | null;
  total_competitors?: number | null;
  created_at?: string;
}

// ─── Utilities ──────────────────────────────────────────────────────

function formatTimeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function healthIndicator(rankings: RankingJob[]): {
  color: string;
  label: string;
} {
  const latest = rankings.find((r) => r.status === "completed");
  if (!latest || latest.rank_score == null)
    return { color: "bg-gray-300", label: "No data" };
  if (latest.rank_score >= 70)
    return { color: "bg-emerald-500", label: "Strong" };
  if (latest.rank_score >= 50)
    return { color: "bg-amber-400", label: "Getting there" };
  // Low score is not "money at risk today", use amber, not red
  return { color: "bg-amber-400", label: "Needs attention" };
}

// ─── Sparkline (pure SVG) ───────────────────────────────────────────

function Sparkline({
  points,
  width = 200,
  height = 48,
}: {
  points: number[];
  width?: number;
  height?: number;
}) {
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const padY = 4;

  const coords = points.map((v, i) => ({
    x: (i / (points.length - 1)) * width,
    y: padY + (1 - (v - min) / range) * (height - padY * 2),
  }));

  const pathD = coords
    .map((c, i) => (i === 0 ? `M ${c.x} ${c.y}` : `L ${c.x} ${c.y}`))
    .join(" ");

  const last = coords[coords.length - 1];
  const trending = points[points.length - 1] >= points[0];
  const strokeColor = trending ? "#10b981" : "#ef4444";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block"
    >
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r={3} fill={strokeColor} />
    </svg>
  );
}

// ─── Position Card ──────────────────────────────────────────────────

function PositionCard({ rankings }: { rankings: RankingJob[] }) {
  const completed = rankings.filter((r) => r.status === "completed");
  if (completed.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-gray-400">
        No ranking data yet. First position appears after the next agent run.
      </div>
    );
  }

  const latest = completed[0];
  const previous = completed.length > 1 ? completed[1] : null;
  const delta =
    previous?.rank_position != null && latest.rank_position != null
      ? previous.rank_position - latest.rank_position // positive = improved
      : null;

  // Sparkline from ranking scores (oldest → newest)
  const sparkPoints = completed
    .slice(0, 8)
    .reverse()
    .map((r) => r.rank_score ?? 0);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
            Market Position
          </p>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-5xl font-semibold text-[#1A1D23]">
              #{latest.rank_position ?? "–"}
            </span>
            <span className="text-sm text-gray-500">
              of {latest.total_competitors ?? "–"}
            </span>
          </div>
          {delta !== null && delta !== 0 && (
            <div
              className={`mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                delta > 0
                  ? "bg-emerald-50 text-emerald-700"
                  : delta <= -2
                    ? "bg-amber-50 text-amber-700"
                    : "bg-gray-100 text-gray-600"
              }`}
            >
              {delta > 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {delta > 0 ? "+" : ""}
              {delta} position{Math.abs(delta) !== 1 ? "s" : ""} from last run
            </div>
          )}
          {delta === 0 && (
            <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-gray-50 px-2.5 py-0.5 text-xs font-semibold text-gray-500">
              <Minus className="h-3 w-3" />
              Holding steady
            </div>
          )}
        </div>
        <div className="pt-1">
          <Sparkline points={sparkPoints} />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
        <span>
          Score: {latest.rank_score ?? "–"}/100 &middot;{" "}
          {latest.specialty || "General"}
        </span>
        {latest.created_at && (
          <span>&middot; {formatTimeAgo(latest.created_at)}</span>
        )}
      </div>
    </div>
  );
}

// ─── Competitor Gap ─────────────────────────────────────────────────

function CompetitorGap({ rankings }: { rankings: RankingJob[] }) {
  const latest = rankings.find((r) => r.status === "completed");
  if (!latest || latest.rank_position === 1) return null;

  // We need the raw data to get competitor details, fetch the full result
  const { data: fullResult } = useQuery({
    queryKey: ["admin", "ranking-result", latest.id],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/admin/practice-ranking/results/${latest.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 10 * 60_000,
    enabled: !!latest.id,
  });

  const competitors = fullResult?.ranking?.raw_data?.competitors;
  if (!competitors || competitors.length === 0) {
    return (
      <div
        className="rounded-2xl px-6 py-5"
        style={{ backgroundColor: "rgba(213, 103, 83, 0.05)" }}
      >
        <p className="text-sm font-medium text-[#1A1D23]">
          Ranking data collected. Competitor gap analysis will appear after the
          next full scan.
        </p>
      </div>
    );
  }

  // Find the #1 competitor
  const topCompetitor = [...competitors].sort(
    (a: any, b: any) => (b.rankScore ?? 0) - (a.rankScore ?? 0)
  )[0];

  const clientReviews =
    fullResult?.ranking?.raw_data?.client_gbp?.totalReviewCount;
  const competitorReviews = topCompetitor?.totalReviews;
  const reviewDiff =
    clientReviews != null && competitorReviews != null
      ? competitorReviews - clientReviews
      : null;

  return (
    <div
      className="rounded-2xl px-6 py-5"
      style={{ backgroundColor: "rgba(213, 103, 83, 0.05)" }}
    >
      <p className="text-base font-medium leading-relaxed text-[#1A1D23]">
        <span className="font-semibold">{topCompetitor.name || "Top competitor"}</span> holds position
        #1
        {reviewDiff != null && reviewDiff > 0
          ? ` with ${reviewDiff} more review${reviewDiff !== 1 ? "s" : ""}`
          : reviewDiff == null
            ? ""
            : ""}
        {topCompetitor.averageRating
          ? ` and a ${topCompetitor.averageRating.toFixed(1)}-star rating`
          : ""}
        .
      </p>
    </div>
  );
}

// ─── Proofline Agent Last Action ────────────────────────────────────

function ProoflineAction({ orgId }: { orgId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "org-agent-outputs", orgId, "proofline-latest"],
    queryFn: async () => {
      const res = await fetchAgentOutputs({
        organization_id: orgId,
        agent_type: "proofline",
        status: "success",
        limit: 1,
        page: 1,
      });
      return res.success && res.data.length > 0 ? res.data[0] : null;
    },
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          <span className="text-sm text-gray-400">Loading agent data...</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
          Proofline Agent
        </p>
        <p className="mt-2 text-sm text-gray-500">
          No Proofline runs yet for this practice. First insights appear after
          the next scheduled run.
        </p>
      </div>
    );
  }

  const output = data.agent_output as any;
  const summary =
    output?.summary ||
    output?.client_summary ||
    output?.one_line_summary ||
    null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
          Proofline Agent, Last Action
        </p>
        <span className="text-xs text-gray-400">
          {formatTimeAgo(data.created_at)}
        </span>
      </div>
      {summary ? (
        <p className="mt-3 text-sm leading-relaxed text-[#1A1D23]">{summary}</p>
      ) : (
        <p className="mt-3 text-sm text-gray-500">
          Proofline ran {formatTimeAgo(data.created_at)}. Output processed
          successfully.
        </p>
      )}
    </div>
  );
}

// ─── The One Action ─────────────────────────────────────────────────

function OneAction({ rankings, orgId: _orgId, onNavigateManage }: { rankings: RankingJob[]; orgId: number; onNavigateManage: () => void }) {
  const latest = rankings.find((r) => r.status === "completed");

  // If score is low, suggest action
  if (latest?.rank_score != null && latest.rank_score < 60) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
          Recommended Action
        </p>
        <p className="mt-3 text-sm leading-relaxed text-[#1A1D23]">
          This practice scores {latest.rank_score}/100. The fastest path to
          improvement is review velocity, ask happy patients to leave a Google
          review this week.
        </p>
        <button
          onClick={onNavigateManage}
          className="mt-4 rounded-xl bg-[#D56753] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-105 active:scale-[0.98]"
        >
          View full analysis
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <Eye className="h-5 w-5 text-emerald-500" />
        <p className="text-sm font-medium text-[#1A1D23]">
          Alloro is watching. Nothing urgent.
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export default function PracticeStory() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const orgId = Number(id);
  const [activeTab, setActiveTab] = useState<"story" | "timeline">("story");

  const { data: orgData, isLoading: orgLoading } = useAdminOrganization(orgId);
  const { data: rankingsData } =
    useAdminOrgRankings(orgId, null);

  const org = orgData as any;
  const rankings: RankingJob[] = (rankingsData as RankingJob[]) || [];
  const completedRankings = rankings.filter((r) => r.status === "completed");
  const health = healthIndicator(completedRankings);

  if (orgLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-gray-400">
        <p>Organization not found.</p>
        <button
          onClick={() => navigate("/admin")}
          className="text-sm text-[#D56753] hover:underline"
        >
          Back to Morning Brief
        </button>
      </div>
    );
  }

  const orgName = org.organization?.name || org.name || `Org #${orgId}`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Back nav */}
      <button
        onClick={() => navigate("/admin")}
        className="mb-6 flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-[#1A1D23]"
      >
        <ArrowLeft className="h-4 w-4" />
        Morning Brief
      </button>

      {/* Practice name + health indicator */}
      <div className="mb-8 flex items-center gap-4">
        <h1 className="text-2xl font-semibold text-[#1A1D23]">{orgName}</h1>
        <div className="flex items-center gap-2">
          <span
            className={`h-3 w-3 rounded-full ${health.color}`}
            title={health.label}
          />
          <span className="text-xs font-medium text-gray-400">
            {health.label}
          </span>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-1 mb-6">
        <button
          onClick={() => setActiveTab("story")}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            activeTab === "story"
              ? "bg-[#212D40] text-white"
              : "text-gray-500 hover:text-[#1A1D23] hover:bg-gray-100"
          }`}
        >
          <Eye className="h-3.5 w-3.5" />
          Story
        </button>
        <button
          onClick={() => setActiveTab("timeline")}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            activeTab === "timeline"
              ? "bg-[#212D40] text-white"
              : "text-gray-500 hover:text-[#1A1D23] hover:bg-gray-100"
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          Timeline
        </button>
      </div>

      {/* Story cards */}
      {activeTab === "story" && (
        <div className="space-y-5">
          <PositionCard rankings={completedRankings} />
          <CompetitorGap rankings={rankings} />
          <ProoflineAction orgId={orgId} />
          <OneAction rankings={completedRankings} orgId={orgId} onNavigateManage={() => navigate(`/admin/organizations/${id}/manage`)} />

          {/* Persistent link to full customer data */}
          <button
            onClick={() => navigate(`/admin/organizations/${id}/manage`)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-6 py-4 text-sm font-medium text-[#1A1D23] shadow-sm transition-colors hover:bg-gray-50"
          >
            <Activity className="h-4 w-4 text-gray-400" />
            View all customer data
          </button>
        </div>
      )}

      {/* Client Timeline */}
      {activeTab === "timeline" && (
        <ClientTimeline orgId={orgId} />
      )}
    </div>
  );
}
