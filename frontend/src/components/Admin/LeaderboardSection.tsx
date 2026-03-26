/**
 * Leaderboard Section — WO13: Your Market
 *
 * Visual leaderboard showing practice positions on horizontal tracks.
 * Practice dot (Terracotta), competitor dots (Navy), delta badges, gap sentence.
 */

import { TrendingUp, TrendingDown, Minus } from "lucide-react";

// ---------------------------------------------------------------------------
// Types (matches PracticeRanking's normalized RankingJob shape)
// ---------------------------------------------------------------------------

interface RankingJob {
  id: number;
  organization_id?: number | null;
  organization_name?: string | null;
  specialty: string;
  location: string | null;
  rank_score?: number | null;
  rank_position?: number | null;
  total_competitors?: number | null;
  created_at?: string;
  status: string;
}

interface LeaderboardEntry {
  orgName: string;
  specialty: string;
  location: string;
  position: number;
  totalCompetitors: number;
  score: number;
  delta: number | null; // positive = improved
}

// ---------------------------------------------------------------------------
// Build leaderboard from ranking jobs
// ---------------------------------------------------------------------------

function buildLeaderboard(jobs: RankingJob[]): LeaderboardEntry[] {
  // Group by org — take the two most recent completed jobs per org
  const orgMap = new Map<
    number,
    { latest: RankingJob; previous: RankingJob | null }
  >();

  const completed = jobs
    .filter((j) => j.status === "completed" && j.rank_position != null)
    .sort(
      (a, b) =>
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime()
    );

  for (const job of completed) {
    const orgId = job.organization_id;
    if (!orgId) continue;

    if (!orgMap.has(orgId)) {
      orgMap.set(orgId, { latest: job, previous: null });
    } else if (!orgMap.get(orgId)!.previous) {
      orgMap.get(orgId)!.previous = job;
    }
  }

  const entries: LeaderboardEntry[] = [];
  for (const [, { latest, previous }] of orgMap) {
    const delta =
      previous?.rank_position != null && latest.rank_position != null
        ? previous.rank_position - latest.rank_position
        : null;

    entries.push({
      orgName: latest.organization_name || `Org #${latest.organization_id}`,
      specialty: latest.specialty || "General",
      location: latest.location || "",
      position: latest.rank_position!,
      totalCompetitors: latest.total_competitors || 10,
      score: latest.rank_score || 0,
      delta,
    });
  }

  return entries.sort((a, b) => a.position - b.position);
}

// ---------------------------------------------------------------------------
// Position Track — horizontal visualization
// ---------------------------------------------------------------------------

function PositionTrack({ entry }: { entry: LeaderboardEntry }) {
  const maxPos = Math.max(entry.totalCompetitors, 10);
  const practicePercent = ((entry.position - 1) / (maxPos - 1)) * 100;

  // Generate a few competitor dots at fixed positions (illustrative)
  const competitorPositions = [1, 3, 5, 7, 9]
    .filter((p) => p !== entry.position && p <= maxPos)
    .slice(0, 4);

  return (
    <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md">
      {/* Org name + specialty */}
      <div className="w-40 shrink-0 min-w-0">
        <p className="text-sm font-bold text-[#212D40] truncate" title={entry.orgName}>
          {entry.orgName}
        </p>
        <p className="text-xs text-gray-400 truncate">
          {entry.specialty}
          {entry.location ? ` in ${entry.location}` : ""}
        </p>
      </div>

      {/* Track */}
      <div className="flex-1 relative h-8">
        {/* Track line */}
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gray-200 -translate-y-1/2" />

        {/* Position markers 1 and max */}
        <span className="absolute left-0 -top-0.5 text-[10px] text-gray-300 font-medium">
          1
        </span>
        <span className="absolute right-0 -top-0.5 text-[10px] text-gray-300 font-medium">
          {maxPos}
        </span>

        {/* Competitor dots (Navy outline) */}
        {competitorPositions.map((pos) => (
          <div
            key={pos}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-[#212D40]/30 bg-white"
            style={{ left: `${((pos - 1) / (maxPos - 1)) * 100}%` }}
          />
        ))}

        {/* Practice dot (Terracotta filled) */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-[#D56753] ring-2 ring-white shadow-sm z-10"
          style={{ left: `${practicePercent}%` }}
        />
      </div>

      {/* Position number + delta */}
      <div className="w-20 shrink-0 text-right">
        <span className="text-lg font-black text-[#212D40]">
          #{entry.position}
        </span>
        {entry.delta !== null && entry.delta !== 0 && (
          <div
            className={`flex items-center justify-end gap-0.5 text-xs font-semibold ${
              entry.delta > 0 ? "text-emerald-600" : "text-red-500"
            }`}
          >
            {entry.delta > 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {entry.delta > 0 ? "+" : ""}
            {entry.delta}
          </div>
        )}
        {entry.delta === 0 && (
          <div className="flex items-center justify-end gap-0.5 text-xs text-gray-400">
            <Minus className="h-3 w-3" />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gap sentence
// ---------------------------------------------------------------------------

function GapSentence({ entry }: { entry: LeaderboardEntry }) {
  if (entry.position <= 1) return null;
  const gap = entry.position - 1;
  return (
    <p className="text-xs text-gray-400 pl-44 -mt-1 mb-1">
      {gap} position{gap !== 1 ? "s" : ""} from first place
      {entry.score < 70 ? " — review velocity is the fastest lever" : ""}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function LeaderboardSection({
  jobs,
}: {
  jobs: RankingJob[];
}) {
  const entries = buildLeaderboard(jobs as any);

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-400 mb-8">
        <p className="text-base font-medium">No ranking data yet.</p>
        <p className="text-sm mt-1">
          Run a ranking analysis to see your market leaderboard.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-[#D56753]" />
          <span className="text-xs text-gray-400">Your practice</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full border-2 border-[#212D40]/30 bg-white" />
          <span className="text-xs text-gray-400">Competitors</span>
        </div>
      </div>

      <div className="space-y-2">
        {entries.map((entry) => (
          <div key={entry.orgName}>
            <PositionTrack entry={entry} />
            <GapSentence entry={entry} />
          </div>
        ))}
      </div>
    </div>
  );
}
