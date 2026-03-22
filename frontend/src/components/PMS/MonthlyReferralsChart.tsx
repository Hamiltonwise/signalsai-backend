import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { Users, TrendingUp } from "lucide-react";

interface MonthlyData {
  month: string;
  selfReferrals: number;
  doctorReferrals: number;
  total?: number;
  totalReferrals?: number;
  productionTotal?: number;
}

interface MonthlyReferralsChartProps {
  data?: MonthlyData[];
  periodLabel?: string;
}

export const MonthlyReferralsChart: React.FC<MonthlyReferralsChartProps> = ({
  data = [
    { month: "Jan", selfReferrals: 30, doctorReferrals: 42, total: 180 },
    { month: "Feb", selfReferrals: 48, doctorReferrals: 66, total: 180 },
    { month: "Mar", selfReferrals: 48, doctorReferrals: 48, total: 180 },
    { month: "Apr", selfReferrals: 48, doctorReferrals: 24, total: 180 },
    { month: "May", selfReferrals: 36, doctorReferrals: 36, total: 180 },
    { month: "Jun", selfReferrals: 10, doctorReferrals: 12, total: 100 },
  ],
  periodLabel = `Practice Management System • ${new Date().getFullYear()}`,
}) => {
  const normalizedData = useMemo(
    () =>
      data.map((item) => ({
        ...item,
        total:
          item.total ??
          item.totalReferrals ??
          item.selfReferrals + item.doctorReferrals,
      })),
    [data]
  );

  const totals = normalizedData.reduce(
    (acc, item) => ({
      self: acc.self + item.selfReferrals,
      doctor: acc.doctor + item.doctorReferrals,
      total: acc.total + (item.total ?? 0),
    }),
    { self: 0, doctor: 0, total: 0 }
  );

  const maxValue = normalizedData.length
    ? Math.max(
        ...normalizedData.map(
          (item) => item.selfReferrals + item.doctorReferrals
        ),
        0
      )
    : 0;

  const latestTotal = normalizedData[normalizedData.length - 1]?.total ?? 0;
  const previousTotal = normalizedData[normalizedData.length - 2]?.total ?? 0;

  const changePercent =
    previousTotal > 0
      ? Number(
          (((latestTotal - previousTotal) / previousTotal) * 100).toFixed(1)
        )
      : 0;

  const changeIsPositive = changePercent >= 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Summary Card - Navy themed */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-alloro-navy rounded-2xl p-6 text-white shadow-xl shadow-blue-900/20 relative overflow-hidden group"
      >
        <div className="absolute top-0 right-0 p-24 bg-alloro-orange/20 rounded-full -mr-12 -mt-12 blur-3xl group-hover:bg-alloro-orange/30 transition-colors"></div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm border border-white/10">
              <Users size={20} className="text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-blue-100 uppercase tracking-wider">
                Total Referrals
              </h3>
              <p className="text-xs text-blue-300">{periodLabel}</p>
            </div>
          </div>

          <div className="flex items-end justify-between">
            <div>
              <div className="text-4xl font-bold font-heading tracking-tight mb-1">
                {Math.round(totals.total).toLocaleString()}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span
                  className={`${
                    changeIsPositive
                      ? "bg-green-500/20 text-green-300 border-green-500/30"
                      : "bg-red-500/20 text-red-300 border-red-500/30"
                  } px-2 py-0.5 rounded text-xs font-bold border flex items-center gap-1`}
                >
                  <TrendingUp
                    size={12}
                    className={changeIsPositive ? "" : "rotate-180"}
                  />{" "}
                  {changeIsPositive ? "+" : ""}
                  {changePercent}%
                </span>
                <span className="text-slate-400 text-xs">vs last month</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-white/90 tabular-nums">
                {Math.round(totals.self).toLocaleString()}
              </div>
              <div className="text-[10px] text-blue-300 font-medium uppercase tracking-wide">
                Self-Referrals
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Timeline Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex-1 flex flex-col"
      >
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-2xl">
          <h3 className="font-bold text-alloro-navy font-heading">
            Monthly Trend
          </h3>
          <div className="flex gap-3 text-[10px] font-bold uppercase tracking-wider">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-alloro-orange"></span>{" "}
              Self
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-alloro-teal"></span>{" "}
              Doctor
            </div>
          </div>
        </div>

        <div className="p-6 flex-1 overflow-y-auto max-h-[500px] scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
          <div className="relative space-y-0">
            {/* Vertical Timeline Line */}
            <div className="absolute left-[52px] top-4 bottom-4 w-px bg-slate-100 z-0"></div>

            {normalizedData.map((item, index) => {
              const maxBarValue = maxValue <= 0 ? 1 : maxValue;
              const selfPct = (item.selfReferrals / maxBarValue) * 100;
              const docPct = (item.doctorReferrals / maxBarValue) * 100;

              return (
                <motion.div
                  key={item.month}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05, duration: 0.4 }}
                  className="relative z-10 grid grid-cols-[40px_1fr] gap-4 mb-5 group"
                >
                  {/* Date Column */}
                  <div className="text-right pt-0.5">
                    <div className="text-xs font-bold text-slate-500">
                      {item.month}
                    </div>
                  </div>

                  {/* Visuals */}
                  <div className="relative">
                    {/* Tooltip on hover */}
                    <div className="mb-1 opacity-0 group-hover:opacity-100 transition-opacity absolute -top-6 left-0 bg-slate-800 text-white text-[10px] px-2 py-1 rounded pointer-events-none z-20 whitespace-nowrap">
                      Total: {item.total} referrals
                    </div>

                    <div className="space-y-1.5">
                      {/* Self Bar */}
                      <div className="flex items-center gap-2 h-5">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max(selfPct, 5)}%` }}
                          transition={{
                            delay: index * 0.05 + 0.2,
                            duration: 0.6,
                            ease: "easeOut",
                          }}
                          className="h-full bg-alloro-orange rounded-r-md text-[10px] text-white font-bold flex items-center justify-end px-2 shadow-sm shadow-blue-200 transition-all duration-300 group-hover:bg-blue-700"
                        >
                          {item.selfReferrals > 0 && item.selfReferrals}
                        </motion.div>
                      </div>

                      {/* Doctor Bar */}
                      {item.doctorReferrals > 0 && (
                        <div className="flex items-center gap-2 h-5">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.max(docPct, 5)}%` }}
                            transition={{
                              delay: index * 0.05 + 0.3,
                              duration: 0.6,
                              ease: "easeOut",
                            }}
                            className="h-full bg-alloro-teal rounded-r-md text-[10px] text-white font-bold flex items-center justify-end px-2 shadow-sm shadow-teal-200 transition-all duration-300 group-hover:brightness-110"
                          >
                            {item.doctorReferrals}
                          </motion.div>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
