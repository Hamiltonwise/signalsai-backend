import React from "react";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  type LucideIcon,
} from "lucide-react";

interface EnhancedMetricCardProps {
  title: string;
  value: string;
  change: string;
  trend: "up" | "down" | "stable";
  icon: LucideIcon;
  color: string;
  description?: string;
  dataSource?: "GBP" | "Clarity";
  isInverse?: boolean;
  showSubMetrics?: boolean; // For cards that need to show additional metrics below
  subMetrics?: Array<{
    label: string;
    value: string;
    description?: string;
    previousValue?: string;
    change?: number;
  }>;
}

export const EnhancedMetricCard: React.FC<EnhancedMetricCardProps> = ({
  title,
  value,
  change,
  trend,
  icon: Icon,
  color,
  description,
  dataSource,
  isInverse = false,
  showSubMetrics = false,
  subMetrics = [],
}) => {
  const getTrendColor = () => {
    if (trend === "stable") return "text-gray-600";

    if (isInverse) {
      return trend === "up" ? "text-amber-600" : "text-green-600";
    }

    return trend === "up" ? "text-green-600" : "text-amber-600";
  };

  const getTrendIcon = () => {
    if (trend === "stable") return <Activity className="w-4 h-4" />;
    if (trend === "up") return <TrendingUp className="w-4 h-4" />;
    return <TrendingDown className="w-4 h-4" />;
  };

  const getDataSourceBadge = () => {
    if (!dataSource) return null;

    const badgeColors = {
      GBP: "bg-green-100 text-green-800",
      Clarity: "bg-purple-100 text-purple-800",
      PMS: "bg-indigo-100 text-indigo-800",
    };

    return (
      <span
        className={`px-2 py-1 text-xs rounded-full font-medium ${badgeColors[dataSource]}`}
      >
        {dataSource}
      </span>
    );
  };

  const getTrendMessage = () => {
    if (trend === "up") {
      return isInverse
        ? `${change} — room for improvement`
        : `${change} growth this period`;
    } else if (trend === "down") {
      return isInverse
        ? `${change} improvement`
        : `${change} — monitoring closely`;
    } else {
      return `${change} — steady performance`;
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6 hover:shadow-lg transition-all duration-300 group">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div
          className={`p-3 rounded-lg ${color} group-hover:scale-110 transition-transform duration-300`}
        >
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex items-center gap-2">{getDataSourceBadge()}</div>
      </div>

      {/* Main Content */}
      <div className="space-y-3">
        <div>
          <div className="text-2xl font-bold text-gray-900 mb-1">{value}</div>
          <div className="text-sm text-gray-600 font-medium">{title}</div>
          {description && (
            <div className="text-xs text-gray-500 mt-1">{description}</div>
          )}
        </div>

        {/* Trend Display */}
        <div
          className={`flex items-center gap-2 text-sm font-medium ${getTrendColor()}`}
        >
          {getTrendIcon()}
          <span>{getTrendMessage()}</span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-1000 ${
              trend === "up"
                ? "bg-gradient-to-r from-green-400 to-green-600"
                : trend === "down"
                ? "bg-gradient-to-r from-amber-400 to-amber-600"
                : "bg-gradient-to-r from-gray-400 to-gray-600"
            }`}
            style={{
              width: `${Math.min(
                Math.abs(parseFloat(change.replace(/[+\-%]/g, ""))),
                100
              )}%`,
            }}
          />
        </div>
      </div>

      {/* Sub-metrics section */}
      {showSubMetrics && subMetrics.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-200">
          <div className="space-y-2">
            {subMetrics.map((metric, index) => (
              <div
                key={index}
                className="flex justify-between items-center text-sm"
              >
                <span className="text-gray-600">{metric.label}</span>
                <div className="text-right">
                  <span className="font-medium text-gray-900">
                    {metric.value}
                  </span>
                  {metric.previousValue && (
                    <div className="text-xs text-gray-500">
                      vs {metric.previousValue}
                    </div>
                  )}
                  {metric.change !== undefined && metric.change !== 0 && (
                    <div
                      className={`text-xs font-medium ${
                        metric.change > 0
                          ? "text-green-600"
                          : metric.change < 0
                          ? "text-red-600"
                          : "text-gray-600"
                      }`}
                    >
                      {metric.change > 0 ? "+" : ""}
                      {metric.change.toFixed(1)}% vs last month
                    </div>
                  )}
                  {metric.description && (
                    <div className="text-xs text-gray-500">
                      {metric.description}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
