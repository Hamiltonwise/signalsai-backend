/**
 * Score History Chart
 *
 * Small sparkline showing the Business Clarity Score over time.
 * Data comes from the score_history JSONB column on organizations.
 *
 * X axis: weeks
 * Y axis: score 0-100
 * Terracotta line (#D56753)
 *
 * Renders below the score ring on the dashboard.
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/api/index";
import { warmCardVariants } from "@/lib/animations";

interface ScorePoint {
  score: number;
  date: string;
}

function Sparkline({ data, width = 280, height = 60 }: { data: ScorePoint[]; width?: number; height?: number }) {
  const points = useMemo(() => {
    if (data.length < 2) return "";

    const minScore = Math.max(0, Math.min(...data.map((d) => d.score)) - 5);
    const maxScore = Math.min(100, Math.max(...data.map((d) => d.score)) + 5);
    const range = maxScore - minScore || 1;

    return data
      .map((d, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((d.score - minScore) / range) * height;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }, [data, width, height]);

  if (data.length < 2) return null;

  // Gradient fill path (close the shape at the bottom)
  const minScore = Math.max(0, Math.min(...data.map((d) => d.score)) - 5);
  const maxScore = Math.min(100, Math.max(...data.map((d) => d.score)) + 5);
  const range = maxScore - minScore || 1;

  const lastX = ((data.length - 1) / (data.length - 1)) * width;
  const lastY = height - ((data[data.length - 1].score - minScore) / range) * height;
  const fillPath = `${points} L ${lastX.toFixed(1)} ${height} L 0 ${height} Z`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#D56753" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#D56753" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Fill area */}
      <path d={fillPath} fill="url(#scoreGradient)" />
      {/* Line */}
      <path
        d={points}
        fill="none"
        stroke="#D56753"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Latest point dot */}
      <circle
        cx={lastX}
        cy={lastY}
        r="3"
        fill="#D56753"
        stroke="white"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export default function ScoreHistory() {
  const { data: dashData } = useQuery({
    queryKey: ["dashboard-context"],
    queryFn: () => apiGet({ path: "/user/dashboard-context" }),
    staleTime: 5 * 60 * 1000,
  });

  const scoreHistory: ScorePoint[] = useMemo(() => {
    const history = dashData?.score_history;
    if (!history) return [];
    const parsed = typeof history === "string" ? JSON.parse(history) : history;
    if (!Array.isArray(parsed)) return [];
    return parsed;
  }, [dashData]);

  // If only 1 or 0 data points, show a friendly message
  if (scoreHistory.length <= 1) {
    return (
      <motion.div variants={warmCardVariants} className="card-primary">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#D56753]/10 to-[#D56753]/5 flex items-center justify-center">
            <TrendingUp className="w-3.5 h-3.5 text-[#D56753]" />
          </div>
          <p className="text-sm font-semibold text-[#1A1D23]">Score History</p>
        </div>
        <p className="text-xs text-gray-400 leading-relaxed">
          Your score history builds weekly. Check back Monday.
        </p>
      </motion.div>
    );
  }

  // Calculate trend
  const oldest = scoreHistory[0].score;
  const newest = scoreHistory[scoreHistory.length - 1].score;
  const totalDelta = newest - oldest;
  const weeks = scoreHistory.length;
  const trendUp = totalDelta > 0;
  const trendDown = totalDelta < 0;

  return (
    <motion.div variants={warmCardVariants} className="card-primary">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#D56753]/10 to-[#D56753]/5 flex items-center justify-center">
            {trendUp ? (
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
            ) : trendDown ? (
              <TrendingDown className="w-3.5 h-3.5 text-amber-600" />
            ) : (
              <TrendingUp className="w-3.5 h-3.5 text-[#D56753]" />
            )}
          </div>
          <p className="text-sm font-semibold text-[#1A1D23]">Score History</p>
        </div>
        {totalDelta !== 0 && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${
            trendUp
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}>
            {trendUp ? "+" : ""}{totalDelta} point{Math.abs(totalDelta) !== 1 ? "s" : ""} in {weeks} week{weeks !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="flex justify-center">
        <Sparkline data={scoreHistory} width={280} height={56} />
      </div>

      {/* Week labels */}
      <div className="flex justify-between mt-2 px-1">
        <span className="text-xs text-gray-400">
          {new Date(scoreHistory[0].date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
        <span className="text-xs text-gray-400">
          {new Date(scoreHistory[scoreHistory.length - 1].date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      </div>
    </motion.div>
  );
}
