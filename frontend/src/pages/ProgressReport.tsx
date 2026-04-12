/**
 * Progress -- "Am I getting better?"
 *
 * Shows how your readings have changed over time.
 * No scores. No 365-day summaries for 2-week-old accounts.
 * Raw readings: then vs now. What Alloro has done. What changed.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, ExternalLink, Phone, MapPin, MousePointerClick, CheckCircle2, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLocationContext } from "@/contexts/locationContext";
import { PMSUploadWizardModal } from "@/components/PMS/PMSUploadWizardModal";
import { apiGet } from "@/api/index";
import { getPriorityItem } from "@/hooks/useLocalStorage";
import WarmEmptyState, { WARM_STATES } from "@/components/dashboard/WarmEmptyState";
import ProgressStory from "@/components/dashboard/ProgressStory";

// ─── Types ──────────────────────────────────────────────────────────

interface ReadingTrend {
  label: string;
  startValue: string;
  currentValue: string;
  direction: "up" | "down" | "flat";
  context: string;
  verifyUrl?: string;
}

interface ProoflineEntry {
  date: string;
  title: string;
  narrative: string;
  proofType: string;
  valueChange: string | null;
}

interface ReviewTrajectoryPoint {
  date: string;
  reviewCount: number;
  competitorReviewCount: number | null;
  competitorName: string | null;
}

interface ProofOfWorkData {
  prooflineTimeline: ProoflineEntry[];
  reviewTrajectory: ReviewTrajectoryPoint[];
  competitorLandscape: Array<{
    name: string;
    reviewCount: number;
    rating: number;
    reviewVelocity: number | null;
    photosCount: number | null;
  }>;
}

// ─── Component ──────────────────────────────────────────────────────

export default function ProgressReport() {
  const { userProfile } = useAuth();
  const { selectedLocation } = useLocationContext();
  const orgId = userProfile?.organizationId || null;
  const [showUploadModal, setShowUploadModal] = useState(false);

  const { data: ctx } = useQuery<any>({
    queryKey: ["progress-context", orgId, selectedLocation?.id],
    queryFn: () => apiGet({ path: "/user/dashboard-context" }),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const { data: proofData } = useQuery<ProofOfWorkData>({
    queryKey: ["proof-of-work", orgId],
    queryFn: () => apiGet({ path: "/user/proof-of-work" }),
    enabled: !!orgId,
    staleTime: 120_000,
  });

  const { data: rankingRaw } = useQuery<any>({
    queryKey: ["progress-ranking", orgId, selectedLocation?.id],
    queryFn: async () => {
      const locParam = selectedLocation?.id ? `?locationId=${selectedLocation.id}` : "";
      const token = getPriorityItem("auth_token") || getPriorityItem("token");
      const res = await fetch(
        `/api/user/ranking/latest${locParam}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (!res.ok) return null;
      const data = await res.json();
      return data?.rankings?.[0] || data?.results?.[0] || null;
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const checkup = ctx?.org?.checkup_data;
  const orgName = ctx?.org?.name || "";
  const createdAt = ctx?.org?.created_at;
  const place = checkup?.place || {};

  // Competitor data from ranking analysis
  const rawData = rankingRaw?.rawData as Record<string, unknown> | undefined;
  const competitors = (rawData?.competitors as Array<Record<string, unknown>>) || [];
  const topCompetitor = competitors.length > 0
    ? [...competitors].sort((a, b) => ((b.reviewCount as number) || 0) - ((a.reviewCount as number) || 0))[0]
    : null;

  // Calculate days since signup
  const daysActive = createdAt
    ? Math.max(1, Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  // Build reading trends from available data
  const trends: ReadingTrend[] = [];
  const googleSearchUrl = orgName ? `https://www.google.com/search?q=${encodeURIComponent(orgName)}` : undefined;

  // Review count trend with competitor context
  const startReviews = checkup?.reviewCount ?? checkup?.checkup_review_count_at_creation ?? null;
  const currentReviews = place.reviewCount ?? startReviews;
  if (startReviews != null && currentReviews != null) {
    const delta = currentReviews - startReviews;
    const topCompReviews = topCompetitor ? (topCompetitor.reviewCount as number) || 0 : 0;
    const reviewGap = topCompReviews > 0 ? topCompReviews - currentReviews : 0;

    let context = "";
    if (delta > 0 && daysActive) {
      const weeklyRate = Math.round((delta / (daysActive / 7)) * 10) / 10;
      context = `+${delta} review${delta !== 1 ? "s" : ""} since you joined (${weeklyRate}/week)`;
    } else if (delta > 0) {
      context = `+${delta} review${delta !== 1 ? "s" : ""} since you joined`;
    } else if (delta === 0) {
      context = "No new reviews yet. Every new review has outsized impact at your current volume.";
    } else {
      context = `${Math.abs(delta)} review${Math.abs(delta) !== 1 ? "s" : ""} removed`;
    }

    // Add competitor context with interpretation
    if (topCompetitor && topCompReviews > 0) {
      const compName = (topCompetitor.name as string) || "Top competitor";
      if (reviewGap > 0) {
        const weeksToClose = Math.ceil(reviewGap / 2);
        const timeframe = weeksToClose <= 52
          ? `${Math.ceil(weeksToClose / 4)} month${Math.ceil(weeksToClose / 4) !== 1 ? "s" : ""}`
          : "over a year";
        context += `. ${compName} is ${reviewGap} ahead. Closeable in ${timeframe} at 2/week.`;
      } else if (reviewGap < 0) {
        const lead = Math.abs(reviewGap);
        context += `. You lead ${compName} by ${lead}${lead > 100 ? ". That gap compounds." : "."}`;
      } else {
        context += `. Tied with ${compName}. Each new review shifts the balance.`;
      }
    }

    trends.push({
      label: "Reviews",
      startValue: `${startReviews}`,
      currentValue: `${currentReviews}`,
      direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
      context,
      verifyUrl: googleSearchUrl,
    });
  }

  // Rating trend with competitor context
  const rating = place.rating || checkup?.rating || null;
  if (rating != null) {
    // Calculate market average from competitors
    const competitorRatings = competitors
      .map(c => (c.rating as number) || 0)
      .filter(r => r > 0);
    const marketAvg = competitorRatings.length > 0
      ? Math.round((competitorRatings.reduce((a, b) => a + b, 0) / competitorRatings.length) * 10) / 10
      : null;

    let context = "";
    if (rating >= 4.5) {
      context = "Above the threshold most consumers require";
    } else {
      context = "Room to improve";
    }
    if (marketAvg) {
      const diff = Math.round((rating - marketAvg) * 10) / 10;
      if (diff > 0) {
        context += `. ${diff} stars above market average (${marketAvg})`;
      } else if (diff < 0) {
        context += `. ${Math.abs(diff)} stars below market average (${marketAvg})`;
      } else {
        context += `. At market average (${marketAvg})`;
      }
    }

    trends.push({
      label: "Star Rating",
      startValue: `${rating}`,
      currentValue: `${rating}`,
      direction: "flat",
      context,
      verifyUrl: googleSearchUrl,
    });
  }

  // GBP Profile Completeness trend
  if (place) {
    const gbpFields = [
      !!(place.hasPhone || place.phone || place.nationalPhoneNumber || place.internationalPhoneNumber),
      !!(place.hasHours || place.hours || place.regularOpeningHours),
      !!(place.hasWebsite || place.websiteUri || place.website),
      (place.photosCount || place.photoCount || place.photos?.length || 0) > 0,
      !!(place.hasEditorialSummary || place.editorialSummary),
    ];
    const complete = gbpFields.filter(Boolean).length;
    if (complete > 0) {
      const missing = 5 - complete;
      let gbpContext = "";
      if (missing === 0) {
        gbpContext = "All fields complete. Google has everything it needs to show you accurately.";
      } else {
        const missingNames: string[] = [];
        if (!gbpFields[0]) missingNames.push("Phone");
        if (!gbpFields[1]) missingNames.push("Hours");
        if (!gbpFields[2]) missingNames.push("Website");
        if (!gbpFields[3]) missingNames.push("Photos");
        if (!gbpFields[4]) missingNames.push("Description");
        gbpContext = `Missing: ${missingNames.join(", ")}. Complete profiles appear in 2x more searches.`;
      }
      trends.push({
        label: "GBP Profile",
        startValue: `${complete}/5`,
        currentValue: `${complete}/5`,
        direction: complete >= 5 ? "up" : "flat",
        context: gbpContext,
        verifyUrl: googleSearchUrl,
      });
    }
  }

  // Photo count trend
  const photoCount = place?.photosCount || place?.photoCount || place?.photos?.length || 0;
  if (photoCount > 0) {
    trends.push({
      label: "Photos",
      startValue: `${photoCount}`,
      currentValue: `${photoCount}`,
      direction: "flat",
      context: photoCount >= 100
        ? `${photoCount} photos. Businesses with 100+ photos get 520% more calls.`
        : photoCount >= 10
          ? `${photoCount} photos. Keep adding. Businesses with 100+ photos get 520% more calls.`
          : `${photoCount} photo${photoCount !== 1 ? "s" : ""}. Businesses with 10+ photos see measurably more engagement.`,
      verifyUrl: googleSearchUrl,
    });
  }

  // Competitors tracked trend
  if (competitors.length > 0) {
    trends.push({
      label: "Competitors Tracked",
      startValue: `${competitors.length}`,
      currentValue: `${competitors.length}`,
      direction: "flat",
      context: `Alloro monitors ${competitors.length} competitors in your market weekly`,
    });
  }

  const DirectionIcon = ({ dir }: { dir: "up" | "down" | "flat" }) => {
    if (dir === "up") return <TrendingUp className="w-4 h-4 text-emerald-500" />;
    if (dir === "down") return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  return (
    <div className="min-h-screen bg-[#F8F6F2]">
      <div className="max-w-[800px] mx-auto px-4 sm:px-6 py-8 sm:py-12">

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-2xl font-semibold text-[#1A1D23] tracking-tight">Your Numbers</h1>
          {daysActive && (
            <div className="mt-3">
              <p className="text-sm text-gray-500">
                Alloro has been monitoring your market for {daysActive} day{daysActive !== 1 ? "s" : ""}.
              </p>
              <p className="text-sm text-gray-400 mt-1">Rankings measured weekly from the same location so movement is real, not noise.</p>
            </div>
          )}
          {!daysActive && (
            <p className="text-sm text-gray-400 mt-1">Alloro reads your business data and shows you what is moving. Every number links to something you can verify.</p>
          )}
        </motion.div>

        {/* Progress Story -- the narrative arc */}
        {(() => {
          const curRevs = place.reviewCount || startReviews || 0;
          const curRating = place.rating || checkup?.rating || null;
          const compName = topCompetitor ? ((topCompetitor.name as string) || null) : null;
          const compRevs = topCompetitor ? ((topCompetitor.reviewCount as number) || (topCompetitor.userRatingCount as number) || null) : null;

          if (curRevs === 0 && !startReviews) return null;
          return (
            <div className="mt-6">
              <ProgressStory
                orgCreatedAt={createdAt || null}
                startReviews={startReviews}
                currentReviews={curRevs}
                currentRating={curRating}
                competitorName={compName}
                competitorReviews={compRevs}
              />
            </div>
          );
        })()}

        {/* Reading Trends */}
        {trends.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-6"
          >
            <WarmEmptyState {...WARM_STATES.progress} />
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
                    className="inline-flex items-center gap-1 text-xs text-[#D56753] font-semibold mt-2 hover:underline"
                  >
                    Verify on Google <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </motion.div>
        )}

        {/* GBP Performance -- "Is the business producing?" */}
        {(() => {
          const perfData = rankingRaw?.rawData?.client_gbp?.performance;
          if (!perfData) return null;
          const calls = perfData.calls || 0;
          const directions = perfData.directions || 0;
          const clicks = perfData.clicks || 0;
          const total = calls + directions + clicks;
          if (total === 0) return null;

          return (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="mt-6 space-y-3"
            >
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-3">Customer Actions from Google</p>
              <div className="grid grid-cols-3 gap-3">
                {calls > 0 && (
                  <div className="rounded-xl bg-stone-50/80 border border-stone-200/60 p-4 text-center">
                    <Phone className="w-4 h-4 text-gray-400 mx-auto mb-2" />
                    <p className="text-2xl font-semibold text-[#1A1D23]">{calls}</p>
                    <p className="text-xs text-gray-400 mt-1">Calls</p>
                  </div>
                )}
                {directions > 0 && (
                  <div className="rounded-xl bg-stone-50/80 border border-stone-200/60 p-4 text-center">
                    <MapPin className="w-4 h-4 text-gray-400 mx-auto mb-2" />
                    <p className="text-2xl font-semibold text-[#1A1D23]">{directions}</p>
                    <p className="text-xs text-gray-400 mt-1">Directions</p>
                  </div>
                )}
                {clicks > 0 && (
                  <div className="rounded-xl bg-stone-50/80 border border-stone-200/60 p-4 text-center">
                    <MousePointerClick className="w-4 h-4 text-gray-400 mx-auto mb-2" />
                    <p className="text-2xl font-semibold text-[#1A1D23]">{clicks}</p>
                    <p className="text-xs text-gray-400 mt-1">Website clicks</p>
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-500">
                Real customer actions from your Google Business Profile. Each one is someone who found you and took a step toward becoming a customer.
              </p>
              {total > 0 && (
                <p className="text-sm font-medium text-[#1A1D23] mt-2">
                  {total} total action{total !== 1 ? "s" : ""} tracked.{" "}
                  {calls > 0 && calls >= directions && calls >= clicks && "Phone calls are your top conversion channel."}
                  {directions > 0 && directions > calls && directions >= clicks && "Directions requests are your top conversion channel."}
                  {clicks > 0 && clicks > calls && clicks > directions && "Website clicks are your top conversion channel."}
                </p>
              )}
            </motion.div>
          );
        })()}

        {/* Review Trajectory -- the arc that proves it's working */}
        {proofData?.reviewTrajectory && proofData.reviewTrajectory.length >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-6 space-y-3"
          >
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-3">Review Count Over Time</p>
            <div className="rounded-xl bg-stone-50/80 border border-stone-200/60 p-5">
              {/* Simple bar visualization */}
              <div className="space-y-2">
                {proofData.reviewTrajectory.map((point, i) => {
                  const maxReviews = Math.max(
                    ...proofData.reviewTrajectory.map(p => Math.max(p.reviewCount, p.competitorReviewCount || 0))
                  );
                  const barWidth = maxReviews > 0 ? Math.max(3, (point.reviewCount / maxReviews) * 100) : 3;
                  const compBarWidth = point.competitorReviewCount && maxReviews > 0
                    ? Math.max(3, (point.competitorReviewCount / maxReviews) * 100)
                    : 0;
                  const dateLabel = new Date(point.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });

                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-14 text-right flex-shrink-0">{dateLabel}</span>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-4 bg-emerald-500 rounded-sm transition-all"
                            style={{ width: `${barWidth}%` }}
                          />
                          <span className="text-xs font-semibold text-[#1A1D23]">{point.reviewCount}</span>
                        </div>
                        {compBarWidth > 0 && (
                          <div className="flex items-center gap-2">
                            <div
                              className="h-3 bg-[#D56753]/30 rounded-sm transition-all"
                              style={{ width: `${compBarWidth}%` }}
                            />
                            <span className="text-xs text-gray-400">{point.competitorReviewCount}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Legend */}
              <div className="flex items-center gap-4 mt-4 pt-3 border-t border-stone-200/60">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-emerald-500" />
                  <span className="text-xs text-gray-500">You</span>
                </div>
                {proofData.reviewTrajectory.some(p => p.competitorReviewCount) && (
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-[#D56753]/30" />
                    <span className="text-xs text-gray-500">
                      {proofData.reviewTrajectory.find(p => p.competitorName)?.competitorName || "Top competitor"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Proofline Timeline -- What Alloro Did */}
        {proofData?.prooflineTimeline && proofData.prooflineTimeline.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="mt-6"
          >
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-3">What Alloro Did</p>
            <div className="space-y-3">
              {proofData.prooflineTimeline.map((entry, i) => {
                const dateLabel = new Date(entry.date).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                });
                const isWin = entry.proofType === "win";

                return (
                  <div
                    key={i}
                    className="rounded-xl bg-stone-50/80 border border-stone-200/60 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isWin ? "bg-emerald-50" : "bg-stone-100"
                      }`}>
                        {isWin ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-sm font-semibold text-[#1A1D23]">{entry.title}</p>
                          {entry.valueChange && (
                            <span className={`text-xs font-semibold flex-shrink-0 ${
                              isWin ? "text-emerald-600" : "text-gray-400"
                            }`}>{entry.valueChange}</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 leading-relaxed">{entry.narrative}</p>
                        <p className="text-xs text-gray-400 mt-2">{dateLabel}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Upload Section -- unlock deeper intelligence */}
        <div className="mt-10 pl-4 border-l-2 border-[#1A1D23]/20">
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-3">UNLOCK DEEPER INTELLIGENCE</p>
          <p className="text-sm text-gray-500 leading-relaxed">
            You are seeing your market position and review gap. Upload your referral or revenue data to see who is actually sending you business, and whether those relationships are growing or drifting.
          </p>
          <button
            onClick={() => setShowUploadModal(true)}
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#D56753] text-white text-sm font-medium hover:brightness-105 transition-all"
          >
            Upload business data
          </button>
          <p className="text-sm text-gray-400 mt-2">Any format. Drag and drop. Takes 2 minutes.</p>
        </div>

        {showUploadModal && orgId && (
          <PMSUploadWizardModal
            isOpen={showUploadModal}
            onClose={() => setShowUploadModal(false)}
            clientId={String(orgId)}
            locationId={selectedLocation?.id}
            onSuccess={() => setShowUploadModal(false)}
          />
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
                        {delta > 0 ? "Improving" : showDecline ? "Needs attention" : "Holding steady"}
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
