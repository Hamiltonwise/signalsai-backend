import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3 } from "lucide-react";

export interface ReferralSource {
  rank: number;
  name: string;
  percentage: number;
  referrals: number;
  production: number;
}

interface TopReferralSourcesProps {
  data?: ReferralSource[];
  subtitle?: string;
}

const DEFAULT_SOURCES: ReferralSource[] = [
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
  subtitle = "Aggregated PMS production",
}) => {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(Math.ceil(data.length / PAGE_SIZE), 1);

  const pagedData = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return data.slice(start, start + PAGE_SIZE);
  }, [data, currentPage]);

  const maxPercentage = pagedData.length
    ? Math.max(...pagedData.map((source) => source.percentage))
    : 0;
  const denominator = maxPercentage <= 0 ? 1 : maxPercentage;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-6"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-purple-100 p-2">
            <BarChart3 className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Top Referral Sources</h3>
            <p className="text-sm text-gray-600">{subtitle}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {pagedData.map((source, index) => (
          <motion.div
            key={`${source.rank}-${source.name}`}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05, duration: 0.4 }}
            className="space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-100 text-xs font-semibold text-purple-600">
                  {source.rank}
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">{source.name}</h4>
                  <p className="text-xs text-gray-500">
                    {source.percentage}% of total referrals
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-semibold text-gray-900">
                  {Math.round(source.referrals).toLocaleString()}
                </div>
                <p className="text-xs text-gray-500">referrals</p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="relative h-3 overflow-hidden rounded-full bg-gray-100">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    width: `${Math.min(
                      (source.percentage / denominator) * 100,
                      100
                    )}%`,
                  }}
                  transition={{ delay: index * 0.1 + 0.3, duration: 0.4 }}
                  className="h-full rounded-full bg-gradient-to-r from-purple-500 via-purple-600 to-purple-700"
                />
              </div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.1 + 0.4, duration: 0.3 }}
                className="text-xs text-gray-500"
              >
                Production: $
                {source.production.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </motion.div>
            </div>
          </motion.div>
        ))}

        {!data.length && (
          <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
            No referral source data available yet.
          </div>
        )}
      </div>

      {data.length > PAGE_SIZE && (
        <div className="mt-6 flex items-center justify-between text-xs text-gray-600">
          <span>
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–
            {Math.min(currentPage * PAGE_SIZE, data.length)} of {data.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="rounded-full border border-gray-200 px-3 py-1 font-semibold uppercase text-gray-600 transition hover:border-purple-200 hover:text-purple-600 disabled:cursor-not-allowed disabled:border-gray-100 disabled:text-gray-300"
            >
              Previous
            </button>
            <span className="font-semibold text-gray-500">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
              disabled={currentPage === totalPages}
              className="rounded-full border border-gray-200 px-3 py-1 font-semibold uppercase text-gray-600 transition hover:border-purple-200 hover:text-purple-600 disabled:cursor-not-allowed disabled:border-gray-100 disabled:text-gray-300"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
};
