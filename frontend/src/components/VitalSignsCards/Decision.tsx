import React from "react";
import { TrendingUp, Brain, Lightbulb } from "lucide-react";
import { useClarity } from "../../hooks/useClarity";
import Tooltip from "../Tooltip";

// Helper functions from VitalSignsCard
function getScoreGradient(score: number) {
  if (score >= 85) return "bg-gradient-to-br from-emerald-500 to-green-600";
  if (score >= 70) return "bg-gradient-to-br from-blue-500 to-indigo-600";
  if (score >= 55) return "bg-gradient-to-br from-orange-500 to-red-500";
  return "bg-gradient-to-br from-red-500 to-pink-600";
}

function getMetricStatusStyle(status: string) {
  switch (status) {
    case "good":
      return "text-emerald-700 bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200/50";
    case "warning":
      return "text-orange-700 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200/50";
    case "critical":
      return "text-red-700 bg-gradient-to-r from-red-50 to-rose-50 border border-red-200/50";
    default:
      return "text-gray-700 bg-gradient-to-r from-gray-50 to-slate-50 border border-gray-200/50";
  }
}

function getTrendIcon(trend: number) {
  return trend > 0 ? (
    <TrendingUp className="w-4 h-4 text-emerald-600" />
  ) : (
    <TrendingUp className="w-4 h-4 text-red-500 rotate-180" />
  );
}

interface DecisionProps {
  className?: string;
  selectedDomain: string;
}

export const Decision: React.FC<DecisionProps> = ({
  className = "",
  selectedDomain,
}) => {
  const { clarityData, isLoading, error } = useClarity();

  console.log("Decision component received selectedDomain:", selectedDomain);

  // Helper function to format numbers
  const formatNumber = (num: number): string => {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + "K";
    }
    return num.toString();
  };

  // Helper function to determine metric status
  const getMetricStatus = (
    value: number,
    type: "sessions" | "bounceRate" | "deadClicks"
  ): "good" | "warning" | "critical" => {
    if (type === "sessions") {
      return value > 150 ? "good" : value > 75 ? "warning" : "critical";
    }
    if (type === "bounceRate") {
      return value < 0.06 ? "good" : value < 0.1 ? "warning" : "critical";
    }
    if (type === "deadClicks") {
      return value < 30 ? "good" : value < 80 ? "warning" : "critical";
    }
    return "good";
  };

  // Dynamic decision stage data with Clarity data
  const decisionData = {
    name: "Decision",
    icon: Brain,
    color: "text-green-600",
    bgGradient: "bg-gradient-to-br from-green-50 via-emerald-25 to-teal-50",
    borderGradient: "border-green-200/60",
    score: 78,
    trend: clarityData.trendScore,
    dataSource: "Microsoft Clarity",
    explainer: "When patients finalize their decision and take action to book",
    whyItMatters:
      "This is the critical conversion moment. User experience determines whether ready-to-book patients complete their appointment booking or abandon due to friction points and usability issues.",
    insight: isLoading
      ? "Loading user behavior data..."
      : error
      ? "Unable to load user behavior data at this time."
      : `Your site had ${formatNumber(
          clarityData.sessions.currMonth
        )} user sessions with ${(
          clarityData.bounceRate.currMonth * 100
        ).toFixed(1)}% bounce rate. ${
          clarityData.deadClicks.currMonth
        } dead clicks detected this month.`,
    action: "Fix conversion funnel dead clicks - can increase bookings by 35%",
    metrics: [
      {
        label: "User Sessions",
        value: isLoading ? "..." : formatNumber(clarityData.sessions.currMonth),
        prevValue: clarityData.sessions.prevMonth,
        status: isLoading
          ? ("good" as const)
          : getMetricStatus(clarityData.sessions.currMonth, "sessions"),
      },
      {
        label: "Bounce Rate",
        value: isLoading
          ? "..."
          : (clarityData.bounceRate.currMonth * 100).toFixed(1) + "%",
        prevValue: clarityData.bounceRate.prevMonth,
        status: isLoading
          ? ("good" as const)
          : getMetricStatus(clarityData.bounceRate.currMonth, "bounceRate"),
      },
      {
        label: "Dead Clicks",
        value: isLoading ? "..." : clarityData.deadClicks.currMonth.toString(),
        prevValue: clarityData.deadClicks.prevMonth,
        status: isLoading
          ? ("good" as const)
          : getMetricStatus(clarityData.deadClicks.currMonth, "deadClicks"),
      },
    ],
  };

  return (
    <div className={`${className}`}>
      <div
        className={`${decisionData.bgGradient} rounded-xl border ${decisionData.borderGradient} p-6`}
      >
        {/* Stage Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-lg ${getScoreGradient(
                decisionData.score
              )} p-0.5`}
            >
              <div className="w-full h-full bg-white rounded-lg flex items-center justify-center">
                <decisionData.icon
                  className={`w-6 h-6 ${decisionData.color}`}
                />
              </div>
            </div>
            <div>
              <h3 className="text-xl font-normal text-gray-900">
                {decisionData.name}
              </h3>
              <div className="flex items-center gap-2">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    isLoading
                      ? "bg-orange-400 animate-pulse"
                      : error
                      ? "bg-red-400"
                      : "bg-green-400"
                  }`}
                />
                <p className="text-sm text-gray-500">
                  {isLoading
                    ? "Loading data..."
                    : error
                    ? "Error loading data"
                    : decisionData.dataSource}
                </p>
              </div>
            </div>
          </div>

          <Tooltip
            align="center"
            position="left"
            message={[
              "This is an aggregation of",
              "dead clicks (40%), bounce rate (35%), sessions (25%)",
            ]}
          >
            <div className="flex cursor-pointer items-center gap-1.5">
              {!isLoading && (
                <>
                  {getTrendIcon(decisionData.trend)}
                  <span
                    className={`text-sm font-medium ${
                      decisionData.trend > 0
                        ? "text-emerald-600"
                        : "text-red-500"
                    }`}
                  >
                    {decisionData.trend > 0 ? "+" : ""}
                    {decisionData.trend}%
                  </span>
                </>
              )}
            </div>
          </Tooltip>
        </div>

        {/* Stage Explainer */}
        <div className="bg-white/70 backdrop-blur-sm rounded-lg p-4 mb-5 border border-white/50">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-medium">4</span>
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-gray-900 mb-1">
                {decisionData.explainer}
              </h4>
              <p className="text-sm text-gray-600 leading-relaxed">
                {decisionData.whyItMatters}
              </p>
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          {decisionData.metrics.map((metric) => (
            <div
              key={metric.label}
              className={`rounded-lg p-4 ${getMetricStatusStyle(
                metric.status
              )} transition-all duration-200 hover:scale-[1.02]`}
            >
              <div className="text-center">
                <div className="text-xl font-semibold text-gray-900 mb-1">
                  {metric.value}
                </div>
                <div className="text-sm text-gray-600 mb-1">{metric.label}</div>
                {!isLoading && metric.prevValue !== undefined && (
                  <div className="text-xs text-gray-400">
                    {metric.label === "Bounce Rate"
                      ? (metric.prevValue * 100).toFixed(1) + "%"
                      : formatNumber(metric.prevValue)}{" "}
                    last month
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* AI Insight */}
        <div className="bg-white/70 backdrop-blur-sm rounded-lg p-4 border border-white/50">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Lightbulb className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-gray-900 mb-1">AI Insight</h4>
              <p className="text-sm text-gray-600 leading-relaxed">
                {decisionData.insight}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
