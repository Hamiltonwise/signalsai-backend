/**
 * Home -- "Am I okay?" + "What should I do?"
 *
 * The 3-second experience. Open. See. Know. Close.
 *
 * Credit-score gauge hero with three contributing factor cards.
 * Four-level graceful degradation:
 * 1. Full data: gauge + factors + action card
 * 2. Score only: gauge + action card (factors hidden)
 * 3. Score only, day 1: gauge + action card
 * 4. Nothing yet: "Welcome. Alloro is scanning your market."
 *
 * Rules:
 * - Max 2 temporary prompts visible at once
 * - Surprise moments appear when earned, vanish when seen
 * - Monday Preview: cut. The email IS the surprise.
 * - 5 core elements: greeting, gauge, factor cards, action card, chat bubble
 * - Everything else is conditional and temporary
 */

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, TrendingUp } from "lucide-react";
import { apiGet } from "@/api/index";
import { useAuth } from "@/hooks/useAuth";
import { useLocationContext } from "@/contexts/locationContext";
import { getPriorityItem } from "@/hooks/useLocalStorage";
// OnboardingChecklist removed: prohibited pattern per Apple Principle
import BillingPromptBar from "@/components/dashboard/BillingPromptBar";
import CardCapture from "@/components/dashboard/CardCapture";
import StreakBadge from "@/components/dashboard/StreakBadge";

// ─── Types ──────────────────────────────────────────────────────────

interface DashboardContext {
  org?: {
    id: number;
    name: string;
    created_at: string;
    owner_archetype?: string | null;
    archetype_confidence?: number | null;
    owner_profile?: {
      vision_3yr?: string;
      sunday_fear?: string;
      confidence_score?: number;
      personal_goal?: string;
    } | null;
    checkup_score?: number | null;
    current_clarity_score?: number | null;
    checkup_data?: any;
    subscription_status?: string;
    trial_end_at?: string | null;
    referral_code?: string | null;
  };
  user?: { first_name?: string; last_name?: string; email?: string };
  current_clarity_score?: number | null;
  previous_clarity_score?: number | null;
  score_updated_at?: string | null;
}

interface RankingData {
  rankPosition: number | null;
  totalCompetitors: number | null;
  rankScore: number | null;
  location: string | null;
  topCompetitor?: { name: string; reviewCount: number } | null;
  previousPosition?: number | null;
}

interface OneAction {
  headline: string;
  body: string;
  action_text: string | null;
  action_url: string | null;
  priority_level: number;
  clear?: boolean;
}

// ─── Greeting Builder ───────────────────────────────────────────────

function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function buildGreeting(
  ctx: DashboardContext | null,
  _ranking: RankingData | null,
): string {
  const firstName = ctx?.user?.first_name || null;
  // The greeting is warm and short. One sentence. The score and position
  // are displayed visually below, not crammed into the greeting.
  if (firstName) return `${getTimeGreeting()}, ${firstName}.`;
  return `${getTimeGreeting()}.`;
}

// ─── Score Label ────────────────────────────────────────────────────

function getScoreLabel(score: number): { label: string; color: string } {
  if (score >= 90) return { label: "Exceptional", color: "#15803d" };
  if (score >= 75) return { label: "Strong", color: "#22c55e" };
  if (score >= 55) return { label: "Good", color: "#84cc16" };
  if (score >= 35) return { label: "Developing", color: "#f59e0b" };
  return { label: "Needs Attention", color: "#ef4444" };
}

// ─── Semi-Circular Gauge ────────────────────────────────────────────

