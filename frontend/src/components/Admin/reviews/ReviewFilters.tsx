import { Filter, Search, Star } from "lucide-react";

type ReviewFiltersProps = {
  searchTerm: string;
  starFilter: number | null;
  showHidden: boolean;
  onSearchChange: (value: string) => void;
  onStarFilterChange: (value: number | null) => void;
  onShowHiddenChange: (value: boolean) => void;
};

export function ReviewFilters({
  searchTerm,
  starFilter,
  showHidden,
  onSearchChange,
  onStarFilterChange,
  onShowHiddenChange,
}: ReviewFiltersProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="relative flex-1 min-w-[220px] max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by name or comment..."
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloro-orange/40 focus:border-alloro-orange"
        />
      </div>
      <div className="flex items-center gap-1">
        <Filter className="w-4 h-4 text-gray-400 mr-1" />
        {[1, 2, 3, 4, 5].map((stars) => (
          <button
            key={stars}
            type="button"
            onClick={() => onStarFilterChange(starFilter === stars ? null : stars)}
            className={`flex items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
              starFilter === stars
                ? "bg-yellow-100 text-yellow-700 border border-yellow-300"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200 border border-transparent"
            }`}
          >
            {stars} <Star className="w-3 h-3" />
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={showHidden}
          onChange={(event) => onShowHiddenChange(event.target.checked)}
          className="rounded border-gray-300 text-alloro-orange focus:ring-alloro-orange/40"
        />
        Show hidden
      </label>
    </div>
  );
}
