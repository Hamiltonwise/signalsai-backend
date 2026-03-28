/**
 * StreakBadge -- Duolingo-style streak counter for the dashboard.
 *
 * Three streak types: growth (score held/improved), reviews (added weekly),
 * actions (acted on One Action Card). Shows the highest active streak.
 *
 * Psychology: Variable ratio reinforcement (Skinner), progress visibility
 * (Habit Architecture doc). Streak >= 2 weeks to display.
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

export default function StreakBadge({ type, count, label }: StreakBadgeProps) {
  const config = STREAK_CONFIG[type] || STREAK_CONFIG.actions;
  const Icon = config.icon;

  return (
    <div
      className={`flex items-center gap-3 rounded-xl ${config.bg} ${config.border} border px-4 py-3 ring-2 ${config.ring}`}
    >
      <div className="flex items-center gap-1.5">
        <Icon className={`w-5 h-5 ${config.color}`} />
        <span className={`text-2xl font-extrabold ${config.color} tabular-nums`}>
          {count}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-bold ${config.color} uppercase tracking-wide`}>
          Week streak
        </p>
        <p className="text-[11px] text-gray-500 truncate">
          {label}
        </p>
      </div>
    </div>
  );
}
