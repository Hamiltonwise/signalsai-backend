import { Eye, EyeOff, Star, Trash2 } from "lucide-react";
import type { ReviewItem } from "../../../api/reviewBlocks";

type ReviewRowProps = {
  review: ReviewItem;
  onToggleHidden: () => void;
  onDelete: () => void;
};

export function ReviewRow({ review, onToggleHidden, onDelete }: ReviewRowProps) {
  const date = review.review_created_at
    ? new Date(review.review_created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <div className={`flex items-start gap-3 bg-white border rounded-lg px-4 py-3 transition-colors ${
      review.hidden ? "border-gray-100 opacity-50" : "border-gray-200 hover:border-gray-300"
    }`}>
      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-sm font-medium overflow-hidden">
        {review.reviewer_photo_url ? (
          <img src={review.reviewer_photo_url} alt="" className="w-full h-full object-cover" />
        ) : (
          (review.reviewer_name || "?")[0]?.toUpperCase()
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-900">
            {review.reviewer_name || "Anonymous"}
          </span>
          <div className="flex" aria-label={`${review.stars} star review`}>
            {[1, 2, 3, 4, 5].map((stars) => (
              <Star
                key={stars}
                className={`w-3.5 h-3.5 ${stars <= review.stars ? "text-yellow-400 fill-yellow-400" : "text-gray-200"}`}
              />
            ))}
          </div>
          {date && <span className="text-xs text-gray-400">{date}</span>}
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
            review.source === "apify" ? "bg-purple-50 text-purple-500" : "bg-blue-50 text-blue-500"
          }`}>
            {review.source === "apify" ? "Maps" : "GBP"}
          </span>
          {review.hidden && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">
              Hidden
            </span>
          )}
        </div>
        {review.text && <p className="text-sm text-gray-600 mt-1 line-clamp-2">{review.text}</p>}
        {review.has_reply && review.reply_text && (
          <div className="mt-1.5 pl-3 border-l-2 border-alloro-orange/30">
            <p className="text-xs text-gray-500 line-clamp-1">
              <span className="font-medium text-alloro-orange">Owner reply:</span> {review.reply_text}
            </p>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={onToggleHidden}
          className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
          title={review.hidden ? "Show review" : "Hide review"}
          aria-label={review.hidden ? "Show review" : "Hide review"}
        >
          {review.hidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
          title="Delete review"
          aria-label="Delete review"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
