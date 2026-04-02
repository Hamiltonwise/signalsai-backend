/**
 * StreakBadge -- Duolingo-style streak counter with milestone celebrations.
 *
 * Three streak types: growth (score held/improved), reviews (added weekly),
 * actions (acted on One Action Card). Shows the highest active streak.
 *
 * Delight moments:
 * - Milestone thresholds (2, 4, 8, 12, 26, 52 weeks) trigger glow animation
 * - Badge pulses when streak increases
 * - Copy changes at milestones to recognize the achievement
 */

import { Flame, TrendingUp, MessageSquare } from "lucide-react";

interface StreakBadgeProps {
  type: "growth" | "reviews" | "actions";
  count: number;
  label: string;
}

const STREAK_CONFIG = {
  growth: {
    icon: TrendingUp,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    ring: "ring-emerald-100",
  },
  reviews: {
    icon: MessageSquare,
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
    ring: "ring-amber-100",
  },
  actions: {
    icon: Flame,
    color: "text-[#D56753]",
    bg: "bg-[#D56753]/5",
    border: "border-[#D56753]/20",
    ring: "ring-[#D56753]/10",
  },
};

const MILESTONES = [2, 4, 8, 12, 26, 52];

function getMilestoneMessage(count: number): string | null {
  if (count === 2) return "Two weeks in. Momentum is building.";
  if (count === 4) return "A month of consistency. That's rare.";
  if (count === 8) return "Two months. You're watching your market like a pro.";
  if (count === 12) return "Three months of consecutive growth. Exceptional.";
  if (count === 26) return "Half a year. Most people quit by now. You didn't.";
  if (count === 52) return "One year. This is who you are now.";
  return null;
}

export default function StreakBadge({ type, count, label }: StreakBadgeProps) {
  const config = STREAK_CONFIG[type] || STREAK_CONFIG.actions;
  const Icon = config.icon;
  const isMilestone = MILESTONES.includes(count);
  const milestoneMessage = getMilestoneMessage(count);

  return (
    <div
      className={`flex items-center gap-3 rounded-xl ${config.bg} ${config.border} border px-4 py-3 ring-2 ${config.ring} transition-all duration-500 ${
        isMilestone ? "animate-milestone-glow" : ""
      }`}
    >
      <div className="flex items-center gap-1.5">
        <Icon className={`w-5 h-5 ${config.color} ${isMilestone ? "animate-score-celebrate" : ""}`} />
        <span className={`text-2xl font-semibold ${config.color} tabular-nums`}>
          {count}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-bold ${config.color} uppercase tracking-wide`}>
          Week streak
        </p>
        <p className="text-xs text-gray-500 truncate">
          {milestoneMessage || label}
        </p>
      </div>
    </div>
  );
}
