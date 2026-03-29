/**
 * 365-Day Progress Report — /dashboard/progress
 *
 * "You've accomplished 140 Alloro taskings over the last 365 days.
 * This is how you're meeting your 3 year, 5 year, 10 year goals."
 * — Shawn McPherson
 *
 * Four sections: Year in Review, Goal Progress, This Year's Moves, Next 90 Days.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  Target,
  Calendar,
  CheckCircle2,
  ArrowRight,
  Zap,
  BarChart3,
  Award,
  Search,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiGet, apiPatch } from "@/api/index";

// ─── Types ──────────────────────────────────────────────────────────

interface YearInReview {
  tasksCompleted: number;
  agentOutputs: number;
  startPosition: number | null;
  currentPosition: number | null;
  positionDelta: number | null;
  startScore: number | null;
  currentScore: number | null;
  reviewsGained: number | null;
  estimatedRevenueImpact: number;
  periodStart: string;
  periodEnd: string;
}

interface TopMove {
  title: string;
  completedAt: string;
  outcome: string;
}

interface Next90Action {
  title: string;
  why: string;
  impact: string;
}

interface Goals {
  oneYear?: string;
  threeYear?: string;
  fiveYear?: string;
  sellBy?: string;
}

interface Milestone {
  id: string;
  type: string;
  headline: string;
  detail: string | null;
  competitor: string | null;
  date: string;
}

interface EnhancedYearSummary {
  start_date: string;
  days_active: number;
  practice_name?: string;
  first_win_date?: string | null;
  competitor_moves_caught?: number;
  positions_gained: number | null;
  start_position: number | null;
  current_position: number | null;
  reviews_gained: number | null;
  current_reviews: number | null;
  gps_retained: number;
  gps_lost: number;
}

interface ProgressData {
  yearInReview: YearInReview;
  goals: Goals | null;
  topMoves: TopMove[];
  next90Days: Next90Action[];
}

interface EnhancedProgressData {
  year_summary: EnhancedYearSummary;
  milestones: Milestone[];
  trajectory_statements: string[];
}

// ─── Stat Card ──────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  detail,
  color: _color = "text-[#212D40]",
}: {
  label: string;
  value: string;
  detail?: string;
  color?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
      <p className="text-2xl font-black tabular-nums ${color}">{value}</p>
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-1">{label}</p>
      {detail && <p className="text-[11px] text-gray-400 mt-0.5">{detail}</p>}
    </div>
  );
}

// ─── Section 1: Year in Review ──────────────────────────────────────

function YearInReviewSection({ data }: { data: YearInReview }) {
  const posUp = data.positionDelta && data.positionDelta > 0;
  const posDown = data.positionDelta && data.positionDelta < 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Calendar className="h-5 w-5 text-[#D56753]" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-[#D56753]">
          Year in Review
        </h2>
      </div>

      {/* Hero stat */}
      <div className="bg-[#212D40] rounded-2xl p-4 sm:p-6 text-center text-white">
        {data.tasksCompleted > 0 ? (
          <>
            <p className="text-3xl sm:text-5xl font-black tabular-nums">{data.tasksCompleted}</p>
            <p className="text-sm font-medium text-white/70 mt-1">
              Alloro tasks completed in the last 365 days
            </p>
          </>
        ) : (
          <>
            <p className="text-2xl font-black">Your year starts now.</p>
            <p className="text-sm font-medium text-white/70 mt-1">
              Every action Alloro completes for you will show up here.
            </p>
          </>
        )}
        {data.agentOutputs > 0 && (
          <p className="text-xs text-white/50 mt-2">
            {data.agentOutputs} agent scans ran on your behalf
          </p>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {data.currentPosition && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <div className="flex items-center justify-center gap-1.5">
              <p className="text-2xl font-black text-[#212D40]">#{data.currentPosition}</p>
              {posUp && (
                <span className="flex items-center text-xs font-bold text-emerald-600">
                  <TrendingUp className="h-3 w-3" />+{data.positionDelta}
                </span>
              )}
              {posDown && (
                <span className="flex items-center text-xs font-bold text-red-500">
                  <TrendingDown className="h-3 w-3" />{data.positionDelta}
                </span>
              )}
            </div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-1">
              Current Rank
            </p>
            {data.startPosition && (
              <p className="text-[11px] text-gray-400 mt-0.5">
                Started at #{data.startPosition}
              </p>
            )}
          </div>
        )}

        {data.reviewsGained != null && (
          <StatCard
            label="Reviews Gained"
            value={`+${data.reviewsGained}`}
            detail="New Google reviews"
            color="text-emerald-600"
          />
        )}

        {data.currentScore != null && (
          <StatCard
            label="Current Score"
            value={`${data.currentScore}`}
            detail={data.startScore ? `Started at ${data.startScore}` : "/100"}
          />
        )}

        {data.estimatedRevenueImpact > 0 && (
          <StatCard
            label="Est. Revenue Impact"
            value={`$${Math.round(data.estimatedRevenueImpact / 1000)}K`}
            detail="Annual estimated value"
          />
        )}
      </div>
    </div>
  );
}

