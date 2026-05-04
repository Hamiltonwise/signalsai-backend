export function ReviewsLoadingSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading reviews">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[0, 1, 2].map((item) => (
          <div key={item} className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="h-4 w-28 bg-gray-100 rounded animate-pulse" />
            <div className="h-8 w-20 bg-gray-100 rounded mt-4 animate-pulse" />
          </div>
        ))}
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="h-4 w-44 bg-gray-100 rounded animate-pulse" />
        {[0, 1, 2].map((item) => (
          <div key={item} className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-gray-100 animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
              <div className="h-3 w-full bg-gray-100 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
