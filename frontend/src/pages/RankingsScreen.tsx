/**
 * Rankings Screen — /dashboard/rankings
 *
 * WO20 / T3-B: Shows weekly ranking snapshots from the Intelligence Agent.
 * Current position, named #1 and #2 competitors, trend, weekly bullets,
 * competitor note, recommended action with dollar figure.
 *
 * Also shows GP drift alerts (T3-F Surprise Catch) as persistent amber banners.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  DollarSign,
  X,
  ChevronRight,
  BarChart3,
  Calendar,
} from "lucide-react";
import { apiGet, apiPost } from "@/api/index";

// ─── Types ──────────────────────────────────────────────────────────

interface RankingSnapshot {
  id: string;
  org_id: number;
  week_start: string;
  position: number | null;
  keyword: string | null;
  bullets: string[] | string;
  competitor_note: string | null;
  finding_headline: string | null;
  dollar_figure: number | null;
  competitor_name: string | null;
  competitor_review_count: number | null;
  client_review_count: number | null;
  created_at: string;
}

interface DriftAlert {
  type: "gone_dark" | "drift";
  gpName: string;
  gpPractice: string;
  priorMonthlyAvg?: number;
  daysSilent?: number;
  declinePct?: number;
  currentRate?: number;
  priorRate?: number;
  sourceId: string;
}

// ─── Surprise Catch Banner ──────────────────────────────────────────

function SurpriseCatchBanner({ alert, onDismiss }: { alert: DriftAlert; onDismiss: () => void }) {
  return (
    <div className={`rounded-2xl p-4 sm:p-5 flex items-start justify-between gap-3 ${
      alert.type === "gone_dark" ? "bg-red-50 border border-red-200" : "bg-amber-50 border border-amber-200"
    }`}>
      <div className="flex items-start gap-3 min-w-0">
        <AlertTriangle className={`h-5 w-5 shrink-0 mt-0.5 ${
          alert.type === "gone_dark" ? "text-red-500" : "text-amber-500"
        }`} />
        <div>
          {alert.type === "gone_dark" ? (
            <>
              <p className="text-sm font-bold text-[#212D40]">
                {alert.gpName} at {alert.gpPractice} hasn't referred a case in {alert.daysSilent} days.
              </p>
              <p className="text-xs text-gray-600 mt-1">
                They referred {alert.priorMonthlyAvg} case{alert.priorMonthlyAvg !== 1 ? "s" : ""} per month on average in the prior 3 months.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-[#212D40]">
                {alert.gpName}'s referrals are down {alert.declinePct}% over the last 60 days.
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Was {alert.priorRate}/month, now {alert.currentRate}/month. At this rate, they may stop referring entirely.
              </p>
            </>
          )}
          <a
            href="/dashboard/referrals"
            className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold hover:underline ${
              alert.type === "gone_dark" ? "text-red-600" : "text-amber-700"
            }`}
          >
            See what changed <ChevronRight className="h-3 w-3" />
          </a>
        </div>
      </div>
      <button
        onClick={onDismiss}
        className="text-gray-400 hover:text-gray-600 shrink-0"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Weekly Snapshot Card ───────────────────────────────────────────

function SnapshotCard({ snapshot, isLatest }: { snapshot: RankingSnapshot; isLatest: boolean }) {
  const bullets = typeof snapshot.bullets === "string"
    ? JSON.parse(snapshot.bullets)
    : snapshot.bullets || [];

  return (
    <div className={`rounded-2xl border bg-white p-4 sm:p-6 ${isLatest ? "border-[#D56753]/20 shadow-[0_4px_20px_rgba(213,103,83,0.06)]" : "border-gray-200"}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-400" />
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Week of {new Date(snapshot.week_start).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
          {isLatest && (
            <span className="text-xs font-bold bg-[#D56753]/10 text-[#D56753] px-2 py-0.5 rounded-full">
              This Week
            </span>
          )}
        </div>
        {snapshot.position && (
          <span className="text-lg font-semibold text-[#212D40]">#{snapshot.position}</span>
        )}
      </div>

      {/* Finding headline */}
      {snapshot.finding_headline && (
        <p className="text-base font-bold text-[#212D40] mb-3">{snapshot.finding_headline}</p>
      )}

      {/* Bullets */}
      <div className="space-y-2 mb-4">
        {bullets.map((bullet: string, i: number) => (
          <div key={i} className="flex items-start gap-2.5">
            <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-[#D56753] mt-1.5" />
            <p className="text-sm text-gray-600 leading-relaxed">{bullet}</p>
          </div>
        ))}
      </div>

      {/* Competitor note */}
      {snapshot.competitor_note && (
        <p className="text-xs text-gray-400 italic mb-3">{snapshot.competitor_note}</p>
      )}

      {/* Dollar figure */}
      {snapshot.dollar_figure != null && snapshot.dollar_figure > 0 && (
        <div className="flex items-center gap-2 bg-red-50 rounded-lg px-3 py-2">
          <DollarSign className="h-4 w-4 text-red-500" />
          <p className="text-xs font-semibold text-red-600">
            ${snapshot.dollar_figure.toLocaleString()}/month estimated revenue at risk from velocity gap
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export default function RankingsScreen() {
  const queryClient = useQueryClient();

  // Fetch checkup context for new accounts without snapshots yet
  const { data: checkupCtx } = useQuery({
    queryKey: ["dashboard-context"],
    queryFn: async () => {
      const res = await apiGet({ path: "/user/dashboard-context" });
      return res?.success ? res.checkup_context : null;
    },
    staleTime: 30 * 60_000,
  });

  // Fetch snapshots
  const { data: snapshotData, isLoading: snapshotsLoading, isError: isSnapshotsError } = useQuery({
    queryKey: ["rankings-snapshots"],
    queryFn: async () => {
      const res = await apiGet({ path: "/rankings-intelligence/snapshots" });
      return res?.success ? res.snapshots as RankingSnapshot[] : [];
    },
    staleTime: 5 * 60_000,
  });

  // Fetch drift alerts
  const { data: alertsData, isError: isAlertsError } = useQuery({
    queryKey: ["drift-alerts"],
    queryFn: async () => {
      const res = await apiGet({ path: "/rankings-intelligence/drift-alerts" });
      return res?.success ? res.alerts as DriftAlert[] : [];
    },
    staleTime: 5 * 60_000,
  });

  // Dismiss alert mutation
  const dismissAlert = useMutation({
    mutationFn: async ({ sourceId, alertType }: { sourceId: string; alertType: string }) => {
      return apiPost({ path: "/rankings-intelligence/dismiss-alert", passedData: { sourceId, alertType } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drift-alerts"] });
    },
  });

  const snapshots = snapshotData || [];
  const alerts = alertsData || [];
  const latest = snapshots[0] || null;

  // Position trend
  const prev = snapshots[1] || null;
  const positionDelta = latest?.position && prev?.position ? prev.position - latest.position : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-[#212D40]">Your Rankings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Weekly intelligence on your market position. Updated every Sunday.
        </p>
      </div>

      {/* Drift alerts — persistent banners */}
      {alerts.map((alert) => (
        <SurpriseCatchBanner
          key={alert.sourceId}
          alert={alert}
          onDismiss={() => dismissAlert.mutate({ sourceId: alert.sourceId, alertType: alert.type })}
        />
      ))}

      {/* Current position hero */}
      {latest && (
        <div className="bg-[#212D40] rounded-2xl p-4 sm:p-6 text-white">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
            <div>
              <p className="text-xs text-white/50 uppercase tracking-wider font-bold">Current Position</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-3xl sm:text-5xl font-semibold">#{latest.position}</span>
                {positionDelta !== null && positionDelta !== 0 && (
                  <span className={`flex items-center gap-1 text-sm font-bold ${
                    positionDelta > 0 ? "text-emerald-400" : "text-red-400"
                  }`}>
                    {positionDelta > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    {positionDelta > 0 ? "+" : ""}{positionDelta}
                  </span>
                )}
              </div>
              {latest.keyword && (
                <p className="text-sm text-white/60 mt-1">
                  for {latest.keyword} in your market
                </p>
              )}
            </div>
            <div className="text-right">
              {(latest.competitor_name || latest.competitor_review_count) && (
                <div>
                  <p className="text-xs text-white/50 uppercase tracking-wider font-bold">#1 Position</p>
                  <p className="text-sm font-semibold text-white mt-1">{latest.competitor_name || "Top competitor"}</p>
                  {latest.competitor_review_count && (
                    <p className="text-xs text-white/50">{latest.competitor_review_count} reviews</p>
                  )}
                </div>
              )}
            </div>
          {/* Near-miss line (WO-37) */}
          {latest.client_review_count != null && latest.competitor_review_count != null && latest.competitor_name && (
            <p className="text-sm text-white/60 mt-4">
              {latest.position === 1
                ? `${(latest.client_review_count - latest.competitor_review_count)} reviews ahead of ${latest.competitor_name}.`
                : `${Math.abs(latest.competitor_review_count - latest.client_review_count)} reviews separate you from ${latest.competitor_name}.`}
            </p>
          )}
          </div>
        </div>
      )}

      {/* Loading */}
      {snapshotsLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl border border-gray-200 bg-white" />
          ))}
        </div>
      )}

      {/* Error state */}
      {(isSnapshotsError || isAlertsError) && (
        <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-gray-400">
          <p className="text-sm font-medium">We couldn't load your rankings right now.</p>
          <p className="text-xs mt-1">Try refreshing, or check back after the next Sunday scan.</p>
        </div>
      )}

      {/* Empty state — use checkup data if available */}
      {!snapshotsLoading && !isSnapshotsError && snapshots.length === 0 && (
        checkupCtx?.data?.market ? (
          <div className="space-y-4">
            {/* Checkup preview card */}
            <div className="bg-[#212D40] rounded-2xl p-4 sm:p-6 text-white">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#D56753] mb-3">
                From your Checkup
              </p>
              <div className="flex flex-col sm:flex-row items-baseline gap-1 sm:gap-2 mb-1">
                <span className="text-3xl sm:text-4xl font-semibold">#{checkupCtx.data.market.rank || "?"}</span>
                <span className="text-white/50 text-sm">
                  of {checkupCtx.data.market.totalCompetitors || "?"} in {checkupCtx.data.market.city || "your market"}
                </span>
              </div>
              {checkupCtx.data.topCompetitor && (
                <p className="text-sm text-white/60 mt-2">
                  {checkupCtx.data.topCompetitor.name} holds #1 with {checkupCtx.data.topCompetitor.reviewCount} reviews
                  {checkupCtx.data.topCompetitor.rating ? ` and a ${checkupCtx.data.topCompetitor.rating}-star rating` : ""}.
                </p>
              )}
            </div>
            {/* Next update notice */}
            <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-gray-400">
              <Calendar className="h-6 w-6 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">Your first full ranking report arrives Monday morning.</p>
              <p className="text-xs mt-1">We'll track position changes, competitor moves, and review velocity every week.</p>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-400">
            <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-base font-medium">Competitor data updates every Sunday.</p>
            <p className="text-sm mt-1">Check back Monday morning for your first ranking intelligence report.</p>
          </div>
        )
      )}

      {/* What Alloro Did This Week — Live Progress Feed (WO-46) */}
      <ActivityFeed />

      {/* Snapshot history */}
      {snapshots.length > 0 && (
        <div className="space-y-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Weekly Reports</p>
          {snapshots.map((snapshot, i) => (
            <SnapshotCard key={snapshot.id} snapshot={snapshot} isLatest={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Activity Feed — What Alloro Did This Week (WO-46) ──────────────

interface FeedEntry {
  id: string;
  type: string;
  label: string;
  relativeTime: string;
  isNotable: boolean;
}

function ActivityFeed() {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["activity-feed"],
    queryFn: async () => {
      const res = await apiGet({ path: "/rankings-intelligence/activity-feed" });
      return res?.success ? res : { entries: [], nearMiss: null };
    },
    staleTime: 5 * 60_000,
  });

  const entries: FeedEntry[] = data?.entries || [];
  const nearMiss: string | null = data?.nearMiss || null;
  const visible = expanded ? entries : entries.slice(0, 5);

  if (isLoading) return null;

  // Empty state for new accounts
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-5">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
          What Alloro Did This Week
        </p>
        <p className="text-sm text-gray-400">
          Alloro started watching your market. Your first activity will appear here soon.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-5 pt-4 pb-2">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          What Alloro Did This Week
        </p>
      </div>
      <div className="divide-y divide-gray-100">
        {visible.map((entry) => (
          <div key={entry.id} className="px-4 sm:px-5 py-3 flex items-start gap-3">
            <span className={`shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${
              entry.isNotable ? "bg-[#D56753]" : "bg-gray-300"
            }`} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm leading-snug ${
                entry.isNotable ? "text-[#212D40] font-medium" : "text-gray-500"
              }`}>
                {entry.label}
              </p>
            </div>
            <span className="shrink-0 text-xs text-gray-400">{entry.relativeTime}</span>
          </div>
        ))}
      </div>
      {entries.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-5 py-2.5 text-xs font-semibold text-[#D56753] hover:bg-gray-50 transition-colors flex items-center justify-center gap-1"
        >
          {expanded ? "Show less" : `See all ${entries.length} this week`}
          <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>
      )}
      {nearMiss && (
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
          <p className="text-xs text-gray-500">
            <span className="font-semibold text-[#D56753]">{nearMiss}</span>
          </p>
        </div>
      )}
    </div>
  );
}
