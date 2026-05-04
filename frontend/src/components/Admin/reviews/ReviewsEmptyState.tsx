import { Star } from "lucide-react";

type ReviewsEmptyStateProps = {
  total: number;
  hasFilters: boolean;
  hasLocations: boolean;
  showHidden: boolean;
};

export function ReviewsEmptyState({
  total,
  hasFilters,
  hasLocations,
  showHidden,
}: ReviewsEmptyStateProps) {
  let title = "No reviews yet.";
  let description = hasLocations
    ? "Fetch from Google Maps to pull reviews for this project."
    : "Add GBP locations before fetching reviews.";

  if (total > 0 && hasFilters) {
    title = "No reviews match your filters.";
    description = "Clear search or star filters to see more reviews.";
  } else if (total > 0 && !showHidden) {
    title = "No visible reviews.";
    description = "All matching reviews may be hidden. Toggle Show hidden to inspect them.";
  }

  return (
    <div className="text-center py-12 text-gray-400">
      <Star className="w-8 h-8 mx-auto mb-2 text-gray-300" />
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="text-xs mt-1">{description}</p>
    </div>
  );
}
