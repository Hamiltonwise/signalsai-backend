/**
 * Score Improvement Plan
 *
 * Shows EXACTLY how to improve the Business Clarity Score.
 * Identifies the 3 biggest point gaps and gives specific,
 * actionable steps with estimated gains.
 *
 * Renders below the score ring on the dashboard.
 */

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Circle,
  TrendingUp,
  Clock,
  Zap,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { apiGet } from "@/api/index";
import { warmCardVariants } from "@/lib/animations";

interface ImprovementAction {
  id: string;
  action: string;
  subScore: string;
  currentPoints: number;
  maxPoints: number;
  estimatedGain: number;
  difficulty: "easy" | "medium" | "hard";
  timeEstimate: string;
}

interface ImprovementPlanData {
  actions: ImprovementAction[];
  totalPotentialGain: number;
  currentScore: number | null;
  estimatedNewScore: number | null;
}

const COMPLETED_KEY = "alloro_improvement_completed";

function getCompletedActions(): string[] {
  try {
    const stored = localStorage.getItem(COMPLETED_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function setCompletedActions(ids: string[]) {
  localStorage.setItem(COMPLETED_KEY, JSON.stringify(ids));
}

const difficultyConfig = {
  easy: { label: "Easy", color: "text-green-600", bg: "bg-green-50", border: "border-green-100" },
  medium: { label: "Medium", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-100" },
  hard: { label: "Hard", color: "text-red-600", bg: "bg-red-50", border: "border-red-100" },
};

export default function ScoreImprovementPlan() {
  const [completedIds, setCompletedIds] = useState<string[]>(getCompletedActions);
  const [expanded, setExpanded] = useState(true);

  const { data, isLoading } = useQuery<ImprovementPlanData>({
    queryKey: ["improvement-plan"],
    queryFn: async () => {
      const res = await apiGet({ path: "/user/improvement-plan" });
      if (!res?.success) throw new Error("Failed to load plan");
      return res;
    },
    staleTime: 30 * 60_000,
  });

  // Sync localStorage on change
  useEffect(() => {
    setCompletedActions(completedIds);
  }, [completedIds]);

  const toggleCompleted = (id: string) => {
    setCompletedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  if (isLoading) {
    return (
      <div className="bg-white border border-black/5 rounded-2xl p-6 animate-pulse">
        <div className="h-5 w-48 bg-slate-100 rounded mb-4" />
        <div className="space-y-3">
          <div className="h-16 bg-slate-50 rounded-xl" />
          <div className="h-16 bg-slate-50 rounded-xl" />
          <div className="h-16 bg-slate-50 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data || data.actions.length === 0) return null;

  const { actions, totalPotentialGain, currentScore, estimatedNewScore } = data;
  const completedCount = actions.filter((a) => completedIds.includes(a.id)).length;
  const allDone = completedCount === actions.length;

  return (
    <motion.div
      variants={warmCardVariants}
      className="bg-white border border-black/5 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-5 pb-4 text-left cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#D56753] to-[#D56753]/80 flex items-center justify-center shadow-sm">
            <TrendingUp size={16} className="text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#212D40] tracking-tight">
              Score Improvement Plan
            </h3>
            {currentScore != null && estimatedNewScore != null && !allDone && (
              <p className="text-xs text-[#212D40]/50 mt-0.5">
                {currentScore} pts now. Reach{" "}
                <span className="font-bold text-[#D56753]">
                  {estimatedNewScore}
                </span>{" "}
                with {actions.length - completedCount} action{actions.length - completedCount !== 1 ? "s" : ""}.
              </p>
            )}
            {allDone && (
              <p className="text-xs text-green-600 font-semibold mt-0.5">
                All actions complete. Your score will update on next scan.
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Progress indicator */}
          <div className="flex gap-1">
            {actions.map((a) => (
              <div
                key={a.id}
                className={`w-2 h-2 rounded-full transition-colors ${
                  completedIds.includes(a.id)
                    ? "bg-green-500"
                    : "bg-slate-200"
                }`}
              />
            ))}
          </div>
          {expanded ? (
            <ChevronUp size={16} className="text-slate-400" />
          ) : (
            <ChevronDown size={16} className="text-slate-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-2.5">
          {actions.map((action) => {
            const isCompleted = completedIds.includes(action.id);
            const diff = difficultyConfig[action.difficulty];

            return (
              <div
                key={action.id}
                className={`group flex gap-3 p-3.5 rounded-xl border transition-all ${
                  isCompleted
                    ? "bg-green-50/50 border-green-100"
                    : "bg-slate-50/50 border-slate-100 hover:border-[#D56753]/20 hover:bg-white"
                }`}
              >
                {/* Checkbox */}
                <button
                  onClick={() => toggleCompleted(action.id)}
                  className="mt-0.5 shrink-0 cursor-pointer"
                  aria-label={isCompleted ? "Mark incomplete" : "Mark complete"}
                >
                  {isCompleted ? (
                    <CheckCircle2
                      size={20}
                      className="text-green-500"
                    />
                  ) : (
                    <Circle
                      size={20}
                      className="text-slate-300 group-hover:text-[#D56753]/60 transition-colors"
                    />
                  )}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm leading-relaxed ${
                      isCompleted
                        ? "text-[#212D40]/40 line-through"
                        : "text-[#212D40]/80"
                    }`}
                  >
                    {action.action}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-xs font-bold text-[#D56753] bg-[#D56753]/10 px-2 py-0.5 rounded-md">
                      +{action.estimatedGain} pts
                    </span>
                    <span className={`text-xs font-bold ${diff.color} ${diff.bg} px-2 py-0.5 rounded-md border ${diff.border}`}>
                      {diff.label}
                    </span>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock size={10} /> {action.timeEstimate}
                    </span>
                    <span className="text-xs text-slate-400">
                      {action.subScore}: {action.currentPoints}/{action.maxPoints}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Total potential gain summary */}
          {!allDone && (
            <div className="flex items-center gap-2 pt-2 pl-1">
              <Zap size={14} className="text-[#D56753]" />
              <p className="text-xs text-[#212D40]/60">
                Complete all {actions.length} actions to add up to{" "}
                <span className="font-bold text-[#D56753]">
                  +{totalPotentialGain} points
                </span>{" "}
                to your score.
              </p>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
