/**
 * Competitor Detail Drawer — right-side slide-in panel.
 *
 * Shows: GBP data, review velocity, gap-closing timeline.
 * Opens when a competitor is clicked in the leaderboard.
 */

import { X, Star, MessageSquare, Clock } from "lucide-react";

interface CompetitorData {
  name: string;
  rating: number;
  reviewCount: number;
  category?: string;
}

interface CompetitorDrawerProps {
  competitor: CompetitorData | null;
  clientReviews: number;
  clientVelocityPerWeek: number | null; // reviews per week
  onClose: () => void;
}

export default function CompetitorDrawer({
  competitor,
  clientReviews,
  onClose,
}: CompetitorDrawerProps) {
  if (!competitor) return null;

  const reviewGap = competitor.reviewCount - clientReviews;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 z-50 h-full w-full sm:w-[360px] bg-white border-l border-gray-200 shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#1A1D23] truncate pr-4">
            {competitor.name}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-500 transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* GBP Data */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
              Google Business Profile
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-400" />
                  <span className="text-sm text-gray-700">Rating</span>
                </div>
                <span className="text-sm font-semibold text-[#1A1D23]">{competitor.rating} stars</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-blue-400" />
                  <span className="text-sm text-gray-700">Reviews</span>
                </div>
                <span className="text-sm font-semibold text-[#1A1D23]">{competitor.reviewCount}</span>
              </div>
              {competitor.category && (
                <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                  <span className="text-sm text-gray-700">Category</span>
                  <span className="text-sm font-medium text-gray-500">{competitor.category}</span>
                </div>
              )}
            </div>
          </div>

          {/* Review Gap */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
              Review Gap
            </p>
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500">Their reviews</span>
                <span className="text-lg font-semibold text-[#1A1D23]">{competitor.reviewCount}</span>
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-500">Your reviews</span>
                <span className="text-lg font-semibold text-[#1A1D23]">{clientReviews}</span>
              </div>
              {reviewGap > 0 && (
                <div className="flex items-center justify-between bg-[#D56753]/5 rounded-lg px-3 py-2">
                  <span className="text-sm font-medium text-[#D56753]">Gap</span>
                  <span className="text-sm font-semibold text-[#D56753]">{reviewGap} reviews</span>
                </div>
              )}
              {reviewGap <= 0 && (
                <div className="flex items-center justify-between bg-emerald-50 rounded-lg px-3 py-2">
                  <span className="text-sm font-medium text-emerald-700">You lead by</span>
                  <span className="text-sm font-semibold text-emerald-700">{Math.abs(reviewGap)} reviews</span>
                </div>
              )}
            </div>
          </div>

          {/* Review Gap */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
              Review Gap
            </p>
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-[#D56753] shrink-0" />
                <p className="text-sm text-[#1A1D23] leading-relaxed">
                  {reviewGap <= 0 ? (
                    "You're ahead on reviews. Keep the momentum."
                  ) : (
                    `${reviewGap} review${reviewGap !== 1 ? "s" : ""} separate you. Alloro is tracking this.`
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
