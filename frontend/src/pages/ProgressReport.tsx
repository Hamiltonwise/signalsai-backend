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

  // GBP completeness
  const gbpFields = [
    place.hasPhone || place.phone,
    place.hasHours || place.hours || place.regularOpeningHours,
    place.hasWebsite || place.websiteUri,
    (place.photosCount || 0) > 0,
    place.hasEditorialSummary || place.editorialSummary,
  ];
  const gbpComplete = gbpFields.filter(Boolean).length;
  trends.push({
    label: "Profile Completeness",
    startValue: `${gbpComplete}/5`,
    currentValue: `${gbpComplete}/5`,
    direction: gbpComplete >= 5 ? "up" : "flat",
    context: gbpComplete >= 5
      ? "All fields complete"
      : `${5 - gbpComplete} field${5 - gbpComplete !== 1 ? "s" : ""} still missing`,
    verifyUrl: googleSearchUrl,
  });

  // Competitor gap trend
  const competitorReviews = typeof topCompetitor === "object" ? topCompetitor?.reviewCount : null;
  if (competitorReviews != null && currentReviews != null) {
    const gap = competitorReviews - currentReviews;
    trends.push({
      label: `Gap vs ${competitorName || "Competitor"}`,
      startValue: startReviews != null ? `${competitorReviews - startReviews} reviews` : "N/A",
      currentValue: `${gap > 0 ? gap : 0} reviews`,
      direction: gap <= 0 ? "up" : startReviews != null && (competitorReviews - currentReviews) < (competitorReviews - startReviews) ? "up" : "flat",
      context: gap <= 0
        ? "You lead your top competitor"
        : `${gap} reviews behind ${competitorName || "your top competitor"}`,
      verifyUrl: competitorName ? `https://www.google.com/search?q=${encodeURIComponent(competitorName)}` : undefined,
    });
  }

  // What Alloro has done (proof of work)
  const alloroActions: { label: string; detail: string }[] = [];
  if (daysActive && daysActive > 0) {
    alloroActions.push({
      label: "Market monitoring",
      detail: `Tracking your competitive landscape for ${daysActive} day${daysActive !== 1 ? "s" : ""}`,
    });
  }
  // Future: pull from behavioral_events to show real DFY actions
  // e.g., "Responded to 3 reviews", "Published 2 GBP posts", "Updated 1 website page"

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
          <h1 className="text-lg font-semibold text-[#1A1D23]">Your Progress</h1>
          {daysActive && (
            <p className="text-sm text-gray-500 mt-1">
              {daysActive} day{daysActive !== 1 ? "s" : ""} with Alloro
            </p>
          )}
        </motion.div>

        {/* Reading Trends */}
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
                  <span className="text-[#1A1D23] font-semibold">Now: {trend.currentValue}</span>
                </div>
                <p className="text-sm text-gray-500">{trend.context}</p>
                {trend.verifyUrl && (
                  <a
                    href={trend.verifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[#D56753] font-semibold mt-2 hover:underline"
                  >
                    Verify on Google <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </motion.div>
        )}

        {/* What Alloro Has Done */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-8"
        >
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-3">What Alloro Has Done</p>
          <div className="rounded-xl bg-stone-50/80 border border-stone-200/60 p-4 space-y-3">
            {alloroActions.length > 0 ? (
              alloroActions.map((action, i) => (
                <div key={i}>
                  <p className="text-sm font-semibold text-[#1A1D23]">{action.label}</p>
                  <p className="text-sm text-gray-500">{action.detail}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">Alloro is building your competitive picture. Check back after your first Monday email.</p>
            )}
          </div>
        </motion.div>

      </div>
    </div>
  );
}
