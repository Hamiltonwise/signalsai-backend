import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Search, Download, ArrowUpDown } from "lucide-react";
import { apiGet } from "@/api/index";

interface AllReferrersRow {
  name: string;
  referralCount: number;
  totalProduction: number;
  lastReferralDate: string | null;
  recentReferralCount: number;
  monthlyAverage: number;
  prior3MonthAvg: number;
  sourceType: string;
  trend: "up" | "flat" | "down";
  monthlyBreakdown: Record<string, { count: number; production: number }>;
}

interface AllReferrersData {
  rows: AllReferrersRow[];
  months: string[];
}

type SortKey = "referralCount" | "totalProduction" | "lastReferralDate";

interface AllReferrersTabProps {
  locationId: number | null;
}

const ALL_MONTHS = "__all__";

function formatDate(iso: string | null): string {
  if (!iso) return "--";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "--";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatTrend(t: "up" | "flat" | "down"): string {
  if (t === "up") return "Up";
  if (t === "down") return "Down";
  return "Flat";
}

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCsv(rows: AllReferrersRow[], filename: string): void {
  const header = ["Referrer", "Referral Count", "Total Production", "Last Referral Date", "Trend"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([
      csvEscape(r.name),
      csvEscape(r.referralCount),
      csvEscape(r.totalProduction.toFixed(2)),
      csvEscape(r.lastReferralDate ? new Date(r.lastReferralDate).toISOString().slice(0, 10) : ""),
      csvEscape(formatTrend(r.trend)),
    ].join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const AllReferrersTab: React.FC<AllReferrersTabProps> = ({ locationId }) => {
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState<string>(ALL_MONTHS);
  const [sortKey, setSortKey] = useState<SortKey>("referralCount");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["referral-all-referrers", locationId],
    queryFn: async (): Promise<AllReferrersData> => {
      const params = locationId ? `?location_id=${locationId}` : "";
      const res = await apiGet({ path: `/referral-intelligence/all-referrers${params}` });
      if (!res?.success) return { rows: [], months: [] };
      return res.data || { rows: [], months: [] };
    },
    staleTime: 5 * 60_000,
  });

  // Reset month filter if the available months change and current selection is gone
  useEffect(() => {
    if (!data) return;
    if (monthFilter !== ALL_MONTHS && !data.months.includes(monthFilter)) {
      setMonthFilter(ALL_MONTHS);
    }
  }, [data, monthFilter]);

  const filteredRows = useMemo(() => {
    if (!data) return [];
    let rows = data.rows;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(q));
    }

    if (monthFilter !== ALL_MONTHS) {
      rows = rows
        .map((r) => {
          const monthData = r.monthlyBreakdown[monthFilter];
          if (!monthData || monthData.count === 0) return null;
          return {
            ...r,
            referralCount: monthData.count,
            totalProduction: monthData.production,
          };
        })
        .filter((r): r is AllReferrersRow => r !== null);
    }

    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "referralCount") cmp = a.referralCount - b.referralCount;
      else if (sortKey === "totalProduction") cmp = a.totalProduction - b.totalProduction;
      else if (sortKey === "lastReferralDate") {
        const ad = a.lastReferralDate ? new Date(a.lastReferralDate).getTime() : 0;
        const bd = b.lastReferralDate ? new Date(b.lastReferralDate).getTime() : 0;
        cmp = ad - bd;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [data, search, monthFilter, sortKey, sortDir]);

  const handleExport = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const slug = monthFilter === ALL_MONTHS ? "all-time" : monthFilter;
    downloadCsv(filteredRows, `all-referrers-${slug}-${stamp}.csv`);
  };

  const cycleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-2xl border border-stone-200/60 bg-stone-50/80" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-400">
        <p className="text-base font-medium">Couldn't load the referrer list</p>
        <p className="text-sm mt-1">Please try again in a few minutes.</p>
      </div>
    );
  }

  if (!data || data.rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-400">
        <p className="text-base font-medium">No referrers yet</p>
        <p className="text-sm mt-1">Upload a referral report to populate this list.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Filters + Export */}
      <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#1A1D23]/40" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by referrer name"
              className="w-full pl-10 pr-3 py-2 rounded-xl border border-stone-200 bg-white text-sm text-[#1A1D23] focus:outline-none focus:border-[#D56753]"
            />
          </div>
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-stone-200 bg-white text-sm text-[#1A1D23] focus:outline-none focus:border-[#D56753]"
          >
            <option value={ALL_MONTHS}>All months</option>
            {data.months.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <button
            onClick={handleExport}
            disabled={filteredRows.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#D56753] text-white text-sm font-semibold hover:brightness-105 transition-all disabled:opacity-50"
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
        <p className="text-xs text-[#1A1D23]/60">
          Showing {filteredRows.length} of {data.rows.length} {data.rows.length === 1 ? "referrer" : "referrers"}
        </p>
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200/60 bg-white">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#1A1D23]/60">
                  Referrer
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#1A1D23]/60">
                  <button onClick={() => cycleSort("referralCount")} className="inline-flex items-center gap-1 hover:text-[#1A1D23]">
                    Referrals <ArrowUpDown size={12} />
                  </button>
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#1A1D23]/60">
                  <button onClick={() => cycleSort("totalProduction")} className="inline-flex items-center gap-1 hover:text-[#1A1D23]">
                    Production <ArrowUpDown size={12} />
                  </button>
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#1A1D23]/60">
                  <button onClick={() => cycleSort("lastReferralDate")} className="inline-flex items-center gap-1 hover:text-[#1A1D23]">
                    Last referral <ArrowUpDown size={12} />
                  </button>
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#1A1D23]/60">
                  Trend
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200/60 bg-white">
              {filteredRows.map((r) => (
                <tr key={r.name} className="hover:bg-stone-50/50">
                  <td className="px-4 py-3 text-[#1A1D23] font-semibold">{r.name}</td>
                  <td className="px-4 py-3 text-[#1A1D23] tabular-nums">{r.referralCount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-[#1A1D23] tabular-nums">${r.totalProduction.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className="px-4 py-3 text-[#1A1D23]/70">{formatDate(r.lastReferralDate)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                        r.trend === "up"
                          ? "bg-emerald-50 text-emerald-700"
                          : r.trend === "down"
                            ? "bg-red-50 text-red-700"
                            : "bg-stone-100 text-[#1A1D23]/70"
                      }`}
                    >
                      {formatTrend(r.trend)}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-[#1A1D23]/60">
                    No referrers match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
};
