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
  color = "text-[#212D40]",
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
      <div className="bg-[#212D40] rounded-2xl p-6 text-center text-white">
        <p className="text-5xl font-black tabular-nums">{data.tasksCompleted}</p>
        <p className="text-sm font-medium text-white/70 mt-1">
          Alloro tasks completed in the last 365 days
        </p>
        {data.agentOutputs > 0 && (
          <p className="text-xs text-white/50 mt-2">
            {data.agentOutputs} agent scans ran on your behalf
          </p>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
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
          <div className="flex gap-2">
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

      <div className="bg-[#212D40] rounded-2xl p-6 text-center text-white">
        <p className="text-5xl font-black tabular-nums">{data.days_active}</p>
        <p className="text-sm font-medium text-white/70 mt-1">days active since {startStr}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
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

// ─── Main Component ─────────────────────────────────────────────────

export default function ProgressReport() {
  const { userProfile } = useAuth();
  const practiceName = userProfile?.practiceName || "Your Business";
  const firstName = userProfile?.firstName || "there";

  const { data, isLoading } = useQuery({
    queryKey: ["progress-report"],
    queryFn: async () => {
      const res = await apiGet({ path: "/progress-report" });
      return res?.success ? res.data as ProgressData : null;
    },
    staleTime: 5 * 60_000,
  });

  const { data: enhanced } = useQuery({
    queryKey: ["user-progress-report"],
    queryFn: async () => {
      const res = await apiGet({ path: "/user/progress-report" });
      return res?.success ? res.data as EnhancedProgressData : null;
    },
    staleTime: 5 * 60_000,
  });

  const handleSetGoals = async (goals: Goals) => {
    // Save goals to org setup_progress
    await apiPatch({
      path: "/settings/setup-progress",
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
          {firstName}, here's everything Alloro has done for your business this year.
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

      {/* Content */}
      {data && (
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

      {/* No data state */}
      {!isLoading && !data && (
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
