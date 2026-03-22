import React from "react";
import { TrendingUp, Star, Lightbulb } from "lucide-react";
import { useGBP } from "../../hooks/useGBP";
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

interface ConsiderationProps {
  className?: string;
  selectedDomain: string;
}

export const Consideration: React.FC<ConsiderationProps> = ({
  className = "",
  selectedDomain,
}) => {
  const { gbpData, isLoading, error } = useGBP();

  // selectedDomain is passed as prop - GBP Context automatically handles data fetching when domain changes
  console.log(
    "Consideration component received selectedDomain:",
    selectedDomain
  );

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
    type: "reviews" | "rating" | "calls"
  ): "good" | "warning" | "critical" => {
    if (type === "reviews") {
      return value > 10 ? "good" : value > 5 ? "warning" : "critical";
    }
    if (type === "rating") {
      return value > 4.5 ? "good" : value > 4.0 ? "warning" : "critical";
    }
    if (type === "calls") {
      return value > 20 ? "good" : "warning";
    }
    return "good";
  };

  // Use dynamic trend score from API
  const getTrendScore = () => {
    return isLoading ? 0 : gbpData.trendScore;
  };

  // Dynamic consideration stage data with real GBP data
  const considerationData = {
    name: "Consideration",
    icon: Star,
    color: "text-amber-600",
    bgGradient: "bg-gradient-to-br from-amber-50 via-orange-25 to-yellow-50",
    borderGradient: "border-amber-200/60",
    score: 88,
    trend: getTrendScore(),
    dataSource: "Google Business Profile",
    explainer:
      "When patients compare options and evaluate your practice's reputation",
    whyItMatters:
      "This is the decisive moment. Patients compare your practice with competitors, read reviews, and assess your credibility. Strong social proof and reputation management are crucial.",
    insight: isLoading
      ? "Loading business profile data..."
      : error
      ? "Unable to load business profile data at this time."
      : `Your practice has ${
          gbpData.newReviews.currMonth
        } new reviews this month with ${gbpData.avgRating.currMonth.toFixed(
          1
        )}-star average rating. ${
          gbpData.callClicks.currMonth
        } call clicks generated.`,
    action:
      "Respond to recent reviews within 24 hours - increases booking rate by 25%",
    metrics: [
      {
        label: "New Reviews",
        value: isLoading ? "..." : gbpData.newReviews.currMonth.toString(),
        prevValue: gbpData.newReviews.prevMonth,
        status: isLoading
          ? ("good" as const)
          : getMetricStatus(gbpData.newReviews.currMonth, "reviews"),
      },
      {
        label: "Avg. Rating",
        value: isLoading ? "..." : gbpData.avgRating.currMonth.toFixed(1),
        prevValue: gbpData.avgRating.prevMonth,
        status: isLoading
          ? ("good" as const)
          : getMetricStatus(gbpData.avgRating.currMonth, "rating"),
      },
      {
        label: "Call Clicks",
        value: isLoading ? "..." : formatNumber(gbpData.callClicks.currMonth),
        prevValue: gbpData.callClicks.prevMonth,
        status: isLoading
          ? ("good" as const)
          : getMetricStatus(gbpData.callClicks.currMonth, "calls"),
      },
    ],
  };

  return (
    <div className={`${className}`}>
      <div
        className={`${considerationData.bgGradient} rounded-xl border ${considerationData.borderGradient} p-6`}
      >
        {/* Stage Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-lg ${getScoreGradient(
                considerationData.score
              )} p-0.5`}
            >
              <div className="w-full h-full bg-white rounded-lg flex items-center justify-center">
                <considerationData.icon
                  className={`w-6 h-6 ${considerationData.color}`}
                />
              </div>
            </div>
            <div>
              <h3 className="text-xl font-normal text-gray-900">
                {considerationData.name}
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
                    : considerationData.dataSource}
                </p>
              </div>
            </div>
          </div>

          <Tooltip
            align="center"
            position="left"
            message={[
              "This is an aggregation of",
              "reviews (30%), rating (50%), calls (20%)",
            ]}
          >
            <div className="flex cursor-pointer items-center gap-1.5">
              {!isLoading && (
                <>
                  {getTrendIcon(considerationData.trend)}
                  <span
                    className={`text-sm font-medium ${
                      considerationData.trend > 0
                        ? "text-emerald-600"
                        : "text-red-500"
                    }`}
                  >
                    {considerationData.trend > 0 ? "+" : ""}
                    {considerationData.trend}%
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
              <span className="text-white text-sm font-medium">3</span>
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-gray-900 mb-1">
                {considerationData.explainer}
              </h4>
              <p className="text-sm text-gray-600 leading-relaxed">
                {considerationData.whyItMatters}
              </p>
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          {considerationData.metrics.map((metric) => (
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
                    {metric.label === "Avg. Rating"
                      ? metric.prevValue.toFixed(1)
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
                {considerationData.insight}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
