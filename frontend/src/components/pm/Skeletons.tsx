export function ProjectCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-10 w-10 rounded-xl bg-gray-200" />
        <div className="flex-1">
          <div className="h-4 w-32 rounded bg-gray-200 mb-1" />
          <div className="h-3 w-16 rounded bg-gray-200" />
        </div>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-200" />
    </div>
  );
}

export function TaskCardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-pm-border bg-pm-bg-secondary p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-2.5 w-2.5 rounded-full bg-gray-200" />
      </div>
      <div className="h-3.5 w-3/4 rounded bg-gray-200 mb-2" />
      <div className="h-3 w-1/3 rounded bg-gray-200" />
    </div>
  );
}

export function StatsRowSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-lg bg-gray-200" />
            <div className="h-3 w-16 rounded bg-gray-200" />
          </div>
          <div className="h-7 w-12 rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}


export function ActivityEntrySkeleton() {
  return (
    <div className="animate-pulse flex items-start gap-3 px-5 py-3">
      <div className="mt-1 h-2.5 w-2.5 rounded-full bg-gray-200" />
      <div className="flex-1">
        <div className="h-3.5 w-48 rounded bg-gray-200 mb-1" />
        <div className="h-3 w-16 rounded bg-gray-200" />
      </div>
    </div>
  );
}
