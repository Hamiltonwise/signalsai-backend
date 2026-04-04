/**
 * Reviews -- "What are people saying?"
 *
 * The question every business owner checks at 10pm.
 * "Did anyone leave a review? Was it bad? Should I respond?"
 *
 * Sections:
 * 1. Recent reviews (from GBP, with AI-drafted responses)
 * 2. Review velocity (you vs competitor)
 * 3. Send review requests (one tap each)
 * 4. Sentiment summary (your moat words)
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Star, MessageSquare, TrendingUp, ChevronDown, ChevronRight } from "lucide-react";
import { apiGet } from "@/api/index";
import { useAuth } from "@/hooks/useAuth";

// ─── Collapsible Section ────────────────────────────────────────────

function Section({ title, icon: Icon, defaultOpen = true, children }: {
  title: string;
  icon?: any;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-gray-400" />}
          <h2 className="text-sm font-semibold text-[#1A1D23] uppercase tracking-wider">{title}</h2>
        </div>
        {open
          ? <ChevronDown className="w-4 h-4 text-gray-400" />
          : <ChevronRight className="w-4 h-4 text-gray-400" />
        }
      </button>
      {open && <div className="px-6 pb-6">{children}</div>}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────

export default function ReviewsPage() {
  const { userProfile } = useAuth();
  const orgId = userProfile?.organizationId || null;

  // Recent reviews from GBP/checkup data
  const { data: ctx } = useQuery<any>({
    queryKey: ["reviews-context", orgId],
    queryFn: () => apiGet({ path: "/user/dashboard-context" }),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  // AI review drafts
  const { data: draftsData } = useQuery<any>({
    queryKey: ["review-drafts", orgId],
    queryFn: () => apiGet({ path: "/user/review-drafts" }).catch(() => null),
    enabled: !!orgId,
    staleTime: 120_000,
  });

  // Review velocity
  const { data: velocityData } = useQuery<any>({
    queryKey: ["review-velocity", orgId],
    queryFn: async () => {
      const res = await apiGet({ path: `/user/one-action-card` });
      return res?.card?.competitorVelocity || null;
    },
    enabled: !!orgId,
    staleTime: 120_000,
  });

  let checkupData = ctx?.org?.checkup_data || null;
  if (typeof checkupData === "string") {
    try { checkupData = JSON.parse(checkupData); } catch { checkupData = null; }
  }

  const reviews = checkupData?.place?.reviews || [];
  const reviewCount = checkupData?.place?.reviewCount || checkupData?.reviewCount || 0;
  const rating = checkupData?.place?.rating || null;
  const drafts = draftsData?.drafts || [];

  // Extract sentiment moat words from Oz moments or findings
  const ozMoments = checkupData?.ozMoments || [];
  const sentimentWords = ozMoments
    .filter((m: any) => m.type === "sentiment_moat" || m.type === "review_theme")
    .map((m: any) => m.keyword || m.title)
    .filter(Boolean)
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-[#F8F6F2]">
      <div className="max-w-[800px] mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-4">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-lg font-semibold text-[#1A1D23]">What People Are Saying</h1>
          {rating && reviewCount > 0 && (
            <p className="text-sm text-gray-500 mt-1">
              {rating} stars across {reviewCount} reviews
            </p>
          )}
        </motion.div>

        {/* Recent Reviews */}
        <Section title="Recent Reviews" icon={Star} defaultOpen={true}>
          {reviews.length > 0 ? (
            <div className="space-y-3">
              {reviews.slice(0, 5).map((review: any, i: number) => (
                <div key={i} className="border-b border-gray-50 last:border-0 pb-3 last:pb-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex">
                      {Array.from({ length: 5 }).map((_, si) => (
                        <Star
                          key={si}
                          className={`w-3.5 h-3.5 ${si < (review.rating || 5) ? "text-amber-400 fill-current" : "text-gray-200"}`}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-gray-400">
                      {review.authorAttribution?.displayName || review.authorName || "Customer"}
                    </span>
                    {review.relativePublishTimeDescription && (
                      <span className="text-xs text-gray-300">{review.relativePublishTimeDescription}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed line-clamp-3">
                    {review.text?.text || review.text || ""}
                  </p>
                </div>
              ))}
            </div>
          ) : reviewCount > 0 ? (
            <p className="text-sm text-gray-500">
              You have {reviewCount} reviews at {rating} stars on Google. Individual review details will appear here after your next ranking scan.
            </p>
          ) : (
            <p className="text-sm text-gray-500">
              Review data will appear here after your first ranking scan.
            </p>
          )}
        </Section>

        {/* AI Response Drafts */}
        {drafts.length > 0 && (
          <Section title="Drafts Ready to Send" icon={MessageSquare} defaultOpen={true}>
            <div className="space-y-3">
              {drafts.map((draft: any, i: number) => (
                <div key={i} className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs text-gray-400 mb-1">Response to {draft.reviewerName || "a review"}</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{draft.body}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <button className="text-xs font-semibold text-alloro-orange hover:text-alloro-navy transition-colors">
                      Approve and Post
                    </button>
                    <span className="text-gray-300">|</span>
                    <button className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                      Edit
                    </button>
                    <button className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                      Skip
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Review Velocity */}
        <Section title="Review Velocity" icon={TrendingUp} defaultOpen={true}>
          {velocityData ? (
            <div className="flex items-center gap-6 text-sm">
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider">You</p>
                <p className="text-lg font-semibold text-[#1A1D23]">{velocityData.clientReviewsThisMonth}</p>
                <p className="text-xs text-gray-400">this month</p>
              </div>
              <div className="w-px h-10 bg-gray-200" />
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider">{velocityData.competitorName}</p>
                <p className="text-lg font-semibold text-[#1A1D23]">{velocityData.competitorReviewsThisMonth}</p>
                <p className="text-xs text-gray-400">this month</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              Velocity data appears after your first week of tracking.
            </p>
          )}
        </Section>

        {/* Review Request removed: ICP uses their PMS system for review requests */}

        {/* Sentiment Summary */}
        {sentimentWords.length > 0 && (
          <Section title="Your Words" defaultOpen={false}>
            <p className="text-sm text-gray-600 mb-3">
              Words your customers use that competitors' customers don't. These are your moat.
            </p>
            <div className="flex flex-wrap gap-2">
              {sentimentWords.map((word: string, i: number) => (
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