// ─── Section 2: Goal Progress ───────────────────────────────────────

function GoalProgressSection({
  goals,
  onSetGoals,
}: {
  goals: Goals | null;
  onSetGoals: (goals: Goals) => void;
}) {
  const [showGoalPrompt, setShowGoalPrompt] = useState(false);
  const [sellByInput, setSellByInput] = useState("");

  if (!goals?.sellBy && !showGoalPrompt) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-[#D56753]" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#D56753]">
            Goal Progress
          </h2>
        </div>
        <div className="border-2 border-dashed border-[#D56753]/20 rounded-2xl p-6 text-center">
          <p className="text-base font-bold text-[#212D40]">
            When do you want to be able to sell this business?
          </p>
          <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto">
            Setting a timeline shapes every recommendation Alloro makes. Your answer stays private.
          </p>
          <button
            onClick={() => setShowGoalPrompt(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#D56753] text-white text-sm font-semibold px-5 py-2.5 shadow-[0_4px_14px_rgba(213,103,83,0.35)] hover:brightness-105 transition-all"
          >
            Set my timeline
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  if (showGoalPrompt && !goals?.sellBy) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-[#D56753]" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#D56753]">
            Set Your Goal
          </h2>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <p className="text-sm font-bold text-[#212D40] mb-3">
            When would you like to be in a position to sell?
          </p>
          <div className="grid grid-cols-2 sm:flex gap-2">
            {["3 years", "5 years", "7 years", "10 years"].map((opt) => (
              <button
                key={opt}
                onClick={() => {
                  setSellByInput(opt);
                  onSetGoals({ sellBy: opt });
                  setShowGoalPrompt(false);
                }}
                className={`flex-1 rounded-xl border px-3 py-3 text-sm font-semibold transition-all ${
                  sellByInput === opt
                    ? "border-[#D56753] bg-[#D56753]/5 text-[#D56753]"
                    : "border-gray-200 text-[#212D40] hover:border-[#D56753]/30"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Goals are set — show progress bars
  const sellByYears = parseInt(goals?.sellBy || "5", 10);
  const yearsPassed = 1; // first year
  const pctComplete = Math.min(100, Math.round((yearsPassed / sellByYears) * 100));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Target className="h-5 w-5 text-[#D56753]" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-[#D56753]">
          Goal Progress
        </h2>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
        <p className="text-sm text-gray-500">
          Timeline: <span className="font-bold text-[#212D40]">{goals?.sellBy || "5 years"}</span> to sale-ready
        </p>

        {/* Overall progress */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-[#212D40]">Overall Progress</span>
            <span className="text-xs font-bold text-[#D56753]">{pctComplete}%</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#D56753] rounded-full transition-all duration-1000"
              style={{ width: `${pctComplete}%` }}
            />
          </div>
        </div>

        {/* Milestone bars */}
        {[
          { label: "Year 1: Foundation", target: 1, desc: "Reviews, GBP, online presence" },
          { label: `Year ${Math.ceil(sellByYears / 2)}: Growth`, target: Math.ceil(sellByYears / 2), desc: "Market leadership, referral network" },
          { label: `Year ${sellByYears}: Sale-Ready`, target: sellByYears, desc: "Systemized, valued, transferable" },
        ].map((milestone) => {
          const mPct = Math.min(100, Math.round((yearsPassed / milestone.target) * 100));
          return (
            <div key={milestone.label}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-[#212D40]">{milestone.label}</span>
                <span className="text-[11px] text-gray-400">{mPct}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    mPct >= 100 ? "bg-emerald-500" : mPct >= 50 ? "bg-amber-400" : "bg-[#D56753]"
                  }`}
                  style={{ width: `${mPct}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-1">{milestone.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Section 3: This Year's Moves ───────────────────────────────────

function TopMovesSection({ moves }: { moves: TopMove[] }) {
  if (moves.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Award className="h-5 w-5 text-[#D56753]" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#D56753]">
            This Year's Moves
          </h2>
        </div>
        <div className="border border-dashed border-gray-200 rounded-2xl p-6 text-center text-gray-400">
          <p className="text-sm">Your most impactful actions will appear here as they're completed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Award className="h-5 w-5 text-[#D56753]" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-[#D56753]">
          This Year's Moves
        </h2>
      </div>
      <div className="space-y-3">
        {moves.map((move, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#212D40]">{move.title}</p>
                <p className="text-xs text-emerald-600 font-medium mt-1">{move.outcome}</p>
                <p className="text-[11px] text-gray-400 mt-1">
                  {new Date(move.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Section 4: Next 90 Days ────────────────────────────────────────

function Next90DaysSection({ actions }: { actions: Next90Action[] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Zap className="h-5 w-5 text-[#D56753]" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-[#D56753]">
          Next 90 Days
        </h2>
      </div>
      <div className="space-y-3">
        {actions.map((action, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-[#D56753] text-white flex items-center justify-center text-xs font-bold mt-0.5">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-bold text-[#212D40]">{action.title}</p>
                <p className="text-xs text-gray-500 leading-relaxed mt-1.5">{action.why}</p>
                <p className="text-xs font-semibold text-[#D56753] mt-2">{action.impact}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Section: Your Year (Enhanced) ──────────────────────────────────

function YourYearSection({ data }: { data: EnhancedYearSummary }) {
  const startStr = new Date(data.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Calendar className="h-5 w-5 text-[#D56753]" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-[#D56753]">Your Year</h2>
      </div>

      <div className="bg-[#212D40] rounded-2xl p-4 sm:p-6 text-center text-white">
        <p className="text-3xl sm:text-5xl font-black tabular-nums">{data.days_active}</p>
        <p className="text-sm font-medium text-white/70 mt-1">days active since {startStr}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {data.current_position != null && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <div className="flex items-center justify-center gap-1.5">
              <p className="text-2xl font-black text-[#212D40]">#{data.current_position}</p>
              {data.positions_gained != null && data.positions_gained > 0 && (
                <span className="flex items-center text-xs font-bold text-emerald-600">
                  <TrendingUp className="h-3 w-3" />+{data.positions_gained}
                </span>
              )}
              {data.positions_gained != null && data.positions_gained < 0 && (
                <span className="flex items-center text-xs font-bold text-red-500">
                  <TrendingDown className="h-3 w-3" />{data.positions_gained}
                </span>
              )}
            </div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-1">Current Rank</p>
            {data.start_position && <p className="text-[11px] text-gray-400 mt-0.5">Started at #{data.start_position}</p>}
          </div>
        )}

        {data.reviews_gained != null && (
          <StatCard label="Reviews Gained" value={`+${data.reviews_gained}`} detail="New Google reviews" color="text-emerald-600" />
        )}

        <StatCard label="GPs Retained" value={String(data.gps_retained)} detail="Active first 30d and last 30d" />
        <StatCard label="GPs Lost" value={String(data.gps_lost)} detail="Active first 30d, not last 30d" color={data.gps_lost > 0 ? "text-red-500" : "text-emerald-600"} />
      </div>
    </div>
  );
}

// ─── Section: Key Moments ───────────────────────────────────────────

const MILESTONE_EMOJI: Record<string, string> = {
  rank_up: "📈",
  passed_competitor: "🏆",
  review_count_milestone: "⭐",
};

function KeyMomentsSection({ milestones }: { milestones: Milestone[] }) {
  if (milestones.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Award className="h-5 w-5 text-[#D56753]" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#D56753]">Key Moments</h2>
        </div>
        <div className="border border-dashed border-gray-200 rounded-2xl p-6 text-center text-gray-400">
          <p className="text-sm">Your milestones will appear here as they happen.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Award className="h-5 w-5 text-[#D56753]" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-[#D56753]">Key Moments</h2>
      </div>
      <div className="space-y-3">
        {milestones.map((m) => (
          <div key={m.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-3">
            <span className="text-2xl shrink-0">{MILESTONE_EMOJI[m.type] || "📌"}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#212D40]">{m.headline}</p>
              {m.detail && <p className="text-xs text-gray-500 mt-0.5">{m.detail}</p>}
              <p className="text-[11px] text-gray-400 mt-1">
                {new Date(m.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Section: Trajectory ────────────────────────────────────────────

function TrajectorySection({ statements }: { statements: string[] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Zap className="h-5 w-5 text-[#D56753]" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-[#D56753]">Next 90 Days</h2>
      </div>
      <div className="space-y-3">
        {statements.map((stmt, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-[#D56753] text-white flex items-center justify-center text-xs font-bold mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm font-semibold text-[#212D40] leading-relaxed">{stmt}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Intelligence Building State (new accounts) ───────────────────

interface CheckupContext {
  score: number | null;
  data: {
    market?: {
      rank?: number;
      totalCompetitors?: number;
      city?: string;
      avgRating?: number;
      avgReviews?: number;
    };
    topCompetitor?: {
      name?: string;
      reviewCount?: number;
      rating?: number;
    };
    score?: {
      localVisibility?: number;
      onlinePresence?: number;
      reviewHealth?: number;
      visibility?: number;
    };
    place?: { rating?: number };
  };
  top_competitor_name?: string | null;
}

interface StreakInfo {
  type: string;
  count: number;
  label: string;
}

function isProgressEmpty(
  enhanced: EnhancedProgressData | null | undefined,
  data: ProgressData | null | undefined,
): boolean {
  if (!enhanced && !data) return true;

  const noMilestones = !enhanced?.milestones || enhanced.milestones.length === 0;
  const noTrajectory =
    !enhanced?.trajectory_statements ||
    enhanced.trajectory_statements.length === 0 ||
    (enhanced.trajectory_statements.length === 1 &&
      enhanced.trajectory_statements[0].includes("first trajectory projection"));
  const noPositionGain =
    enhanced?.year_summary?.positions_gained == null ||
    enhanced.year_summary.positions_gained === 0;
  const noTasks = !data?.yearInReview || data.yearInReview.tasksCompleted === 0;
  const noMoves = !data?.topMoves || data.topMoves.length === 0;

  return noMilestones && noTrajectory && noPositionGain && noTasks && noMoves;
}

function IntelligenceBuildingState({
  checkupCtx,
  streak,
  daysActive,
}: {
  checkupCtx: CheckupContext | null;
  streak: StreakInfo | null;
  daysActive: number;
}) {
  const score = checkupCtx?.score;
  const market = checkupCtx?.data?.market;
  const rank = market?.rank;
  const totalCompetitors = market?.totalCompetitors;
  const city = market?.city;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="bg-[#212D40] rounded-2xl p-5 sm:p-8 text-center text-white">
        <Search className="h-8 w-8 mx-auto mb-3 text-white/50" />
        <p className="text-xl sm:text-2xl font-extrabold">Your intelligence is building.</p>
        <p className="text-sm text-white/60 mt-2 max-w-md mx-auto">
          Alloro is watching your market, tracking competitors, and building the data needed for
          your full progress report.
        </p>
      </div>

      {/* Checkup snapshot */}
      {score != null && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <p className="text-xs font-bold uppercase tracking-widest text-[#D56753]">
            What we know so far
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <p className="text-3xl font-black text-[#212D40] tabular-nums">{Math.round(score)}</p>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-1">
                Checkup Score
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">/100</p>
            </div>
            {rank != null && (
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-3xl font-black text-[#212D40] tabular-nums">#{rank}</p>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-1">
                  Market Position
                </p>
                {totalCompetitors && (
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    of {totalCompetitors} competitors
                  </p>
                )}
              </div>
            )}
          </div>

          {totalCompetitors != null && city && (
            <p className="text-sm text-[#212D40]/80 leading-relaxed">
              Alloro found {totalCompetitors} competitors in {city}.
              {rank != null ? ` Your position: #${rank}.` : ""}
            </p>
          )}
        </div>
      )}

      {/* Streak */}
      {streak && streak.count >= 2 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#D56753]/10 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-[#D56753]" />
          </div>
          <div>
            <p className="text-sm font-bold text-[#212D40]">
              Week {streak.count} of {streak.label}
            </p>
            <p className="text-xs text-gray-500">
              Every week adds another data point to your trajectory.
            </p>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-[#D56753] mb-4">
          What happens next
        </p>
        <div className="space-y-4">
          {[
            {
              week: "Week 1",
              label: "Market mapped",
              desc: "Competitors identified, baseline scores captured.",
              done: daysActive >= 7,
            },
            {
              week: "Week 2",
              label: "First patterns detected",
              desc: "Review velocity, competitor movement, and ranking shifts.",
              done: daysActive >= 14,
            },
            {
              week: "Week 4",
              label: "Full trajectory available",
              desc: "Projections, milestones, and your complete progress report.",
              done: daysActive >= 30,
            },
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                  step.done
                    ? "bg-emerald-100 text-emerald-600"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                {step.done ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <span className="text-xs font-bold">{i + 1}</span>
                )}
              </div>
              <div>
                <p className="text-sm font-bold text-[#212D40]">
                  {step.week}: {step.label}
                  {step.done && (
                    <span className="text-emerald-600 text-xs font-medium ml-2">Done</span>
                  )}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export default function ProgressReport() {
  const { userProfile } = useAuth();
  const practiceName = userProfile?.practiceName || "Your Business";
  const firstName = userProfile?.firstName || "there";

  const { data, isLoading, isError: isProgressError } = useQuery({
    queryKey: ["progress-report"],
    queryFn: async () => {
      const res = await apiGet({ path: "/progress-report" });
      return res?.success ? res.data as ProgressData : null;
    },
    staleTime: 5 * 60_000,
  });

  const { data: enhanced, isError: isEnhancedError } = useQuery({
    queryKey: ["user-progress-report"],
    queryFn: async () => {
      const res = await apiGet({ path: "/user/progress-report" });
      return res?.success ? res.data as EnhancedProgressData : null;
    },
    staleTime: 5 * 60_000,
  });

  // Checkup context for new-account fallback
  const { data: dashCtx } = useQuery({
    queryKey: ["dashboard-context"],
    queryFn: async () => {
      const res = await apiGet({ path: "/user/dashboard-context" });
      return res?.success ? res : null;
    },
    staleTime: 30 * 60_000,
  });
  const checkupCtx = (dashCtx?.checkup_context as CheckupContext) ?? null;

  // Streak data
  const { data: streaksResponse } = useQuery({
    queryKey: ["user-streaks-progress"],
    queryFn: async () => {
      const res = await apiGet({ path: "/user/streaks" });
      return res?.success ? { streak: res.streak as StreakInfo | null } : { streak: null };
    },
    staleTime: 10 * 60_000,
  });
  const streakData = streaksResponse?.streak ?? null;

  const daysActive = enhanced?.year_summary?.days_active ?? 0;
  const showIntelligenceBuilding = isProgressEmpty(enhanced, data) && checkupCtx != null;

  const handleSetGoals = async (goals: Goals) => {
    // Save goals to org setup_progress
    await apiPatch({
      path: "/onboarding/setup-progress",
      passedData: { goals },
    }).catch(() => {});
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-10">
      {/* Header */}
      <div className="text-center">
        <p className="text-xs font-semibold tracking-widest text-[#D56753] uppercase mb-2">
          365-Day Progress Report
        </p>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#212D40] tracking-tight">
          {practiceName}
        </h1>
        <p className="text-sm text-gray-500 mt-2">
          {firstName}, here's everything that happened for your business this year.
        </p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl border border-gray-200 bg-white" />
          ))}
        </div>
      )}

      {/* New account: intelligence building state */}
      {!isLoading && showIntelligenceBuilding && (
        <IntelligenceBuildingState
          checkupCtx={checkupCtx}
          streak={streakData}
          daysActive={daysActive}
        />
      )}

      {/* 90/180/365-Day Milestone Story (WO-44) */}
      {!showIntelligenceBuilding && enhanced?.year_summary && (() => {
        const days = enhanced.year_summary.days_active;
        const milestone = days >= 365 ? 365 : days >= 180 ? 180 : days >= 90 ? 90 : null;
        if (!milestone) return null;
        const s = enhanced.year_summary;
        const weeksWatched = Math.floor(days / 7);
        return (
          <div className="bg-[#D56753] rounded-2xl p-4 sm:p-6 text-white">
            <p className="text-xs font-bold uppercase tracking-widest text-white/50 mb-3">
              Your first {milestone} days with Alloro.
            </p>
            <div className="space-y-2 text-sm leading-relaxed">
              {s.start_position && s.current_position && (
                <p>Started: #{s.start_position}. Today: #{s.current_position}.</p>
              )}
              <p>{weeksWatched} Monday{weeksWatched !== 1 ? "s" : ""} watched your market while you were with clients.</p>
              {(s.competitor_moves_caught ?? 0) > 0 && (
                <p>{s.competitor_moves_caught} competitor move{s.competitor_moves_caught !== 1 ? "s" : ""} caught before you noticed them.</p>
              )}
              {s.first_win_date && (
                <p>1 relationship you almost lost that came back.</p>
              )}
            </div>
            <p className="text-white/60 text-xs mt-4">
              You didn't do most of this. It happened while you were with customers.
            </p>
          </div>
        );
      })()}

      {/* Content -- only when not in intelligence-building state */}
      {!showIntelligenceBuilding && data && (
        <>
          {/* Enhanced Your Year section if available, else original */}
          {enhanced?.year_summary ? (
            <YourYearSection data={enhanced.year_summary} />
          ) : (
            <YearInReviewSection data={data.yearInReview} />
          )}

          {/* Key Moments from milestones */}
          {enhanced?.milestones && <KeyMomentsSection milestones={enhanced.milestones} />}

          <GoalProgressSection goals={data.goals} onSetGoals={handleSetGoals} />
          <TopMovesSection moves={data.topMoves} />

          {/* Trajectory statements if available, else original Next 90 */}
          {enhanced?.trajectory_statements && enhanced.trajectory_statements.length > 0 ? (
            <TrajectorySection statements={enhanced.trajectory_statements} />
          ) : (
            <Next90DaysSection actions={data.next90Days} />
          )}
        </>
      )}

      {/* Error state */}
      {(isProgressError || isEnhancedError) && (
        <p className="text-sm text-gray-500">Progress data is being compiled. Check back Monday.</p>
      )}

      {/* No data state -- only when intelligence building isn't shown */}
      {!isLoading && !isProgressError && !data && !showIntelligenceBuilding && (
        <div className="rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-400">
          <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-base font-medium">Your first progress report is building.</p>
          <p className="text-sm mt-1">Check back after your first week with Alloro.</p>
        </div>
      )}

      {/* Footer */}
      <div className="text-center pt-4 border-t border-gray-100">
        <p className="text-[11px] text-gray-300 uppercase tracking-wide">
          Generated by Alloro &middot; {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>
    </div>
  );
}
