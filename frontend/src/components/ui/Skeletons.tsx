import React from "react";

/**
 * MetricCardSkeleton
 * Loading state for metric cards
 */
export const MetricCardSkeleton: React.FC = () => (
  <div className="flex flex-col p-6 rounded-2xl border border-black/5 bg-white animate-pulse">
    <div className="h-3 w-24 bg-slate-200 rounded mb-4"></div>
    <div className="flex items-center justify-between">
      <div className="h-8 w-20 bg-slate-200 rounded"></div>
      <div className="h-6 w-16 bg-slate-100 rounded"></div>
    </div>
  </div>
);

/**
 * TableRowSkeleton
 * Loading state for table rows
 */
export const TableRowSkeleton: React.FC<{ columnCount?: number }> = ({
  columnCount = 5,
}) => (
  <tr className="border-b border-slate-100">
    {[...Array(columnCount)].map((_, i) => (
      <td key={i} className="px-6 py-4">
        <div className="h-4 bg-slate-200 rounded animate-pulse"></div>
      </td>
    ))}
  </tr>
);

/**
 * TaskCardSkeleton
 * Loading state for task cards
 */
export const TaskCardSkeleton: React.FC = () => (
  <div className="bg-white rounded-3xl p-8 border border-black/5 animate-pulse">
    <div className="flex gap-6 items-start">
      <div className="w-8 h-8 bg-slate-200 rounded-xl shrink-0"></div>
      <div className="flex-1 space-y-4">
        <div className="h-6 w-3/4 bg-slate-200 rounded"></div>
        <div className="h-4 w-full bg-slate-100 rounded"></div>
        <div className="h-4 w-5/6 bg-slate-100 rounded"></div>
      </div>
    </div>
  </div>
);

/**
 * NotificationSkeleton
 * Loading state for notification items
 */
export const NotificationSkeleton: React.FC = () => (
  <div className="border-b border-black/5 p-10 lg:p-14 animate-pulse">
    <div className="flex gap-8">
      <div className="w-16 h-16 rounded-2xl bg-slate-200 shrink-0"></div>
      <div className="flex-1 space-y-4">
        <div className="flex justify-between items-start gap-6">
          <div className="h-6 w-1/3 bg-slate-200 rounded"></div>
          <div className="h-6 w-24 bg-slate-100 rounded"></div>
        </div>
        <div className="h-4 w-full bg-slate-100 rounded"></div>
        <div className="h-4 w-5/6 bg-slate-100 rounded"></div>
      </div>
    </div>
  </div>
);

/**
 * ChartSkeleton
 * Loading state for charts
 */
export const ChartSkeleton: React.FC = () => (
  <div className="bg-white rounded-3xl border border-black/5 p-10 animate-pulse">
    <div className="space-y-6">
      <div className="h-6 w-1/3 bg-slate-200 rounded"></div>
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-12 w-full bg-slate-100 rounded"></div>
        ))}
      </div>
    </div>
  </div>
);

/**
 * PageSkeleton
 * Full page loading skeleton
 */
export const PageSkeleton: React.FC = () => (
  <div className="min-h-screen bg-alloro-bg animate-pulse">
    {/* Header */}
    <div className="h-20 bg-white border-b border-black/5"></div>

    {/* Content */}
    <div className="max-w-[1100px] mx-auto px-6 lg:px-10 py-12 space-y-16">
      {/* Hero Section */}
      <div className="space-y-4">
        <div className="h-8 w-32 bg-slate-200 rounded"></div>
        <div className="h-12 w-96 max-w-full bg-slate-200 rounded"></div>
        <div className="h-6 w-80 max-w-full bg-slate-100 rounded"></div>
      </div>

      {/* Card Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-2xl border border-black/5 p-6 h-48"
          ></div>
        ))}
      </div>

      {/* Content Blocks */}
      <div className="space-y-4">
        <div className="h-6 w-24 bg-slate-200 rounded"></div>
        <div className="h-64 bg-white rounded-2xl border border-black/5"></div>
      </div>
    </div>
  </div>
);

/**
 * ShimmerSkeleton
 * Skeleton with shimmer effect
 */
export const ShimmerSkeleton: React.FC<{
  width?: string;
  height?: string;
  className?: string;
}> = ({ width = "w-full", height = "h-6", className = "" }) => (
  <div
    className={`${width} ${height} ${className} skeleton-shimmer rounded`}
  ></div>
);

/**
 * HeaderSkeleton
 * Loading state for page headers
 */
export const HeaderSkeleton: React.FC = () => (
  <header className="glass-header border-b border-black/5">
    <div className="max-w-[1100px] mx-auto px-6 lg:px-10 py-6 flex items-center justify-between animate-pulse">
      <div className="flex items-center gap-5">
        <div className="w-10 h-10 bg-slate-200 rounded-xl"></div>
        <div className="space-y-2">
          <div className="h-4 w-32 bg-slate-200 rounded"></div>
          <div className="h-3 w-48 bg-slate-100 rounded"></div>
        </div>
      </div>
      <div className="h-10 w-32 bg-slate-200 rounded-xl"></div>
    </div>
  </header>
);

/**
 * DashboardCardSkeleton
 * Loading state for dashboard cards
 */
export const DashboardCardSkeleton: React.FC = () => (
  <div className="bg-white rounded-2xl border border-black/5 p-6 animate-pulse">
    <div className="space-y-4">
      <div className="h-4 w-20 bg-slate-200 rounded"></div>
      <div className="h-10 w-32 bg-slate-200 rounded"></div>
      <div className="h-3 w-24 bg-slate-100 rounded"></div>
    </div>
  </div>
);
