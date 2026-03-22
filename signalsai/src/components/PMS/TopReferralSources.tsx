import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, ChevronLeft, ChevronRight, Search } from "lucide-react";
import type { PmsKeyDataSource } from "../../api/pms";

interface TopReferralSourcesProps {
  data?: PmsKeyDataSource[];
  subtitle?: string;
}

const DEFAULT_SOURCES: PmsKeyDataSource[] = [
  {
    rank: 1,
    name: "Website",
    percentage: 15,
    referrals: 150,
    production: 144268.8,
  },
  {
    rank: 2,
    name: "Google Search",
    percentage: 12.6,
    referrals: 126,
    production: 90450.6,
  },
  {
    rank: 3,
    name: "Facebook Ad",
    percentage: 12.6,
    referrals: 126,
    production: 99396.6,
  },
];

const PAGE_SIZE = 10;

export const TopReferralSources: React.FC<TopReferralSourcesProps> = ({
  data = DEFAULT_SOURCES,
  subtitle = "Revenue attribution by source",
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  // Filter data based on active filter and search
  const filteredData = useMemo(() => {
    let result = data;

    // Apply search filter
    if (searchQuery.trim()) {
      result = result.filter((source) =>
        source.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return result;
  }, [data, searchQuery]);

  const totalPages = Math.max(Math.ceil(filteredData.length / PAGE_SIZE), 1);

  const pagedData = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredData.slice(start, start + PAGE_SIZE);
  }, [filteredData, currentPage]);

  const maxPercentage = pagedData.length
    ? Math.max(...pagedData.map((source) => source.percentage))
    : 0;
  const denominator = maxPercentage <= 0 ? 1 : maxPercentage;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex flex-col h-full"
    >
      {/* Header Section */}
      <div className="p-6 border-b border-slate-100">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-50 rounded-xl text-purple-600">
              <BarChart3 size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-alloro-navy font-heading">
                Top Sources
              </h3>
              <p className="text-xs text-slate-500">{subtitle}</p>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex p-1 bg-slate-100 rounded-lg">
            {["All", "Doctor", "Marketing"].map((filter) => (
              <button
                key={filter}
                onClick={() => {
                  setActiveFilter(filter);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                  activeFilter === filter
                    ? "bg-white text-alloro-navy shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search referrals source..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-alloro-navy focus:outline-none focus:ring-2 focus:ring-alloro-orange/20 transition-all"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto p-2">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-white z-10 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 pl-6">Source Name</th>
              <th className="px-4 py-3 w-32">Volume</th>
              <th className="px-4 py-3 text-right pr-6">Production</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {pagedData.map((source, idx) => (
              <motion.tr
                key={`${source.rank}-${source.name}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.03, duration: 0.3 }}
                className="group hover:bg-slate-50/80 transition-colors"
              >
                <td className="px-4 py-4 pl-6">
                  <div className="flex items-center gap-4">
                    <div
                      className={`
                        w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm
                        ${
                          idx < 3
                            ? "bg-alloro-orange text-white"
                            : "bg-slate-100 text-slate-500"
                        }
                      `}
                    >
                      {source.rank}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-alloro-navy truncate max-w-[200px]">
                        {source.name}
                      </div>
                      <div className="text-[11px] text-slate-400 font-medium mt-0.5">
                        {source.percentage}% Share
                      </div>
                    </div>
                  </div>
                  {/* Slim Progress Bar */}
                  <div className="mt-2.5 ml-10 h-1 w-24 bg-slate-100 rounded-full overflow-hidden opacity-50 group-hover:opacity-100 transition-opacity">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{
                        width: `${Math.max(
                          (source.percentage / denominator) * 100,
                          10
                        )}%`,
                      }}
                      transition={{ delay: idx * 0.05 + 0.2, duration: 0.4 }}
                      className="h-full rounded-full bg-alloro-orange"
                    />
                  </div>
                </td>
                <td className="px-4 py-4 align-top pt-5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-slate-700 tabular-nums">
                      {Math.round(source.referrals).toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-400">refs</span>
                  </div>
                </td>
                <td className="px-4 py-4 text-right pr-6 align-top pt-5">
                  <div className="text-sm font-bold text-alloro-navy tabular-nums font-heading">
                    $
                    {source.production.toLocaleString(undefined, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </div>
                </td>
              </motion.tr>
            ))}

            {pagedData.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="px-6 py-12 text-center text-sm text-slate-500"
                >
                  <div className="rounded-lg border border-dashed border-slate-200 p-6">
                    No referral source data available
                    {searchQuery && " matching your search"}.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Pagination */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/30 rounded-b-2xl flex justify-between items-center">
        <span className="text-xs text-slate-500 font-medium">
          Showing{" "}
          {filteredData.length > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0}-
          {Math.min(currentPage * PAGE_SIZE, filteredData.length)} of{" "}
          {filteredData.length}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-alloro-navy hover:border-alloro-navy transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={14} />
          </button>
          <button className="w-8 h-8 flex items-center justify-center rounded-lg border border-alloro-navy bg-alloro-navy text-white shadow-sm">
            <span className="text-xs font-bold">{currentPage}</span>
          </button>
          <button
            onClick={() =>
              setCurrentPage((prev) => Math.min(prev + 1, totalPages))
            }
            disabled={currentPage === totalPages}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-alloro-navy hover:border-alloro-navy transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </motion.div>
  );
};
