import React from "react";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  type LucideIcon,
} from "lucide-react";

interface GrowthFocusedKPICardProps {
  title: string;
  description: string;
  value: string;
  trend: "up" | "down" | "stable";
  changePercent: number;
  icon: LucideIcon;
  isConnected: boolean;
  color: string;
  last12MonthsData?: number[]; // Optional 12-month data points
}

export const GrowthFocusedKPICard: React.FC<GrowthFocusedKPICardProps> = ({
  title,
  description,
  value,
  trend,
  changePercent,
  icon: Icon,
  isConnected,
  color,
  last12MonthsData,
}) => {
  const getStatusBadge = () => {
    if (trend === "up" && changePercent > 10) {
      return {
        text: "🚀 Improving Fast",
        color: "bg-green-100 text-green-800",
      };
    } else if (trend === "up" && changePercent > 0) {
      return { text: "📈 Steady Growth", color: "bg-blue-100 text-blue-800" };
    } else if (trend === "stable" || Math.abs(changePercent) < 3) {
      return { text: "✅ Holding Strong", color: "bg-teal-100 text-teal-800" };
    } else {
      return { text: "🛠 Needs Focus", color: "bg-amber-100 text-amber-800" };
    }
  };

  const getTrendColor = () => {
    if (trend === "up") return "text-green-600";
    if (trend === "down") return "text-amber-600";
    return "text-gray-600";
  };

  const getTrendIcon = () => {
    if (trend === "up") return <TrendingUp className="w-4 h-4" />;
    if (trend === "down") return <TrendingDown className="w-4 h-4" />;
    return <Activity className="w-4 h-4" />;
  };

  const getTrendMessage = () => {
    if (trend === "up") {
      return `+${changePercent}% vs previous 30 days`;
    } else if (trend === "down") {
      return `${changePercent}% dip vs previous 30 days`;
    } else {
      return `${Math.abs(changePercent)}% change vs previous 30 days`;
    }
  };

  const statusBadge = getStatusBadge();

  // Use provided 12-month data or generate realistic sparkline
  const sparklineData =
    last12MonthsData ||
    Array.from({ length: 12 }, (_, i) => {
      const base = 50;
      const variation = isConnected
        ? trend === "up"
          ? i * 2
          : trend === "down"
          ? -i * 1.5
          : Math.sin(i) * 5
        : trend === "up"
        ? i * 3
        : trend === "down"
        ? -i * 2
        : Math.sin(i) * 8;
      return Math.max(20, base + variation + (Math.random() - 0.5) * 10);
    });

  const maxSparkline = Math.max(...sparklineData);

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6 hover:shadow-lg transition-all duration-300 group">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`p-3 rounded-lg ${color} group-hover:scale-110 transition-transform duration-300`}
          >
            <Icon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-lg">{title}</h3>
            <p className="text-sm text-gray-600">{description}</p>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${statusBadge.color}`}
        >
          {statusBadge.text}
        </span>
      </div>

      {/* Main Value */}
      <div className="mb-4">
        <div className="text-3xl font-bold text-gray-900 mb-1">{value}</div>
        <div
          className={`flex items-center gap-2 text-sm font-medium ${getTrendColor()}`}
        >
          {getTrendIcon()}
          <span>{getTrendMessage()}</span>
        </div>
      </div>

      {/* Sparkline Chart */}
      <div className="mb-4">
        <div className="flex items-end gap-1 h-12">
          {sparklineData.map((point, index) => (
            <div
              key={index}
              className={`flex-1 rounded-t transition-all duration-500 ${
                trend === "up"
                  ? "bg-gradient-to-t from-green-200 to-green-400"
                  : trend === "down"
                  ? "bg-gradient-to-t from-amber-200 to-amber-400"
                  : "bg-gradient-to-t from-gray-200 to-gray-400"
              }`}
              style={{
                height: `${(point / maxSparkline) * 100}%`,
                animationDelay: `${index * 50}ms`,
              }}
            />
          ))}
        </div>
        <div className="text-xs text-gray-500 mt-1 text-center">
          12-month trend
        </div>
      </div>

      {/* Connection Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? "bg-green-500" : "bg-gray-400"
            }`}
          />
          <span className="text-xs text-gray-600">
            {isConnected ? "Live Data" : "Demo Data"}
          </span>
        </div>

        {!isConnected && (
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
            Connect in Settings
          </span>
        )}
      </div>
    </div>
  );
};
