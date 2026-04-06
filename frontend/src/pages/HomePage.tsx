/**
 * Home -- "Am I okay?"
 *
 * The blood panel. Raw readings from Google, each with a verification link.
 * No scores. No gauges. No algorithms. The doctor reads the panel.
 *
 * Three sections:
 * 1. Where you stand: readings with verification links
 * 2. What it means: the one action card (the doctor's note)
 * 3. What's being done: proof of work (when DFY actions exist)
 *
 * Rules:
 * - Max 2 temporary prompts visible at once
 * - Every number links to where you verify it on Google
 * - No composite scores
 * - Everything else is conditional and temporary
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ExternalLink, HelpCircle } from "lucide-react";
import { apiGet } from "@/api/index";
import { useAuth } from "@/hooks/useAuth";
import { useLocationContext } from "@/contexts/locationContext";
import { getPriorityItem } from "@/hooks/useLocalStorage";
import BillingPromptBar from "@/components/dashboard/BillingPromptBar";
import CardCapture from "@/components/dashboard/CardCapture";
import { NotificationWidget } from "@/components/dashboard/NotificationWidget";
import { PMSUploadWizardModal } from "@/components/PMS/PMSUploadWizardModal";

// ─── Types ──────────────────────────────────────────────────────────

interface DashboardContext {
  org?: {
    id: number;
    name: string;
    created_at: string;
    owner_archetype?: string | null;
    checkup_score?: number | null;
    current_clarity_score?: number | null;
    checkup_data?: any;
    subscription_status?: string;
    trial_end_at?: string | null;
  };
  user?: { first_name?: string; last_name?: string; email?: string };
  has_referral_data?: boolean;
  referral_stats?: {
    referral_code?: string;
    referrals_converted?: number;
    months_earned?: number;
  } | null;
}

interface RankingData {
  rankPosition: number | null;
  totalCompetitors: number | null;
  rankScore: number | null;
  location: string | null;
  topCompetitor?: { name: string; reviewCount: number } | null;
}

interface OneAction {
  headline: string;
  body: string;
  action_text: string | null;
  action_url: string | null;
  priority_level: number;
  clear?: boolean;
}

// ─── Greeting ───────────────────────────────────────────────────────

function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function buildGreeting(ctx: DashboardContext | null): string {
  const firstName = ctx?.user?.first_name || null;
  if (firstName) return `${getTimeGreeting()}, ${firstName}.`;
  return `${getTimeGreeting()}.`;
}

// ─── Reading Card ───────────────────────────────────────────────────

type ReadingStatus = "healthy" | "attention" | "critical";

function ReadingCard({
  label,
  value,
  delta,
  context,
  status,
  verifyUrl,
  verifyLabel,
  whyItMatters,
}: {
  label: string;
  value: string;
  delta?: string;
  context: string;
  status: ReadingStatus;
  verifyUrl?: string | null;
  verifyLabel?: string;
  whyItMatters?: string;
}) {
  const [showWhy, setShowWhy] = useState(false);
  const statusStyles = {
    healthy: { dot: "bg-emerald-500", bg: "border-emerald-200/60" },
    attention: { dot: "bg-amber-400", bg: "border-amber-200/60" },
    critical: { dot: "bg-red-500", bg: "border-red-200/60" },
  };
  const s = statusStyles[status];

  return (
    <div className={`rounded-2xl bg-stone-50/80 border ${s.bg} p-6 sm:p-7`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className={`w-2.5 h-2.5 rounded-full ${s.dot} ring-4 ring-opacity-15 ${
            status === "healthy" ? "ring-emerald-500" : status === "attention" ? "ring-amber-400" : "ring-red-500"
          }`} />
          <span className="text-xs text-[#1A1D23]/40 font-semibold uppercase tracking-wider">{label}</span>
        </div>
        {whyItMatters && (
          <button
            onClick={() => setShowWhy(!showWhy)}
            className="w-6 h-6 rounded-full flex items-center justify-center text-[#1A1D23]/20 hover:text-[#D56753] transition-colors"
            aria-label="Why this matters"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="flex items-baseline gap-3">
        <p className="text-3xl font-semibold text-[#1A1D23] leading-none tracking-tight">{value}</p>
        {delta && (
          <span className="text-sm font-semibold text-emerald-600">{delta}</span>
        )}
      </div>
      <p className="text-sm text-[#1A1D23]/50 mt-3 leading-relaxed">{context}</p>
      {showWhy && whyItMatters && (
        <div className="mt-4 pt-4 border-t border-[#1A1D23]/5">
          <p className="text-xs text-[#1A1D23]/35 leading-relaxed">{whyItMatters}</p>
        </div>
      )}
      {verifyUrl && (
        <a
          href={verifyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-[#1A1D23]/40 font-semibold mt-3 hover:text-[#1A1D23]/60 hover:underline"
        >
          {verifyLabel || "Verify on Google"}
          <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}

// ─── Extract Readings from Data ─────────────────────────────────────

function extractReadings(ctx: DashboardContext | null, ranking: RankingData | null) {
  const checkup = ctx?.org?.checkup_data;
  if (!checkup) return null;

  const place = checkup.place || {};
  const topCompetitor = checkup.topCompetitor || checkup.top_competitor || null;
  const competitorName = typeof topCompetitor === "string" ? topCompetitor : topCompetitor?.name || null;
  const competitorReviewCount = typeof topCompetitor === "object" ? topCompetitor?.reviewCount : null;
  const orgName = ctx?.org?.name || "";
  const city = checkup.market?.city || "";

  const rating = place.rating || checkup.rating || null;
  const reviewCount = place.reviewCount ?? checkup.reviewCount ?? null;

  // GBP fields - check every field variant the API and checkup might store
  const gbpFields = [
    { name: "Phone", present: !!(place.hasPhone || place.phone || place.nationalPhoneNumber || place.internationalPhoneNumber) },
    { name: "Hours", present: !!(place.hasHours || place.hours || place.regularOpeningHours) },
    { name: "Website", present: !!(place.hasWebsite || place.websiteUri || place.website) },
    { name: "Photos", present: (place.photosCount || place.photoCount || place.photos?.length || 0) > 0 },
    { name: "Description", present: !!(place.hasEditorialSummary || place.editorialSummary) },
  ];
  const gbpComplete = gbpFields.filter(f => f.present).length;
  const gbpMissing = gbpFields.filter(f => !f.present).map(f => f.name);

  // Build Google search URLs for verification
  const googleSearchUrl = orgName
    ? `https://www.google.com/search?q=${encodeURIComponent(orgName)}`
    : null;
  const competitorSearchUrl = competitorName
    ? `https://www.google.com/search?q=${encodeURIComponent(competitorName)}`
    : null;
  const marketSearchUrl = city
    ? `https://www.google.com/search?q=${encodeURIComponent((checkup.market?.specialty || "business") + " " + city)}`
    : null;

  // Baseline review count from signup (for trend delta)
  const baselineReviews = checkup.checkup_review_count_at_creation ?? checkup.reviewCount ?? null;
  const reviewDelta = (reviewCount != null && baselineReviews != null) ? reviewCount - baselineReviews : null;

  // Days active (for context)
  const createdAt = ctx?.org?.created_at;
  const daysActive = createdAt ? Math.max(1, Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24))) : null;

  const readings: {
    label: string;
    value: string;
    delta?: string;
    context: string;
    status: ReadingStatus;
    verifyUrl: string | null;
    verifyLabel?: string;
    whyItMatters?: string;
  }[] = [];

  // Reading 1: Star Rating
  if (rating != null) {
    readings.push({
      label: "Star Rating",
      value: `${rating} stars`,
      context: rating >= 4.5
        ? "Above the threshold most consumers require"
        : rating >= 4.0
          ? "68% of consumers require 4+ stars"
          : "Below the threshold most consumers require",
      status: rating >= 4.5 ? "healthy" : rating >= 4.0 ? "attention" : "critical",
      verifyUrl: googleSearchUrl,
      verifyLabel: `Search "${orgName}"`,
      whyItMatters: "68% of consumers require 4+ stars. 31% require 4.5+. Conversion drops steeply below 4.0. Every 5-star review moves your average. (BrightLocal 2026)",
    });
  }

  // Reading 2: Review Count vs Competitor
  if (reviewCount != null) {
    const ratio = competitorReviewCount ? reviewCount / competitorReviewCount : 1;
    readings.push({
      label: "Review Volume",
      value: `${reviewCount} reviews`,
      delta: reviewDelta != null && reviewDelta > 0 ? `+${reviewDelta} since joining` : reviewDelta === 0 && daysActive && daysActive > 7 ? "Holding steady" : undefined,
      context: competitorName && competitorReviewCount
        ? `${competitorName} has ${competitorReviewCount}. ${reviewCount >= competitorReviewCount ? "You lead." : `Gap: ${competitorReviewCount - reviewCount}.`}`
        : `${reviewCount} reviews in your market`,
      status: ratio >= 1 ? "healthy" : ratio >= 0.5 ? "attention" : "critical",
      verifyUrl: competitorSearchUrl,
      verifyLabel: competitorName ? `Search "${competitorName}"` : "Search competitors",
      whyItMatters: "Google uses review count as a top 3 local ranking factor. Businesses with 50+ reviews earn 4.6x more revenue. The gap vs your top competitor matters most. (Whitespark 2026, Womply)",
    });
  }

  // Reading 3: GBP Completeness
  readings.push({
    label: "Profile Completeness",
    value: `${gbpComplete}/5 fields`,
    context: gbpMissing.length > 0
      ? `Missing: ${gbpMissing.join(", ")}. Complete profiles are 2.7x more reputable.`
      : "All fields complete. Your profile signals credibility to Google.",
    status: gbpComplete >= 5 ? "healthy" : gbpComplete >= 3 ? "attention" : "critical",
    verifyUrl: googleSearchUrl,
    verifyLabel: "Check your Google Business Profile",
    whyItMatters: "Complete profiles are 2.7x more likely to be considered reputable and 70% more likely to attract visits. GBP signals are 32% of local ranking weight. (Google, Whitespark 2026)",
  });

  // Reading 4: Response Rate (if we have review data)
  const reviews = place.reviews || checkup.reviews || [];
  if (reviews.length > 0) {
    const responded = reviews.filter((r: any) => !!r.ownerResponse).length;
    const rate = Math.round((responded / reviews.length) * 100);
    readings.push({
      label: "Review Responses",
      value: `${rate}% responded`,
      context: rate >= 80
        ? "Strong response rate signals active management to Google"
        : rate >= 1
          ? "Businesses that respond to reviews earn 35% more revenue"
          : "No responses found. Each response signals activity to Google.",
      status: rate >= 80 ? "healthy" : rate >= 1 ? "attention" : "critical",
      verifyUrl: googleSearchUrl,
      verifyLabel: "Check your reviews for responses",
      whyItMatters: "Google confirms responding to reviews improves local ranking. Businesses that respond earn 35% more revenue. A response signals your business is active and engaged. (Google, Womply)",
    });
  }

  // Reading 5: Market Context (with rank position if available)
  if (competitorName && marketSearchUrl) {
    const rankPos = ranking?.rankPosition;
    const totalComp = ranking?.totalCompetitors;
    const rankLabel = rankPos && city
      ? `Ranked #${rankPos} in ${city}`
      : city
        ? `${checkup.market?.specialty || "Business"} in ${city}`
        : "Your local market";
    const rankContext = rankPos
      ? `${competitorName ? `Top competitor: ${competitorName}. ` : ""}Measured from the center of your market. Google rankings vary by searcher location.`
      : competitorName
        ? `Top competitor: ${competitorName}`
        : "Alloro is monitoring your competitive landscape";

    readings.push({
      label: "Your Market",
      value: rankLabel,
      delta: rankPos && totalComp ? `${totalComp} competitors tracked` : undefined,
      context: rankContext,
      status: rankPos && rankPos <= 3 ? "healthy" : "attention",
      verifyUrl: marketSearchUrl,
      verifyLabel: `Search "${checkup.market?.specialty || "business"} ${city}"`,
      whyItMatters: "Alloro measures from a fixed point so your trend is always comparable week to week. Google rankings shift by location, device, and time of day. Your Alloro rank is a consistent benchmark, not a real-time Google replica.",
    });
  }

  return readings;
}

// ─── Prompt Limiter ─────────────────────────────────────────────────

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

  const { data: setupProgress } = useQuery<any>({
    queryKey: ["home-setup", orgId],
    queryFn: () => apiGet({ path: "/onboarding/setup-progress" }),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  // ── Derived State ──
  const action = actionData?.card || null;
  const greeting = buildGreeting(ctx || null);
  const readings = extractReadings(ctx || null, ranking);
  const milestone = milestoneData?.card || null;

  const isTrialActive = ctx?.org?.subscription_status === "active" && ctx?.org?.trial_end_at;
  const needsOnboarding = setupProgress && !setupProgress.completed && !setupProgress.dismissed;
  const needsBilling = billingStatus && !billingStatus.hasStripeSubscription && !billingStatus.isAdminGranted;

  const visiblePrompts = limitPrompts([
    { key: "onboarding", show: !!needsOnboarding },
    { key: "billing", show: !!needsBilling && !!isTrialActive },
    { key: "milestone", show: !!milestone },
  ]);

  const [showUploadModal, setShowUploadModal] = useState(false);

  return (
    <div className="min-h-screen bg-[#F8F6F2]">
      <div className="max-w-[640px] mx-auto px-5 sm:px-8 py-10 sm:py-14">

        {/* ── Greeting ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <h1 className="text-3xl sm:text-4xl font-semibold text-[#1A1D23] tracking-tight leading-tight">{greeting}</h1>
        </motion.div>

        {/* ── One Action Card (Navy, full width) ── */}
        {action && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="mb-8"
          >
            <div className={`w-full rounded-xl p-6 ${
              action.clear
                ? "bg-emerald-50/60 border border-emerald-200/40"
                : "bg-[#212D40]"
            }`}>
              <p className={`text-xs font-semibold uppercase tracking-widest mb-3 ${
                action.clear ? "text-emerald-600" : "text-[#D56753]"
              }`}>
                YOUR NEXT MOVE
              </p>
              <p className={`text-lg font-medium leading-snug ${
                action.clear ? "text-emerald-800" : "text-white"
              }`} style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {action.headline}
              </p>
              {action.body && (
                <p className={`mt-2 text-sm leading-relaxed ${
                  action.clear ? "text-emerald-700/80" : "text-white/60"
                }`}>
                  {action.body}
                </p>
              )}
              {action.action_text && action.action_url && (
                <button
                  onClick={() => navigate(action.action_url!)}
                  className={`mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
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

        {/* ── 3. Readings (below the fold) ── */}
        <div className="mt-6">
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest mb-4">
            WHAT ALLORO IS TRACKING
          </p>

          {readings && readings.length > 0 ? (
            <div className="space-y-3">
              {readings.map((reading) => (
                <ReadingCard
                  key={reading.label}
                  label={reading.label}
                  value={reading.value}
                  delta={reading.delta}
                  context={reading.context}
                  status={reading.status}
                  verifyUrl={reading.verifyUrl}
                  verifyLabel={reading.verifyLabel}
                  whyItMatters={reading.whyItMatters}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-6 sm:p-7 animate-pulse">
                  <div className="flex items-center gap-2.5 mb-4">
                    <span className="w-2.5 h-2.5 rounded-full bg-gray-200" />
                    <span className="h-3 w-24 bg-gray-200 rounded" />
                  </div>
                  <div className="h-8 w-32 bg-gray-200 rounded mb-3" />
                  <div className="h-4 w-48 bg-gray-100 rounded" />
                </div>
              ))}
              <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-5">
                <p className="text-sm font-semibold text-[#1A1D23]">Alloro is building your health panel</p>
                <p className="text-sm text-gray-500 mt-1">
                  Your readings appear here once your Google Business Profile data syncs. This usually takes a few minutes after signup.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Below readings: secondary content ── */}
        <div className="space-y-6 mt-8">

        {/* ── Latest Update ── */}
        {orgId && (
          <NotificationWidget
            organizationId={orgId}
            locationId={selectedLocation?.id || null}
          />
        )}

        {/* ── Business Data Upload Prompt ── */}
        {ctx && ctx.has_referral_data === false && (
          <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-5 sm:p-6">
            <p className="text-sm font-semibold text-[#1A1D23] mb-1">Have referral or revenue data?</p>
            <p className="text-sm text-gray-500 mb-4">
              Upload it to unlock deeper intelligence about who sends you business.
            </p>
            <button
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#212D40] text-white text-sm font-medium hover:bg-[#2a3a52] transition-all"
            >
              Upload business data
            </button>
          </div>
        )}

        {showUploadModal && orgId && (
          <PMSUploadWizardModal
            isOpen={showUploadModal}
            onClose={() => setShowUploadModal(false)}
            clientId={String(orgId)}
            locationId={selectedLocation?.id}
            onSuccess={() => setShowUploadModal(false)}
          />
        )}

        {/* ── Practice Data Summary ── */}
        {ctx?.has_referral_data && (
          <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-5 sm:p-6">
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Your Business Data</p>
            <p className="text-sm text-gray-500">
              {ctx?.referral_stats?.referrals_converted
                ? `${ctx.referral_stats.referrals_converted} referral${ctx.referral_stats.referrals_converted !== 1 ? "s" : ""} converted`
                : "Referral data uploaded"}
              {" -- "}
              <button
                onClick={() => navigate("/compare")}
                className="text-[#1A1D23] font-semibold hover:underline"
              >
                See details on Get Found
              </button>
            </p>
          </div>
        )}

        {/* ── Surprise Moments ── */}
        <AnimatePresence>
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

        {/* ── Billing ── */}
        {visiblePrompts.has("billing") && (
          <CardCapture
            trialDaysRemaining={ctx?.org?.trial_end_at ? Math.max(0, Math.ceil((new Date(ctx.org.trial_end_at).getTime() - Date.now()) / 86400000)) : 7}
            isSubscribed={!!billingStatus?.hasStripeSubscription}
          />
        )}

        </div>
      </div>

      <BillingPromptBar
        orgId={orgId}
        score={null}
        finding={action?.headline || null}
      />
    </div>
  );
}
