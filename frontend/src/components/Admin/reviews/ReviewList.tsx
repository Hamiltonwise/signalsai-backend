import type { ReviewItem } from "../../../api/reviewBlocks";
import { ReviewsEmptyState } from "./ReviewsEmptyState";
import { ReviewRow } from "./ReviewRow";

type ReviewListProps = {
  reviews: ReviewItem[];
  total: number;
  hasFilters: boolean;
  showHidden: boolean;
  hasLocations: boolean;
  onToggleHidden: (review: ReviewItem) => void;
  onDelete: (review: ReviewItem) => void;
};

export function ReviewList({
  reviews,
  total,
  hasFilters,
  showHidden,
  hasLocations,
  onToggleHidden,
  onDelete,
}: ReviewListProps) {
  if (reviews.length === 0) {
    return (
      <ReviewsEmptyState
        total={total}
        hasFilters={hasFilters}
        hasLocations={hasLocations}
        showHidden={showHidden}
      />
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400">
        {reviews.length} review{reviews.length !== 1 ? "s" : ""}
      </p>
      {reviews.map((review) => (
        <ReviewRow
          key={review.id}
          review={review}
          onToggleHidden={() => onToggleHidden(review)}
          onDelete={() => onDelete(review)}
        />
      ))}
    </div>
  );
}
