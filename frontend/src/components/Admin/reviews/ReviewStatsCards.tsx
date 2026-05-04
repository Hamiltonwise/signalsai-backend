import { Star } from "lucide-react";
import type { ReviewStats } from "../../../api/reviewBlocks";

type ReviewStatsCardsProps = {
  stats: ReviewStats;
};

export function ReviewStatsCards({ stats }: ReviewStatsCardsProps) {
  const total = Math.max(stats.total, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <StatCard label="Total Reviews" value={stats.total.toLocaleString()} />
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-sm text-gray-500">Average Rating</p>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-3xl font-bold text-gray-900 tabular-nums">
            {stats.average.toFixed(1)}
          </p>
          <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-sm text-gray-500">Rating Distribution</p>
        <div className="space-y-2 mt-3">
          {[5, 4, 3, 2, 1].map((stars) => {
            const count = stats.distribution[stars] || 0;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;

            return (
              <div key={stars} className="grid grid-cols-[24px_1fr_72px] items-center gap-2">
                <span className="text-xs text-gray-500 tabular-nums">{stars}</span>
                <progress
                  className="w-full h-2 rounded-full overflow-hidden [&::-webkit-progress-bar]:bg-gray-100 [&::-webkit-progress-value]:bg-yellow-400 [&::-moz-progress-bar]:bg-yellow-400"
                  max={total || 1}
                  value={count}
                  aria-label={`${stars} star reviews`}
                />
                <span className="text-xs text-gray-500 text-right tabular-nums">
                  {count} ({pct}%)
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1 tabular-nums">{value}</p>
    </div>
  );
}
