/**
 * Reviews -- "What are people saying?"
 *
 * The question every business owner checks at 10pm.
 * "Did anyone leave a review? Was it bad? Should I respond?"
 *
 * Data priority:
 * 1. review_notifications (individual reviews + AI drafts from /user/review-drafts)
 * 2. checkup_data.place.reviews (fallback from GBP checkup)
 *
 * Sections:
 * 1. Header with aggregate rating from checkup_data
 * 2. Recent reviews (from best available source, with AI drafts inline)
 * 3. Review velocity (you vs competitor)
 * 4. Sentiment summary (your moat words)
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Star,
  MessageSquare,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Check,
  Sparkles,
} from "lucide-react";
import { apiGet, apiPatch } from "@/api/index";
import { useAuth } from "@/hooks/useAuth";

// ─── Types ─────────────────────────────────────────────────────────

interface ReviewNotification {
  id: number;
  reviewer_name: string | null;
  star_rating: number | null;
  review_text: string | null;
  ai_response: string | null;
  status: string;
  postable: boolean;
  review_published_at: string | null;
  created_at: string;
}

interface CheckupReview {
  rating?: number;
  text?: string | { text?: string };
  authorAttribution?: { displayName?: string };
  authorName?: string;
  relativePublishTimeDescription?: string;
}

// ─── Collapsible Section ───────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl bg-[#F5F3EF] border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-100/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-gray-400" />}
          <h2 className="text-sm font-semibold text-[#1A1D23] uppercase tracking-wider">
            {title}
          </h2>
        </div>
        {open ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </button>
      {open && <div className="px-6 pb-6">{children}</div>}
    </div>
  );
}

// ─── Star Rating Display ───────────────────────────────────────────

function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const starSize = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";
  return (
    <div className="flex">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`${starSize} ${
            i < rating ? "text-amber-400 fill-current" : "text-gray-200"
          }`}
        />
      ))}
    </div>
  );
}

// ─── Review Card (review_notifications source) ─────────────────────

function NotificationReviewCard({
  review,
  onApprove,
  approveError,
  isApproving,
}: {
  review: ReviewNotification;
  onApprove: (id: number) => void;
  approveError: string | null;
  isApproving: boolean;
}) {
  const publishDate = review.review_published_at || review.created_at;
  const formattedDate = publishDate
    ? new Date(publishDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="rounded-xl bg-[#FAFAF7] border border-gray-100 p-4 space-y-3">
      {/* Review header */}
      <div className="flex items-center gap-2">
        <StarRating rating={review.star_rating || 5} />
        <span className="text-xs text-[#1A1D23]/60">
          {review.reviewer_name || "Customer"}
        </span>
        {formattedDate && (
          <span className="text-xs text-[#1A1D23]/30">{formattedDate}</span>
        )}
      </div>

      {/* Review text */}
      {review.review_text && (
        <p className="text-sm text-[#1A1D23]/80 leading-relaxed">
          {review.review_text}
        </p>
      )}

      {/* AI draft response */}
      {review.ai_response && review.status === "new" && (
        <div className="rounded-lg bg-[#F0EDE8] border border-gray-200/60 p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#D56753]" />
            <span className="text-xs font-medium text-[#1A1D23]/60">
              Suggested response
            </span>
          </div>
          <p className="text-sm text-[#1A1D23]/70 leading-relaxed">
            {review.ai_response}
          </p>
          {review.postable ? (
            <div className="pt-1 space-y-1.5">
              <button
                onClick={() => onApprove(review.id)}
                disabled={isApproving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#D56753] text-white text-xs font-medium hover:bg-[#C05A48] transition-colors disabled:opacity-50"
              >
                <Check className="w-3 h-3" />
                {isApproving ? "Posting..." : "Approve and Post"}
              </button>
              {approveError && (
                <p className="text-xs text-red-500">{approveError}</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-[#1A1D23]/40 pt-1">
              Copy this response and post it on your Google Business Profile.
            </p>
          )}
        </div>
      )}

      {/* Already responded indicator */}
      {review.status === "responded" && (
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <Check className="w-3 h-3" />
          Response drafted
        </div>
      )}
    </div>
  );
}

// ─── Review Card (checkup_data fallback source) ────────────────────

function CheckupReviewCard({ review }: { review: CheckupReview }) {
  const reviewText =
    typeof review.text === "object" ? review.text?.text : review.text;
  const authorName =
    review.authorAttribution?.displayName || review.authorName || "Customer";

  return (
    <div className="border-b border-gray-100 last:border-0 pb-3 last:pb-0">
      <div className="flex items-center gap-2 mb-1">
        <StarRating rating={review.rating || 5} />
        <span className="text-xs text-[#1A1D23]/60">{authorName}</span>
        {review.relativePublishTimeDescription && (
          <span className="text-xs text-[#1A1D23]/30">
            {review.relativePublishTimeDescription}
          </span>
        )}
      </div>
      {reviewText && (
        <p className="text-sm text-[#1A1D23]/70 leading-relaxed line-clamp-3">
          {reviewText}
        </p>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────

export default function ReviewsPage() {
  const { userProfile } = useAuth();
  const orgId = userProfile?.organizationId || null;
  const queryClient = useQueryClient();
  const [approveError, setApproveError] = useState<string | null>(null);

  // Approve mutation -- only fires for postable reviews
  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiPatch({ path: `/user/review-drafts/${id}`, passedData: { action: "approve" } });
      return res as { success: boolean; posted?: boolean; message?: string };
    },
    onSuccess: (data) => {
      if (data?.posted) {
        setApproveError(null);
        queryClient.invalidateQueries({ queryKey: ["review-drafts", orgId] });
      } else {
        setApproveError(data?.message || "Could not post to Google. Try again later.");
      }
    },
    onError: () => {
      setApproveError("Could not post to Google. Try again later.");
    },
  });

  // Aggregate review data from checkup
  const { data: ctx } = useQuery<Record<string, unknown>>({
    queryKey: ["reviews-context", orgId],
    queryFn: () => apiGet({ path: "/user/dashboard-context" }),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  // Individual reviews from review_notifications
  const { data: reviewNotifData } = useQuery<{
    success: boolean;
    reviews: ReviewNotification[];
  }>({
    queryKey: ["review-drafts", orgId],
    queryFn: () => apiGet({ path: "/user/review-drafts" }).catch(() => null),
    enabled: !!orgId,
    staleTime: 120_000,
  });

  // Review velocity
  const { data: velocityData } = useQuery<Record<string, number | string> | null>({
    queryKey: ["review-velocity", orgId],
    queryFn: async () => {
      const res = await apiGet({ path: `/user/one-action-card` });
      return (res as Record<string, unknown>)?.card
        ? ((res as Record<string, Record<string, unknown>>).card
            .competitorVelocity as Record<string, number | string> | null)
        : null;
    },
    enabled: !!orgId,
    staleTime: 120_000,
  });

  // Parse checkup data
  const orgData = (ctx as Record<string, Record<string, unknown>> | undefined)?.org;
  let checkupData: Record<string, unknown> | null =
    (orgData?.checkup_data as Record<string, unknown>) || null;
  if (typeof checkupData === "string") {
    try {
      checkupData = JSON.parse(checkupData);
    } catch {
      checkupData = null;
    }
  }

  const placeData = (checkupData?.place as Record<string, unknown>) || {};
  const checkupReviews = (placeData.reviews as CheckupReview[]) || [];
  const reviewCount =
    (placeData.reviewCount as number) ||
    (checkupData?.reviewCount as number) ||
    0;
  const rating = (placeData.rating as number) || null;

  // review_notifications are the primary source
  const notifications = reviewNotifData?.reviews || [];
  const hasNotifications = notifications.length > 0;

  // Sentiment moat words from Oz moments
  const ozMoments = (checkupData?.ozMoments as Array<Record<string, string>>) || [];
  const sentimentWords = ozMoments
    .filter(
      (m) => m.type === "sentiment_moat" || m.type === "review_theme"
    )
    .map((m) => m.keyword || m.title)
    .filter(Boolean)
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-[#F8F6F2]">
      <div className="max-w-[800px] mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-4">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl sm:text-4xl font-semibold text-[#1A1D23] tracking-tight">
            What People Are Saying
          </h1>
          <p className="text-sm text-gray-400 mt-1">Alloro monitors your Google reviews daily. AI-drafted responses appear here within 24 hours of a new review.</p>
          {rating && reviewCount > 0 && (
            <p className="text-sm text-[#1A1D23]/40 mt-1">
              {rating} stars across {reviewCount} reviews
            </p>
          )}
        </motion.div>

        {/* Recent Reviews -- primary source: review_notifications */}
        <Section title="Recent Reviews" icon={Star} defaultOpen={true}>
          {hasNotifications ? (
            <div className="space-y-3">
              {notifications.slice(0, 10).map((review) => (
                <NotificationReviewCard
                  key={review.id}
                  review={review}
                  onApprove={(id) => { setApproveError(null); approveMutation.mutate(id); }}
                  approveError={approveError}
                  isApproving={approveMutation.isPending}
                />
              ))}
            </div>
          ) : checkupReviews.length > 0 ? (
            <div className="space-y-3">
              {checkupReviews.slice(0, 5).map((review, i) => (
                <CheckupReviewCard key={i} review={review} />
              ))}
            </div>
          ) : reviewCount > 0 ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-[#1A1D23]">
                You have {reviewCount} reviews at {rating} stars on Google.
              </p>
              <p className="text-sm text-[#1A1D23]/50">
                Alloro syncs your Google reviews daily. Individual reviews with AI-drafted responses will appear here within 24 hours.
              </p>
              {/* Skeleton review cards */}
              {[1, 2].map((i) => (
                <div key={i} className="rounded-xl bg-[#FAFAF7] border border-gray-100 p-4 animate-pulse">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5].map(s => <div key={s} className="w-3.5 h-3.5 bg-gray-200 rounded" />)}
                    </div>
                    <div className="h-3 w-20 bg-gray-200 rounded" />
                  </div>
                  <div className="h-4 w-full bg-gray-100 rounded mb-1" />
                  <div className="h-4 w-3/4 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-[#1A1D23]">Your reviews will appear here</p>
              <p className="text-sm text-[#1A1D23]/50">
                Once your Google Business Profile is connected, Alloro syncs your reviews daily at 4 AM and generates AI-drafted responses for each one.
              </p>
            </div>
          )}
        </Section>

        {/* Pending AI Drafts count (quick glance) */}
        {hasNotifications &&
          notifications.filter((r) => r.ai_response && r.status === "new").length >
            0 && (
            <div className="rounded-xl bg-[#FDF4F2] border border-[#D56753]/10 px-5 py-3 flex items-center gap-3">
              <MessageSquare className="w-4 h-4 text-[#D56753]" />
              <p className="text-sm text-[#1A1D23]/70">
                <span className="font-medium text-[#1A1D23]">
                  {
                    notifications.filter(
                      (r) => r.ai_response && r.status === "new"
                    ).length
                  }{" "}
                  AI-drafted responses
                </span>{" "}
                ready for your approval above.
              </p>
            </div>
          )}

        {/* Review Velocity */}
        <Section title="Review Velocity" icon={TrendingUp} defaultOpen={true}>
          {velocityData ? (
            <div className="flex items-center gap-6 text-sm">
              <div>
                <p className="text-[#1A1D23]/40 text-xs uppercase tracking-wider">
                  You
                </p>
                <p className="text-lg font-semibold text-[#1A1D23]">
                  {(velocityData as Record<string, unknown>).clientReviewsThisMonth as number}
                </p>
                <p className="text-xs text-[#1A1D23]/40">this month</p>
              </div>
              <div className="w-px h-10 bg-gray-200" />
              <div>
                <p className="text-[#1A1D23]/40 text-xs uppercase tracking-wider">
                  {(velocityData as Record<string, unknown>).competitorName as string}
                </p>
                <p className="text-lg font-semibold text-[#1A1D23]">
                  {(velocityData as Record<string, unknown>).competitorReviewsThisMonth as number}
                </p>
                <p className="text-xs text-[#1A1D23]/40">this month</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-[#1A1D23]/50">
                Review velocity compares your new reviews per month against your top competitor.
              </p>
              <p className="text-sm text-[#1A1D23]/40">
                This data appears after your first week of tracking.
              </p>
            </div>
          )}
        </Section>

        {/* Sentiment Summary */}
        {sentimentWords.length > 0 && (
          <Section title="Your Words" defaultOpen={false}>
            <p className="text-sm text-[#1A1D23]/60 mb-3">
              Words your customers use that competitors' customers don't.
              These are your moat.
            </p>
            <div className="flex flex-wrap gap-2">
              {sentimentWords.map((word, i) => (
                <span
                  key={i}
                  className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-sm font-medium border border-emerald-100"
                >
                  {word}
                </span>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