function ClarityGauge({
  score,
  previousScore,
  updatedAt,
}: {
  score: number;
  previousScore?: number | null;
  updatedAt?: string | null;
}) {
  const { label, color } = getScoreLabel(score);
  const pct = Math.max(0, Math.min(100, score)) / 100;

  // SVG arc math: semi-circle from 180deg to 0deg (left to right)
  const cx = 150;
  const cy = 140;
  const r = 110;
  const strokeWidth = 18;
  // Arc length = pi * r
  const arcLength = Math.PI * r;
  const filledLength = arcLength * pct;

  // Trend delta
  const delta = previousScore != null ? score - previousScore : null;

  // Format updated date
  const updatedLabel = updatedAt
    ? new Date(updatedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 300 165"
        className="w-full max-w-[320px] sm:max-w-[360px]"
        aria-label={`Business Clarity Score: ${score} out of 100, ${label}`}
      >
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="25%" stopColor="#f59e0b" />
            <stop offset="50%" stopColor="#84cc16" />
            <stop offset="75%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#15803d" />
          </linearGradient>
        </defs>
        {/* Background track */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Filled arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="url(#gaugeGrad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${filledLength} ${arcLength}`}
        />
        {/* Needle dot at current position */}
        {(() => {
          const angle = Math.PI * (1 - pct);
          const nx = cx + r * Math.cos(angle);
          const ny = cy - r * Math.sin(angle);
          return (
            <circle cx={nx} cy={ny} r={6} fill={color} stroke="#fff" strokeWidth={2} />
          );
        })()}
        {/* Score number in center */}
        <text
          x={cx}
          y={cy - 20}
          textAnchor="middle"
          dominantBaseline="middle"
          className="text-7xl sm:text-8xl"
          style={{ fontSize: "72px", fontWeight: 600, fill: "#1A1D23" }}
        >
          {score}
        </text>
        {/* Label below number */}
        <text
          x={cx}
          y={cy + 10}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ fontSize: "16px", fontWeight: 500, fill: color }}
        >
          {label}
        </text>
      </svg>

      {/* Sub-text below gauge */}
      <div className="text-center mt-1 space-y-0.5">
        <p className="text-sm text-gray-400">Business Clarity Score</p>
        <div className="flex items-center justify-center gap-3 text-xs text-gray-400">
          {updatedLabel && <span>Updated {updatedLabel}</span>}
          {delta != null && delta !== 0 && (
            <span
              className={`inline-flex items-center gap-0.5 font-semibold ${
                delta > 0 ? "text-emerald-600" : "text-red-500"
              }`}
            >
              <TrendingUp
                className={`w-3 h-3 ${delta < 0 ? "rotate-180" : ""}`}
              />
              {delta > 0 ? "+" : ""}
              {delta} pts
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400">Based on public Google data</p>
      </div>
    </div>
  );
}

// ─── Factor Card ────────────────────────────────────────────────────

function FactorCard({
  name,
  impact,
  score: factorScore,
  maxScore,
  detail,
  competitorContext,
  status,
  showScore,
}: {
  name: string;
  impact: "High Impact" | "Medium Impact";
  score: number | null;
  maxScore: number;
  detail: string;
  competitorContext?: string | null;
  status: "green" | "yellow" | "red";
  showScore: boolean;
}) {
  const statusColors = {
    green: "bg-emerald-500",
    yellow: "bg-amber-400",
    red: "bg-red-500",
  };
  const pct = showScore && factorScore != null && maxScore > 0
    ? Math.min(100, (factorScore / maxScore) * 100)
    : 0;

  return (
    <div className="rounded-xl bg-stone-50 border border-stone-200/60 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
          <span className="text-sm font-semibold text-[#1A1D23]">{name}</span>
        </div>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
          {impact}
        </span>
      </div>
      {/* Progress bar: only show when score is from current algorithm */}
      {showScore && (
        <div className="w-full h-1.5 rounded-full bg-gray-200 mb-2">
          <div
            className={`h-1.5 rounded-full ${statusColors[status]}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      <p className="text-sm text-[#1A1D23]">{detail}</p>
      {competitorContext && (
        <p className="text-xs text-gray-400 mt-1">{competitorContext}</p>
      )}
      {showScore && factorScore != null && (
        <p className="text-xs text-gray-400 mt-1 font-semibold">
          {factorScore}/{maxScore}
        </p>
      )}
    </div>
  );
}

// ─── Factor Data Extraction ─────────────────────────────────────────

function extractFactors(ctx: DashboardContext | null) {
  const checkup = ctx?.org?.checkup_data;
  if (!checkup) return null;

  const scoreData = checkup.score || checkup.subScores || {};
  const place = checkup.place || {};
  const topCompetitor = checkup.topCompetitor || checkup.top_competitor || null;

  // Review Health (0-33)
  const reviewHealth =
    scoreData.reviewHealth ??
    scoreData.trustSignal ??
    scoreData.trust ??
    scoreData.localVisibility ??
    null;
  const rating = place.rating || null;
  const reviewCount = place.reviewCount ?? checkup.reviewCount ?? null;
  const competitorName =
    typeof topCompetitor === "string"
      ? topCompetitor
      : topCompetitor?.name || null;
  const competitorReviewCount =
    typeof topCompetitor === "object" ? topCompetitor?.reviewCount : null;

  // GBP Completeness (0-33)
  const gbpCompleteness =
    scoreData.gbpCompleteness ??
    scoreData.firstImpression ??
    scoreData.impression ??
    scoreData.onlinePresence ??
    null;
  // Count complete GBP fields
  const gbpFields = [
    place.hasHours || place.hours,
    place.hasPhone || place.phone,
    place.hasWebsite || place.websiteUri,
    place.photosCount > 0,
    place.hasEditorialSummary || place.editorialSummary,
  ];
  const gbpComplete = gbpFields.filter(Boolean).length;
  const gbpMissing: string[] = [];
  if (!place.hasHours && !place.hours) gbpMissing.push("hours");
  if (!place.hasPhone && !place.phone) gbpMissing.push("phone");
  if (!place.hasWebsite && !place.websiteUri) gbpMissing.push("website");
  if (!place.photosCount || place.photosCount === 0) gbpMissing.push("photos");
  if (!place.hasEditorialSummary && !place.editorialSummary)
    gbpMissing.push("description");

  // Google Visibility (0-34)
  const googlePosition =
    scoreData.googlePosition ??
    scoreData.competitiveEdge ??
    scoreData.edge ??
    null;

  return {
    reviewHealth: {
      score: reviewHealth,
      rating,
      reviewCount,
      competitorName,
      competitorReviewCount,
    },
    gbpCompleteness: {
      score: gbpCompleteness,
      complete: gbpComplete,
      missing: gbpMissing,
    },
    googleVisibility: {
      score: googlePosition,
    },
  };
}

// ─── Prompt Limiter (max 2 temporary prompts) ───────────────────────

function limitPrompts(prompts: Array<{ key: string; show: boolean }>): Set<string> {
  const visible = new Set<string>();
  for (const p of prompts) {
    if (p.show && visible.size < 2) visible.add(p.key);
  }
  return visible;
}

// ─── Component ──────────────────────────────────────────────────────

export default function HomePage() {
  const navigate = useNavigate();
  const { userProfile, billingStatus } = useAuth();
  const { selectedLocation } = useLocationContext();
  const orgId = userProfile?.organizationId || null;

  // ── Data Fetching ──
  const { data: ctx } = useQuery<DashboardContext>({
    queryKey: ["home-context", orgId],
    queryFn: () => apiGet({ path: "/user/dashboard-context" }),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const { data: rankingRaw } = useQuery<any>({
    queryKey: ["home-ranking", orgId, selectedLocation?.id],
    queryFn: async () => {
      const locParam = selectedLocation?.id ? `&locationId=${selectedLocation.id}` : "";
      const token = getPriorityItem("auth_token") || getPriorityItem("token");
      const res = await fetch(
        `/api/practice-ranking/latest?googleAccountId=${orgId || ""}${locParam}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (!res.ok) return null;
      const data = await res.json();
      return data?.rankings?.[0] || data?.results?.[0] || null;
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const ranking: RankingData | null = rankingRaw ? {
    rankPosition: rankingRaw.rankPosition,
    totalCompetitors: rankingRaw.totalCompetitors,
    rankScore: rankingRaw.rankScore,
    location: rankingRaw.location || rankingRaw.gbpLocationName,
    topCompetitor: rankingRaw.rawData?.topCompetitor || null,
    previousPosition: rankingRaw.rawData?.previousPosition || null,
  } : null;

  const { data: actionData } = useQuery<{ card: OneAction }>({
    queryKey: ["home-action", orgId],
    queryFn: () => apiGet({ path: "/user/one-action-card" }),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const { data: milestoneData } = useQuery<any>({
    queryKey: ["home-milestone", orgId],
    queryFn: () => apiGet({ path: "/user/milestone-card" }),
    enabled: !!orgId,
    staleTime: 300_000,
  });

  const { data: streakData } = useQuery<any>({
    queryKey: ["home-streak", orgId],
    queryFn: () => apiGet({ path: "/user/streaks" }),
    enabled: !!orgId,
    staleTime: 300_000,
  });

  const { data: setupProgress } = useQuery<any>({
    queryKey: ["home-setup", orgId],
    queryFn: () => apiGet({ path: "/onboarding/setup-progress" }),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  // ── Derived State ──
  const action = actionData?.card || null;
  const greeting = buildGreeting(ctx || null, ranking);
  const score = ctx?.org?.current_clarity_score || ctx?.org?.checkup_score || null;
  // position/city removed from display: Places API rank doesn't match Google Search
  const milestone = milestoneData?.card || null;
  const streak = streakData?.topStreak || null;
  const win = streakData?.latestWin || null;

  const previousScore = (ctx as any)?.previous_clarity_score ?? null;
  const scoreUpdatedAt = (ctx as any)?.score_updated_at ?? null;
  const factors = extractFactors(ctx || null);
  // Only show sub-score numbers when current_clarity_score exists (recalc has run with new algorithm)
  const hasRecalculatedScore = ctx?.org?.current_clarity_score != null;

  const isTrialActive = ctx?.org?.subscription_status === "active" && ctx?.org?.trial_end_at;
  const needsOnboarding = setupProgress && !setupProgress.completed && !setupProgress.dismissed;
  const needsBilling = billingStatus && !billingStatus.hasStripeSubscription && !billingStatus.isAdminGranted;

  // Limit temporary prompts to max 2
  const visiblePrompts = limitPrompts([
    { key: "onboarding", show: !!needsOnboarding },
    { key: "billing", show: !!needsBilling && !!isTrialActive },
    { key: "milestone", show: !!milestone },
  ]);

  return (
    <div className="min-h-screen bg-[#F8F6F2]">
      <div className="max-w-[640px] mx-auto px-5 sm:px-8 py-10 sm:py-14">

        {/* ── Greeting + Gauge Hero ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-8"
        >
          <p className="text-base text-gray-500 mb-6">{greeting}</p>

          {/* Score gauge: the centerpiece */}
          {score != null ? (
            <ClarityGauge
              score={score}
              previousScore={previousScore}
              updatedAt={scoreUpdatedAt}
            />
          ) : (
            <p className="text-sm text-gray-400">Alloro is scanning your market.</p>
          )}
        </motion.div>

        {/* ── Factor Cards (three contributing factors) ── */}
        {factors && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8"
          >
            {/* Review Health: always show verifiable data, sub-score only after recalc */}
            {factors.reviewHealth.reviewCount != null && (
              <FactorCard
                name="Review Health"
                impact="High Impact"
                score={hasRecalculatedScore ? factors.reviewHealth.score : null}
                maxScore={33}
                showScore={hasRecalculatedScore}
                detail={
                  factors.reviewHealth.rating && factors.reviewHealth.reviewCount != null
                    ? `${factors.reviewHealth.reviewCount} reviews at ${factors.reviewHealth.rating} stars`
                    : "Review data loading"
                }
                competitorContext={
                  factors.reviewHealth.competitorName && factors.reviewHealth.competitorReviewCount
                    ? `${factors.reviewHealth.competitorName} has ${factors.reviewHealth.competitorReviewCount}`
                    : null
                }
                status={
                  factors.reviewHealth.competitorReviewCount && factors.reviewHealth.reviewCount != null
                    ? factors.reviewHealth.reviewCount >= factors.reviewHealth.competitorReviewCount
                      ? "green"
                      : factors.reviewHealth.reviewCount >= factors.reviewHealth.competitorReviewCount * 0.5
                        ? "yellow"
                        : "red"
                    : "yellow"
                }
              />
            )}
            {/* GBP Completeness: always show verifiable field count */}
            <FactorCard
              name="GBP Completeness"
              impact="High Impact"
              score={hasRecalculatedScore ? factors.gbpCompleteness.score : null}
              maxScore={33}
              showScore={hasRecalculatedScore}
              detail={`${factors.gbpCompleteness.complete}/5 fields complete`}
              competitorContext={
                factors.gbpCompleteness.missing.length > 0
                  ? `Missing: ${factors.gbpCompleteness.missing.join(", ")}`
                  : "All fields complete"
              }
              status={
                factors.gbpCompleteness.complete >= 4
                  ? "green"
                  : factors.gbpCompleteness.complete >= 2
                    ? "yellow"
                    : "red"
              }
            />
            {/* Google Visibility: sub-score only after recalc */}
            {hasRecalculatedScore && factors.googleVisibility.score != null && (
              <FactorCard
                name="Google Visibility"
                impact="Medium Impact"
                score={factors.googleVisibility.score}
                maxScore={34}
                showScore={true}
                detail={
                  factors.googleVisibility.score >= 23
                    ? "Strong search presence"
                    : factors.googleVisibility.score >= 12
                      ? "Moderate search presence"
                      : "Low search visibility"
                }
                status={
                  factors.googleVisibility.score >= 23
                    ? "green"
                    : factors.googleVisibility.score >= 12
                      ? "yellow"
                      : "red"
                }
              />
            )}
          </motion.div>
        )}

        <div className="space-y-6">

        {/* ── One Action Card (Von Restorff: the ONE thing that demands attention) ── */}
        {action && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <div className={`rounded-2xl p-6 sm:p-8 ${
              action.clear
                ? "bg-emerald-50/80 border border-emerald-200/60"
                : "bg-[#212D40] shadow-lg"
            }`}>
              <p className={`text-lg font-semibold leading-snug ${
                action.clear ? "text-emerald-800" : "text-white"
              }`}>
                {action.headline}
              </p>
              <p className={`mt-3 text-base leading-relaxed ${
                action.clear ? "text-emerald-700" : "text-white/70"
              }`}>
                {action.body}
              </p>
              {action.action_text && action.action_url && (
                <button
                  onClick={() => navigate(action.action_url!)}
                  className={`mt-5 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all ${
                    action.clear
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "bg-[#D56753] text-white hover:brightness-110 active:scale-[0.98]"
                  }`}
                >
                  {action.action_text}
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* ── Surprise Moments (appear when earned, vanish when seen) ── */}
        <AnimatePresence>
          {win && win.daysAgo <= 7 && (
            <motion.div
              key="win"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 p-5"
            >
              <p className="text-sm font-semibold text-amber-800">{win.headline}</p>
              {win.detail && (
                <p className="mt-1 text-sm text-amber-700">{win.detail}</p>
              )}
            </motion.div>
          )}

          {visiblePrompts.has("milestone") && milestone && (
            <motion.div
              key="milestone"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 p-5"
            >
              <p className="text-sm font-semibold text-blue-800">{milestone.title}</p>
              <p className="mt-1 text-sm text-blue-700">{milestone.body}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Streak (when earned) ── */}
        {streak && streak.count >= 2 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <StreakBadge
              type={streak.type}
              count={streak.count}
              label={streak.label}
            />
          </motion.div>
        )}

        {/* ── Temporary Prompts (max 2) ── */}
        {/* Getting Started checklist removed per Apple Principle: prohibited pattern.
            The product should feel pre-populated and already working, not like setup is required.
            "No onboarding tours. No 'getting started' checklists." */}

        {visiblePrompts.has("billing") && (
          <CardCapture
            trialDaysRemaining={ctx?.org?.trial_end_at ? Math.max(0, Math.ceil((new Date(ctx.org.trial_end_at).getTime() - Date.now()) / 86400000)) : 7}
            isSubscribed={!!billingStatus?.hasStripeSubscription}
          />
        )}

        {/* ── Community Proof (shown only at 100+ customers per spec) ── */}

        </div>
      </div>

      {/* ── Billing Prompt Bar (global, system-level) ── */}
      <BillingPromptBar
        orgId={orgId}
        score={score}
        finding={action?.headline || null}
      />
    </div>
  );
}
