/**
 * Your Market — Leaderboard Visual (WO13)
 *
 * Replaces Practice Ranking history table with a leaderboard.
 * Each practice gets a horizontal position track showing where they
 * sit relative to competitors. Existing analysis table preserved
 * as a collapsible "View history" section.
 */

import { useState, useEffect, useMemo } from "react";
import { TrendingUp, ChevronDown, ChevronRight, History } from "lucide-react";
import { apiGet } from "@/api/index";
import { PracticeRanking } from "./PracticeRanking";

// ─── Types ──────────────────────────────────────────────────────────

interface RankingJob {
  id: number;
  organization_id?: number;
  organizationId?: number;
  organization_name?: string | null;
  location_name?: string | null;
  specialty: string;
  location: string | null;
  status: string;
  rank_score?: number | null;
  rankScore?: number | null;
  rank_position?: number | null;
  rankPosition?: number | null;
  total_competitors?: number | null;
  totalCompetitors?: number | null;
  created_at?: string;
  createdAt?: string;
  batch_id?: string | null;
  batchId?: string | null;
}

interface LeaderboardEntry {
  orgId: number;
  orgName: string;
  locationName: string | null;
  specialty: string;
  position: number;
  totalCompetitors: number;
  score: number;
  previousPosition: number | null;
  delta: number | null;
  location: string | null;
}

// ─── Position Track ─────────────────────────────────────────────────

function PositionTrack({
  position,
  total,
}: {
  position: number;
  total: number;
}) {
  const maxSlots = Math.min(total, 10);
  const slots = Array.from({ length: maxSlots }, (_, i) => i + 1);

  return (
    <div className="flex items-center gap-1">
      {slots.map((slot) => (
        <div
          key={slot}
          className="relative flex items-center justify-center"
        >
          {slot === position ? (
            <div className="h-6 w-6 rounded-full bg-[#D56753] flex items-center justify-center shadow-sm">
              <span className="text-[10px] font-bold text-white">{slot}</span>
            </div>
          ) : (
            <div className="h-5 w-5 rounded-full border-2 border-[#212D40]/20 flex items-center justify-center">
              <span className="text-[9px] font-medium text-gray-400">{slot}</span>
            </div>
          )}
        </div>
      ))}
      {total > 10 && (
        <span className="text-xs text-gray-400 ml-1">of {total}</span>
      )}
    </div>
  );
}

// ─── Delta Badge ────────────────────────────────────────────────────

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null || delta === 0) return null;

  // Positive delta means moved UP (position went down numerically = good)
  const isUp = delta > 0;

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full ${
        isUp
          ? "bg-emerald-50 text-emerald-700"
          : "bg-red-50 text-red-600"
      }`}
    >
      {isUp ? "+" : ""}
      {delta}
    </span>
  );
}

// ─── Gap Sentence ───────────────────────────────────────────────────

function gapSentence(entry: LeaderboardEntry): string | null {
  if (entry.position === 1) return "Leading the market.";
  const gapPositions = entry.position - 1;
  return `${gapPositions} position${gapPositions !== 1 ? "s" : ""} from first place.`;
}

// ─── Leaderboard Row ────────────────────────────────────────────────

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  const gap = gapSentence(entry);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      {/* Top: name + delta */}
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-[#212D40] truncate">
            {entry.orgName}
          </h3>
          {entry.locationName && (
            <p className="text-xs text-gray-400 truncate">{entry.locationName}</p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <span className="text-2xl font-bold text-[#212D40]">
              #{entry.position}
            </span>
            <span className="text-xs text-gray-400 ml-1">
              of {entry.totalCompetitors}
            </span>
          </div>
          <DeltaBadge delta={entry.delta} />
        </div>
      </div>

      {/* Position track */}
      <PositionTrack
        position={entry.position}
        total={entry.totalCompetitors}
      />

      {/* Score + gap */}
      <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-100">
        <span className="text-gray-500">
          Score: <span className="font-semibold text-[#212D40]">{entry.score}</span>/100
          {entry.specialty && (
            <span className="text-gray-400"> &middot; {entry.specialty}</span>
          )}
        </span>
        {gap && <span className="text-gray-400">{gap}</span>}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export default function YourMarket() {
  const [jobs, setJobs] = useState<RankingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const data = await apiGet({ path: "/admin/practice-ranking/list" });
        setJobs(data?.rankings || []);
      } catch {
        // Silently fail — leaderboard shows empty state
      } finally {
        setLoading(false);
      }
    };
    fetchJobs();
  }, []);

  // Build leaderboard entries from latest completed job per org+location
  const leaderboard = useMemo((): LeaderboardEntry[] => {
    const completed = jobs.filter((j) => j.status === "completed");
    if (completed.length === 0) return [];

    // Group by org+location, keep latest two per group (for delta)
    const groupKey = (j: RankingJob) => {
      const orgId = j.organization_id || j.organizationId || 0;
      const locName = j.location_name || j.location || "";
      return `${orgId}::${locName}`;
    };

    const grouped = new Map<string, RankingJob[]>();
    for (const job of completed) {
      const key = groupKey(job);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(job);
    }

    const entries: LeaderboardEntry[] = [];
    for (const [, groupJobs] of grouped) {
      // Sort by date descending
      groupJobs.sort(
        (a, b) =>
          new Date(b.created_at || b.createdAt || 0).getTime() -
          new Date(a.created_at || a.createdAt || 0).getTime(),
      );

      const latest = groupJobs[0];
      const previous = groupJobs.length > 1 ? groupJobs[1] : null;

      const position = latest.rank_position ?? latest.rankPosition ?? 0;
      const prevPosition = previous
        ? (previous.rank_position ?? previous.rankPosition ?? null)
        : null;

      // Delta: previous - current (positive = improved)
      const delta =
        prevPosition !== null && position > 0
          ? prevPosition - position
          : null;

      entries.push({
        orgId: latest.organization_id || latest.organizationId || 0,
        orgName:
          latest.organization_name ||
          `Organization #${latest.organization_id || latest.organizationId}`,
        locationName: latest.location_name || null,
        specialty: latest.specialty,
        position,
        totalCompetitors:
          latest.total_competitors ?? latest.totalCompetitors ?? 0,
        score: Number(latest.rank_score ?? latest.rankScore ?? 0),
        previousPosition: prevPosition,
        delta,
        location: latest.location,
      });
    }

    // Sort by position ascending (best first)
    entries.sort((a, b) => a.position - b.position);
    return entries;
  }, [jobs]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#212D40] flex items-center gap-3">
          <TrendingUp className="h-6 w-6 text-[#D56753]" />
          Your Market
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Where every practice stands against their competition.
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-36 animate-pulse rounded-xl bg-gray-100"
            />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && leaderboard.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 p-16 text-center text-gray-400">
          <TrendingUp className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-base font-medium">No rankings yet.</p>
          <p className="text-sm mt-1">
            First leaderboard appears after a practice ranking analysis completes.
          </p>
        </div>
      )}

      {/* Leaderboard */}
      {!loading && leaderboard.length > 0 && (
        <div className="space-y-4">
          {leaderboard.map((entry) => (
            <LeaderboardRow
              key={`${entry.orgId}-${entry.locationName}`}
              entry={entry}
            />
          ))}
        </div>
      )}

      {/* Collapsible history section */}
      <div className="mt-10 border-t border-gray-200 pt-6">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-[#212D40] transition-colors"
        >
          <History className="h-4 w-4" />
          View history
          {showHistory ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {showHistory && (
          <div className="mt-4">
            <PracticeRanking />
          </div>
        )}
      </div>
    </div>
  );
}
