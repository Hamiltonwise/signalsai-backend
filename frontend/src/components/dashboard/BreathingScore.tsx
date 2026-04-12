/**
 * Breathing Score -- the pulse of your business health.
 *
 * A single animated ring that shows at-a-glance how your readings look.
 * Not a number to optimize. A temperature to feel. Like checking your
 * resting heart rate on Oura -- green means you're good, amber means
 * pay attention, red means act now.
 *
 * The ring fills based on the proportion of healthy readings.
 * The color shifts with status. The delta badge shows direction.
 * Hover reveals which readings drive the temperature.
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Reading {
  label: string;
  status: "healthy" | "attention" | "critical";
}

interface BreathingScoreProps {
  readings: Reading[];
  /** Previous week's healthy fraction (0-1) for delta calculation */
  previousHealthFraction?: number | null;
}

function computeHealth(readings: Reading[]) {
  if (readings.length === 0) return { fraction: 0, status: "healthy" as const, summary: "No readings yet" };

  const weights = { healthy: 1, attention: 0.5, critical: 0 };
  const total = readings.reduce((sum, r) => sum + weights[r.status], 0);
  const fraction = total / readings.length;

  const criticalCount = readings.filter(r => r.status === "critical").length;
  const attentionCount = readings.filter(r => r.status === "attention").length;
  const healthyCount = readings.filter(r => r.status === "healthy").length;

  let status: "healthy" | "attention" | "critical";
  if (criticalCount > 0) status = "critical";
  else if (attentionCount > healthyCount) status = "attention";
  else if (fraction >= 0.7) status = "healthy";
  else status = "attention";

  let summary: string;
  if (status === "healthy") {
    summary = "Your readings look good.";
  } else if (status === "critical") {
    const critLabels = readings.filter(r => r.status === "critical").map(r => r.label);
    summary = `${critLabels.join(" and ")} need${critLabels.length === 1 ? "s" : ""} attention.`;
  } else {
    const attLabels = readings.filter(r => r.status === "attention").map(r => r.label);
    summary = attLabels.length === 1
      ? `${attLabels[0]} could be stronger.`
      : `${attLabels.slice(0, 2).join(" and ")} could be stronger.`;
  }

  return { fraction, status, summary };
}

const STATUS_COLORS = {
  healthy: { ring: "#10b981", glow: "rgba(16, 185, 129, 0.15)", text: "text-emerald-600", bg: "bg-emerald-50" },
  attention: { ring: "#f59e0b", glow: "rgba(245, 158, 11, 0.15)", text: "text-amber-600", bg: "bg-amber-50" },
  critical: { ring: "#ef4444", glow: "rgba(239, 68, 68, 0.15)", text: "text-red-600", bg: "bg-red-50" },
};

const STATUS_LABELS = {
  healthy: "Looking good",
  attention: "Worth watching",
  critical: "Needs attention",
};

export default function BreathingScore({ readings, previousHealthFraction }: BreathingScoreProps) {
  const { fraction, status, summary } = computeHealth(readings);
  const colors = STATUS_COLORS[status];
  const [showDetail, setShowDetail] = useState(false);
  const [animatedFraction, setAnimatedFraction] = useState(0);
  const detailRef = useRef<HTMLDivElement>(null);

  // Animate the ring fill on mount
  useEffect(() => {
    const timer = setTimeout(() => setAnimatedFraction(fraction), 100);
    return () => clearTimeout(timer);
  }, [fraction]);

  // Close detail on outside click
  useEffect(() => {
    if (!showDetail) return;
    function handleClick(e: MouseEvent) {
      if (detailRef.current && !detailRef.current.contains(e.target as Node)) {
        setShowDetail(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showDetail]);

  // Delta calculation
  const delta = previousHealthFraction != null
    ? fraction - previousHealthFraction
    : null;

  // SVG ring params
  const size = 72;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - animatedFraction);

  return (
    <div className="relative" ref={detailRef}>
      <button
        onClick={() => setShowDetail(!showDetail)}
        className="flex items-center gap-4 rounded-2xl bg-stone-50/80 border border-stone-200/60 px-5 py-4 w-full text-left hover:bg-stone-100/50 transition-colors"
        aria-label="Business health overview"
      >
        {/* Ring */}
        <div className="relative flex-shrink-0">
          <svg width={size} height={size} className="transform -rotate-90">
            {/* Background track */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#e5e7eb"
              strokeWidth={strokeWidth}
            />
            {/* Animated fill */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={colors.ring}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{
                transition: "stroke-dashoffset 1.2s ease-out, stroke 0.6s ease",
                filter: `drop-shadow(0 0 6px ${colors.glow})`,
              }}
            />
          </svg>
          {/* Center icon */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{
                backgroundColor: colors.ring,
                boxShadow: `0 0 8px ${colors.glow}`,
                animation: "pulse 3s ease-in-out infinite",
              }}
            />
          </div>
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${colors.text}`}>
              {STATUS_LABELS[status]}
            </span>
            {delta != null && Math.abs(delta) > 0.05 && (
              <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${delta > 0 ? "text-emerald-600" : "text-red-500"}`}>
                {delta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {delta > 0 ? "improving" : "declining"}
              </span>
            )}
            {delta != null && Math.abs(delta) <= 0.05 && (
              <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-gray-400">
                <Minus className="w-3 h-3" />
                steady
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5 truncate">{summary}</p>
        </div>
      </button>

      {/* Detail dropdown */}
      <AnimatePresence>
        {showDetail && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="absolute left-0 right-0 top-full mt-2 z-10 rounded-2xl bg-stone-50 border border-stone-200/60 shadow-lg p-4 space-y-2"
          >
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">What drives this</p>
            {readings.map((r) => {
              const dotColor = r.status === "healthy" ? "bg-emerald-500" : r.status === "attention" ? "bg-amber-400" : "bg-red-500";
              return (
                <div key={r.label} className="flex items-center gap-2.5">
                  <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                  <span className="text-sm text-[#1A1D23]">{r.label}</span>
                  <span className="text-xs text-gray-400 ml-auto capitalize">{r.status}</span>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
