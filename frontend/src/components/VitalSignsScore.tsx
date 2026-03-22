import React, { useEffect, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Sparkles,
  Lightbulb,
} from "lucide-react";

// TODO: Create src/utils/dateUtils.ts with getLastFullMonth function
const getLastFullMonth = () => ({
  label: "November",
  month: 11,
  year: 2024,
});

interface VitalSignsScoreProps {
  score: number;
  monthlyChange: number;
  trend: "up" | "down" | "stable";
  lastMonthData?: {
    month: string;
    score: number;
    breakdown: {
      gbpScore: number;
      clarityScore: number;
      pmsScore: number;
    };
  };
}

export const VitalSignsScore: React.FC<VitalSignsScoreProps> = ({
  score,
  monthlyChange,
  trend,
  lastMonthData,
}) => {
  const [animatedScore, setAnimatedScore] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
    // Animate score count-up
    const duration = 2000;
    const steps = 60;
    const increment = score / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= score) {
        setAnimatedScore(score);
        clearInterval(timer);
      } else {
        setAnimatedScore(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [score]);

  const getStatusBadge = () => {
    if (score >= 85)
      return {
        text: "🚀 Improving Fast",
        color: "bg-green-100 text-green-800",
      };
    if (score >= 70)
      return { text: "📈 Steady Growth", color: "bg-blue-100 text-blue-800" };
    if (score >= 55)
      return { text: "✅ Holding Strong", color: "bg-teal-100 text-teal-800" };
    return { text: "🛠 Needs Focus", color: "bg-amber-100 text-amber-800" };
  };

  const getTrendColor = () => {
    if (trend === "up") return "text-green-600";
    if (trend === "down") return "text-amber-600";
    return "text-gray-600";
  };

  const getTrendIcon = () => {
    if (trend === "up") return <TrendingUp className="w-5 h-5" />;
    if (trend === "down") return <TrendingDown className="w-5 h-5" />;
    return <Activity className="w-5 h-5" />;
  };

  const getTrendMessage = () => {
    const lastMonth = getLastFullMonth();
    if (trend === "up" && monthlyChange > 0) {
      return `+${monthlyChange}% growth vs ${lastMonth.label}`;
    } else if (trend === "down" && monthlyChange < 0) {
      return `${monthlyChange}% dip vs ${lastMonth.label} — tracking for improvement`;
    } else {
      return `${Math.abs(monthlyChange)}% change vs ${
        lastMonth.label
      } — steady performance`;
    }
  };

  const statusBadge = getStatusBadge();

  // Calculate progress percentage for visual indicator
  const progressPercentage = Math.min((score / 100) * 100, 100);

  return (
    <div
      className={`bg-white rounded-2xl shadow-xl border border-gray-100 p-8 transition-all duration-1000 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      }`}
    >
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-lg">
            <Activity className="w-8 h-8 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
              Practice Vital Signs
            </h2>
            <p className="text-gray-600">
              Real-time performance across all metrics
            </p>
          </div>
        </div>

        <div className="text-right">
          <span
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${statusBadge.color}`}
          >
            {statusBadge.text}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
        {/* Score Display */}
        <div className="text-center lg:text-left">
          <div className="relative inline-flex items-center justify-center">
            {/* Radial Progress Background */}
            <svg
              className="w-32 h-32 transform -rotate-90"
              viewBox="0 0 120 120"
            >
              <circle
                cx="60"
                cy="60"
                r="50"
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="8"
              />
              <circle
                cx="60"
                cy="60"
                r="50"
                fill="none"
                stroke="url(#scoreGradient)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${progressPercentage * 3.14} 314`}
                className="transition-all duration-2000 ease-out"
              />
              <defs>
                <linearGradient
                  id="scoreGradient"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>

            {/* Score Number */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl font-bold text-gray-900">
                  {animatedScore}
                </div>
                <div className="text-sm text-gray-500 font-medium">
                  Vital Signs
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Trend Information */}
        <div className="space-y-4">
          <div className={`flex items-center gap-3 ${getTrendColor()}`}>
            {getTrendIcon()}
            <span className="text-lg font-semibold">{getTrendMessage()}</span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-600" />
              <span className="text-sm text-gray-700">
                Performance insights updated daily
              </span>
            </div>
            <div className="text-xs text-gray-500">
              Based on website traffic, search visibility, and local presence
              data
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6">
          <h4 className="font-semibold text-gray-900 mb-4">
            This Month's Highlights
          </h4>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Website Performance</span>
              <span className="font-semibold text-blue-600">📈 Growing</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Local Visibility</span>
              <span className="font-semibold text-green-600">✅ Strong</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Patient Engagement</span>
              <span className="font-semibold text-purple-600">
                🚀 Excellent
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Insight */}
      <div className="mt-8 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-200">
        <div className="flex items-center gap-3">
          <Lightbulb className="w-5 h-5 text-blue-600" />
          <div>
            <p className="text-sm font-medium text-blue-900">
              {lastMonthData
                ? `${lastMonthData.month} vital signs: ${lastMonthData.score}/100 with strong performance across digital channels`
                : "Your practice is showing positive momentum across multiple channels"}
            </p>
            <p className="text-xs text-blue-700 mt-1">
              {lastMonthData
                ? `Based on ${lastMonthData.month} data: Local (${lastMonthData.breakdown.gbpScore}), Clarity (${lastMonthData.breakdown.clarityScore})`
                : "Our team is optimizing your digital presence to maintain this growth trajectory"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
