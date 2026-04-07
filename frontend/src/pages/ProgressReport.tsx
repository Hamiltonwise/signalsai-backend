/**
 * Progress -- "Am I getting better?"
 *
 * Shows how your readings have changed over time.
 * No scores. No 365-day summaries for 2-week-old accounts.
 * Raw readings: then vs now. What Alloro has done. What changed.
 */

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiGet } from "@/api/index";

// ─── Types ──────────────────────────────────────────────────────────

interface ReadingTrend {
  label: string;
  startValue: string;
  currentValue: string;
  direction: "up" | "down" | "flat";
  context: string;
  verifyUrl?: string;
}

// ─── Component ──────────────────────────────────────────────────────

export default function ProgressReport() {
  const { userProfile } = useAuth();
  const orgId = userProfile?.organizationId || null;

  const { data: ctx } = useQuery<any>({
    queryKey: ["progress-context", orgId],
    queryFn: () => apiGet({ path: "/user/dashboard-context" }),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  // Streaks available at /user/streaks if needed in future

  const checkup = ctx?.org?.checkup_data;
  const orgName = ctx?.org?.name || "";
  const createdAt = ctx?.org?.created_at;
  const place = checkup?.place || {};
  const topCompetitor = checkup?.topCompetitor;
  const competitorName = typeof topCompetitor === "string" ? topCompetitor : topCompetitor?.name || null;

  // Calculate days since signup
  const daysActive = createdAt
    ? Math.max(1, Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  // Build reading trends from available data
  const trends: ReadingTrend[] = [];
  const googleSearchUrl = orgName ? `https://www.google.com/search?q=${encodeURIComponent(orgName)}` : undefined;

  // Review count trend
  const startReviews = checkup?.reviewCount ?? checkup?.checkup_review_count_at_creation ?? null;
  const currentReviews = place.reviewCount ?? startReviews;
  if (startReviews != null && currentReviews != null) {
    const delta = currentReviews - startReviews;
    trends.push({
      label: "Reviews",
      startValue: `${startReviews}`,
      currentValue: `${currentReviews}`,
      direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
      context: delta > 0
        ? `+${delta} review${delta !== 1 ? "s" : ""} since you joined`
        : delta === 0
          ? "No new reviews yet"
          : `${Math.abs(delta)} review${Math.abs(delta) !== 1 ? "s" : ""} removed`,
      verifyUrl: googleSearchUrl,
    });
  }

  // Rating trend
  const rating = place.rating || checkup?.rating || null;
  if (rating != null) {
    trends.push({
      label: "Star Rating",
      startValue: `${rating}`,
      currentValue: `${rating}`,
      direction: "flat",
      context: rating >= 4.5 ? "Above the threshold most consumers require" : "Room to improve",
      verifyUrl: googleSearchUrl,
    });
  }

  // Competitor gap trend
  const competitorReviews = typeof topCompetitor === "object" ? topCompetitor?.reviewCount : null;
  if (competitorReviews != null && currentReviews != null) {
    const gap = competitorReviews - currentReviews;
    trends.push({
      label: `Gap vs ${competitorName || "Competitor"}`,
      startValue: startReviews != null ? `${competitorReviews - startReviews} reviews` : "Not tracked",
      currentValue: `${gap > 0 ? gap : 0} reviews`,
      direction: gap <= 0 ? "up" : startReviews != null && (competitorReviews - currentReviews) < (competitorReviews - startReviews) ? "up" : "flat",
      context: gap <= 0
        ? "You lead your top competitor"
        : `${gap} reviews behind ${competitorName || "your top competitor"}`,
      verifyUrl: competitorName ? `https://www.google.com/search?q=${encodeURIComponent(competitorName)}` : undefined,
    });
  }

  const DirectionIcon = ({ dir }: { dir: "up" | "down" | "flat" }) => {
    if (dir === "up") return <TrendingUp className="w-4 h-4 text-emerald-500" />;
    if (dir === "down") return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  return (
    <div className="min-h-screen bg-[#F8F6F2]">
      <div className="max-w-[640px] mx-auto px-5 sm:px-8 py-10 sm:py-14">

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-3xl sm:text-4xl font-semibold text-[#1A1D23] tracking-tight">Your Numbers</h1>
          {daysActive && (
            <div className="mt-3">
              <p className="text-base text-[#1A1D23] font-medium">
                Alloro has been monitoring your market for {daysActive} day{daysActive !== 1 ? "s" : ""}.
              </p>
              <p className="text-sm text-gray-400 mt-1">Rankings measured weekly from the same location so movement is real, not noise.</p>
            </div>
          )}
          {!daysActive && (
            <p className="text-sm text-gray-400 mt-1">Alloro reads your business data and shows you what is moving.</p>
          )}
        </motion.div>

        {/* Reading Trends */}
        {trends.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-6 space-y-3"
          >
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-3">Your Readings Over Time</p>
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl bg-stone-50/80 border border-stone-200/60 p-4 animate-pulse">
                <div className="flex items-center justify-between mb-2">
                  <div className="h-4 w-28 bg-gray-200 rounded" />
                  <div className="h-4 w-4 bg-gray-200 rounded" />
                </div>
                <div className="h-7 w-36 bg-gray-200 rounded mb-1" />
                <div className="h-4 w-48 bg-gray-100 rounded" />
              </div>
            ))}
            <div className="rounded-xl bg-stone-50/80 border border-stone-200/60 p-4">
              <p className="text-sm font-semibold text-[#1A1D23]">Alloro is collecting your baseline readings</p>
              <p className="text-sm text-gray-500 mt-1">
                Progress tracking starts once your initial Google Business Profile data syncs. You will see how your readings change over time.
              </p>
            </div>
          </motion.div>
        )}
        {trends.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-6 space-y-3"
          >
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-3">Your Readings Over Time</p>
            {trends.map((trend) => (
              <div
                key={trend.label}
                className="rounded-xl bg-stone-50/80 border border-stone-200/60 p-4"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-[#1A1D23]">{trend.label}</span>
                  <DirectionIcon dir={trend.direction} />
                </div>
                <div className="flex items-baseline gap-3 mb-1">
                  <span className="text-gray-400 text-xs">Start: {trend.startValue}</span>
                  <span className="text-2xl text-[#1A1D23] font-semibold">Now: {trend.currentValue}</span>
                </div>
                <p className="text-sm text-gray-500">{trend.context}</p>
                {trend.verifyUrl && (
                  <a
                    href={trend.verifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[#1A1D23]/40 font-semibold mt-2 hover:text-[#1A1D23]/60 hover:underline"
                  >
                    Verify on Google <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </motion.div>
        )}

        {/* Health Trajectory (from score history, shown as direction not number) */}
        {ctx?.score_history && Array.isArray(ctx.score_history) && ctx.score_history.length > 1 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mt-6"
          >
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-3">Overall Health Trajectory</p>
            <div className="rounded-xl bg-stone-50/80 border border-stone-200/60 p-4">
              {(() => {
                const history = ctx.score_history as { score: number; date: string }[];
                const first = history[0]?.score ?? 0;
                const latest = history[history.length - 1]?.score ?? 0;
                const delta = latest - first;
                const weeks = history.length;

                // Suppress false decline warnings when score sub-fields show incomplete data
                // (googlePosition=0 means no verified position yet -- score drop is internal, not real market change)
                const scoreData = checkup?.score;
                const hasIncompleteInputs = scoreData && (scoreData.googlePosition === 0 || scoreData.googlePosition == null);
                const showDecline = delta < 0 && !hasIncompleteInputs;

                return (
                  <div className="flex items-center gap-3">
                    {delta > 0 ? (
                      <TrendingUp className="w-5 h-5 text-emerald-500" />
                    ) : showDecline ? (
                      <TrendingDown className="w-5 h-5 text-red-500" />
                    ) : (
                      <Minus className="w-5 h-5 text-gray-400" />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-[#1A1D23]">
                        {delta > 0 ? "Improving" : showDecline ? "Needs attention" : "All caught up"}
                      </p>
                      <p className="text-sm text-gray-500">
                        {delta > 0
                          ? `Your online health has improved over ${weeks} week${weeks !== 1 ? "s" : ""} of tracking`
                          : showDecline
                            ? `Some readings have declined over ${weeks} week${weeks !== 1 ? "s" : ""}. Check your Home page for what needs attention.`
                            : "Alloro is monitoring your market. Your readings will update as new data comes in."}
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>
          </motion.div>
        )}


      </div>
    </div>
  );
}
