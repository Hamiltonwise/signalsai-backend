import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface CompletionRingProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
}

export function CompletionRing({
  percentage,
  size = 80,
  strokeWidth = 6,
}: CompletionRingProps) {
  const [animatedPct, setAnimatedPct] = useState(0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animatedPct / 100) * circumference;

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedPct(percentage), 100);
    return () => clearTimeout(timer);
  }, [percentage]);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-200"
        />
        {/* Progress */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#D66853"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </svg>
      <span className="absolute text-sm font-bold text-gray-900">
        {Math.round(percentage)}%
      </span>
    </div>
  );
}
