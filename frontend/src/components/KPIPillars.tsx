import type { FC } from "react";
import {
  MapPin,
  MousePointer,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

interface PillarData {
  name: string;
  icon: any;
  score: number;
  trend: "up" | "down" | "stable";
  value: string;
  change: string;
  metrics: Array<{
    name: string;
    value: string;
    status: "good" | "warning" | "critical";
  }>;
}

interface KPIPillarsProps {
  gbpData?: any;
  clarityData?: any;
  connectionStatus?: {
    gbp: boolean;
    clarity: boolean;
  };
}

export const KPIPillars: FC<KPIPillarsProps> = ({
  gbpData,
  clarityData,
  connectionStatus = { gbp: false, clarity: false },
}) => {
  const pillars: PillarData[] = [
    {
      name: "Local Presence",
      icon: MapPin,
      score: connectionStatus.gbp ? gbpData?.calculatedScore || 0 : 91,
      trend: connectionStatus.gbp ? gbpData?.trend || "stable" : "up",
      value: connectionStatus.gbp
        ? `${(gbpData?.averageRating || 0).toFixed(1)}★`
        : "4.9★",
      change: connectionStatus.gbp
        ? `${gbpData?.changePercent || "0"}%`
        : "+8%",
      metrics: [
        {
          name: "Average Rating",
          value: connectionStatus.gbp
            ? `${(gbpData?.averageRating || 0).toFixed(1)}★`
            : "4.9★",
          status: connectionStatus.gbp
            ? Number(gbpData?.averageRating || 0) >= 4.5
              ? "good"
              : "warning"
            : "good",
        },
        {
          name: "Total Reviews",
          value: connectionStatus.gbp
            ? gbpData?.totalReviews?.toString() || "0"
            : "127",
          status: connectionStatus.gbp
            ? Number(gbpData?.totalReviews || 0) > 20
              ? "good"
              : "warning"
            : "good",
        },
        {
          name: "Phone Calls",
          value:
            connectionStatus.gbp && typeof gbpData?.phoneCallsTotal === "number"
              ? gbpData.phoneCallsTotal.toString()
              : "8",
          status: connectionStatus.gbp
            ? Number(gbpData?.phoneCallsTotal || 0) > 5
              ? "good"
              : "warning"
            : "good",
        },
      ],
    },
    {
      name: "User Experience",
      icon: MousePointer,
      score: connectionStatus.clarity ? clarityData?.calculatedScore || 0 : 68,
      trend: connectionStatus.clarity ? clarityData?.trend || "stable" : "down",
      value: connectionStatus.clarity
        ? `${clarityData?.bounceRate?.toFixed(1) || "0"}%`
        : "65%",
      change: connectionStatus.clarity
        ? `${clarityData?.changePercent || "0"}%`
        : "-5%",
      metrics: [
        {
          name: "Total Sessions",
          value: connectionStatus.clarity
            ? clarityData?.totalSessions?.toLocaleString() || "0"
            : "15.4K",
          status: connectionStatus.clarity
            ? clarityData?.totalSessions > 1000
              ? "good"
              : "warning"
            : "good",
        },
        {
          name: "Bounce Rate",
          value: connectionStatus.clarity
            ? `${clarityData?.bounceRate?.toFixed(1) || "0"}%`
            : "32%",
          status: connectionStatus.clarity
            ? clarityData?.bounceRate < 40
              ? "good"
              : "warning"
            : "good",
        },
        {
          name: "Dead Clicks",
          value: connectionStatus.clarity
            ? clarityData?.deadClicks?.toString() || "0"
            : "45",
          status: connectionStatus.clarity
            ? clarityData?.deadClicks < 20
              ? "good"
              : "critical"
            : "warning",
        },
      ],
    },
  ];

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-orange-500";
    return "text-red-500";
  };

  // getScoreBg was defined but unused; removed to satisfy noUnusedLocals

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "up":
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case "down":
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      default:
        return <Minus className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "good":
        return "text-green-600 bg-green-50";
      case "warning":
        return "text-orange-600 bg-orange-50";
      case "critical":
        return "text-red-600 bg-red-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-[200] text-slate-900 tracking-tight">
        Performance Pillars
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {pillars.map((pillar) => {
          const Icon = pillar.icon;
          return (
            <div
              key={pillar.name}
              className="relative bg-white/50 border-white/50 border-b-2 group glass-card p-5 md:p-6 overflow-hidden transition-transform duration-200 hover:scale-[1.01]"
            >
              {/* glare highlights */}
              <div className="pointer-events-none absolute -top-8 -left-10 w-44 h-36 rounded-full glare-spot" />
              <div className="pointer-events-none absolute -bottom-12 -right-14 w-48 h-40 rounded-full glare-spot" />

              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-white/50 border border-white/50 backdrop-blur-sm">
                    <Icon className="w-5 h-5 text-slate-700" />
                  </div>
                  <div>
                    <h3 className="font-light text-slate-900 text-sm leading-tight">
                      {pillar.name}
                    </h3>
                    <div className="flex items-center gap-1">
                      <span
                        className={`text-2xl font-semibold ${getScoreColor(
                          pillar.score
                        )}`}
                      >
                        {pillar.score}
                      </span>
                      <span className="text-sm text-slate-500">/100</span>
                    </div>
                  </div>
                </div>
                {getTrendIcon(pillar.trend)}
              </div>

              <div className="space-y-2">
                {pillar.metrics.map((metric) => (
                  <div
                    key={metric.name}
                    className="flex items-center justify-between"
                  >
                    <span className="text-[11px] text-slate-600">
                      {metric.name}
                    </span>
                    <span
                      className={`text-[11px] px-2 py-1 rounded-full backdrop-blur-sm border border-white/50 ${getStatusColor(
                        metric.status
                      )}`}
                    >
                      {metric.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
