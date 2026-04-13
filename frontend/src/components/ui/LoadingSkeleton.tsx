/**
 * LoadingSkeleton -- reusable animated pulse bars.
 *
 * Props: width, height, borderRadius, count.
 * Use wherever data loads to prevent white flash.
 */

interface LoadingSkeletonProps {
  width?: string;
  height?: string;
  borderRadius?: string;
  count?: number;
  className?: string;
}

export default function LoadingSkeleton({
  width = "100%",
  height = "1rem",
  borderRadius = "0.5rem",
  count = 1,
  className = "",
}: LoadingSkeletonProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{
            width: i === count - 1 && count > 1 ? "75%" : width,
            height,
            borderRadius,
          }}
        />
      ))}
    </div>
  );
}

/** Pre-built skeleton for a card (rounded-2xl, border, padding) */
export function CardSkeleton({ height = "7rem" }: { height?: string }) {
  return (
    <div
      className="rounded-2xl border border-[#D56753]/6 bg-gradient-to-br from-white to-[#FFF9F7]"
      style={{ height }}
    >
      <div className="h-full w-full skeleton-shimmer rounded-2xl" />
    </div>
  );
}

/** Pre-built skeleton for the reading summary area */
export function ReadingSummarySkeleton() {
  return (
    <div className="flex justify-center py-4">
      <div className="w-[180px] h-[180px] rounded-full border-[12px] border-[#D56753]/[0.06] skeleton-shimmer" />
    </div>
  );
}
