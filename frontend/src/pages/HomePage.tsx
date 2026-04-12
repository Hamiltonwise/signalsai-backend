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
import { ChevronRight, Upload, ExternalLink, Users } from "lucide-react";
import { apiGet } from "@/api/index";
import { useAuth } from "@/hooks/useAuth";
import { useLocationContext } from "@/contexts/locationContext";
import { getPriorityItem } from "@/hooks/useLocalStorage";
import BillingPromptBar from "@/components/dashboard/BillingPromptBar";
import CardCapture from "@/components/dashboard/CardCapture";
import { NotificationWidget } from "@/components/dashboard/NotificationWidget";
import PendingActionsCard from "@/components/dashboard/PendingActionsCard";
import { PMSUploadWizardModal } from "@/components/PMS/PMSUploadWizardModal";

// ─── Types ──────────────────────────────────────────────────────────

type IntelligenceMode = "referral_based" | "direct_acquisition" | "hybrid";

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
  intelligence_mode?: IntelligenceMode;
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

interface OzMomentData {
  headline: string;
  context: string;
  status: "healthy" | "attention" | "critical";
  verifyUrl: string | null;
  surprise: number;
  actionText: string | null;
  actionUrl: string | null;
  signalType: string;
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

type ReadingStatus = "healthy" | "attention" | "critical";

// ─── Extract Readings from Data ─────────────────────────────────────

function extractReadings(ctx: DashboardContext | null, ranking: RankingData | null, rankingRaw: any) {
  const checkup = ctx?.org?.checkup_data;
  if (!checkup) return null;

  // Prefer ranking data (filtered, location-aware) over stale checkup data
  const topCompetitor = rankingRaw?.rawData?.topCompetitor || checkup.topCompetitor || checkup.top_competitor || null;
  const competitorName = typeof topCompetitor === "string" ? topCompetitor : topCompetitor?.name || null;
  const competitorReviews = typeof topCompetitor === "object" ? topCompetitor?.reviewCount : null;
  const city = checkup.market?.city || "";
  const orgName = ctx?.org?.name || "";

  const marketSearchUrl = city
    ? `https://www.google.com/search?q=${encodeURIComponent((checkup.market?.specialty || "business") + " " + city)}`
    : null;
  const googleSearchUrl = orgName
    ? `https://www.google.com/search?q=${encodeURIComponent(orgName)}`
    : null;

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

  // 1. Market Context (with rank position if available)
  if (competitorName && marketSearchUrl) {
    const totalComp = ranking?.totalCompetitors;
    const specialty = checkup.market?.specialty || "business";
    const totalTracked = totalComp || checkup.market?.totalCompetitors || null;
    const rankLabel = city
      ? `${specialty} in ${city}`
      : "Your local market";
    const rankContext = competitorName && totalTracked
      ? `${totalTracked} competitors tracked. Top competitor: ${competitorName}.`
      : competitorName
        ? `Top competitor: ${competitorName}`
        : "Alloro is monitoring your competitive landscape";

    readings.push({
      label: "Your Market",
      value: rankLabel,
      delta: totalTracked ? `${totalTracked} competitors tracked` : undefined,
      context: rankContext,
      status: competitorName ? "attention" : "healthy",
      verifyUrl: marketSearchUrl,
      verifyLabel: `Search "${checkup.market?.specialty || "business"} ${city}"`,
      whyItMatters: "Alloro measures from a fixed point so your trend is always comparable week to week. Google rankings shift by location, device, and time of day. Your Alloro rank is a consistent benchmark, not a real-time Google replica.",
    });
  }

  // 2. Reviews -- your count vs competitor gap, with interpretation
  const clientReviews = checkup.place?.reviewCount || checkup.reviewCount || 0;
  const clientRating = checkup.place?.rating || checkup.rating || null;
  if (clientReviews > 0) {
    const gap = competitorReviews ? competitorReviews - clientReviews : null;
    let reviewContext: string;

    if (gap && gap > 0 && competitorName) {
      // Behind: compute time-to-close at 2/week
      const weeksToClose = Math.ceil(gap / 2);
      const timeframe = weeksToClose <= 4
        ? `${weeksToClose} week${weeksToClose !== 1 ? "s" : ""}`
        : weeksToClose <= 52
          ? `about ${Math.ceil(weeksToClose / 4)} month${Math.ceil(weeksToClose / 4) !== 1 ? "s" : ""}`
          : "over a year";
      reviewContext = `${competitorName} leads by ${gap}. At 2 per week, you close it in ${timeframe}.`;
    } else if (gap && gap <= 0) {
      const lead = Math.abs(gap || 0);
      if (lead > 500) {
        reviewContext = `You lead by ${lead} reviews. That gap is a moat no competitor can close quickly.`;
      } else if (lead > 100) {
        reviewContext = `You lead by ${lead} reviews. Consistent effort keeps that gap growing.`;
      } else if (lead > 0) {
        reviewContext = `You lead by ${lead} reviews. Keep the pace to widen the gap.`;
      } else {
        reviewContext = "You're tied with your top competitor. Every new review shifts the balance.";
      }
    } else {
      reviewContext = clientRating
        ? `${clientRating} stars on Google. Alloro monitors your reviews daily.`
        : "Alloro monitors your reviews daily.";
    }

    readings.push({
      label: "Reviews",
      value: `${clientReviews}`,
      delta: clientRating ? `${clientRating} stars` : undefined,
      context: reviewContext,
      status: gap && gap > 50 ? "attention" : "healthy",
      verifyUrl: googleSearchUrl,
      verifyLabel: "Verify on Google",
    });
  }

  // 3. GBP Performance -- calls from Google (if OAuth connected and data available)
  const perfData = rankingRaw?.rawData?.client_gbp?.performance;
  if (perfData) {
    const calls = perfData.calls || 0;
    const directions = perfData.directions || 0;
    const clicks = perfData.clicks || 0;
    const total = calls + directions + clicks;

    if (total > 0) {
      const parts: string[] = [];
      if (calls > 0) parts.push(`${calls} call${calls !== 1 ? "s" : ""}`);
      if (directions > 0) parts.push(`${directions} direction${directions !== 1 ? "s" : ""}`);
      if (clicks > 0) parts.push(`${clicks} click${clicks !== 1 ? "s" : ""}`);

      // Identify top conversion channel
      const topChannel = calls >= directions && calls >= clicks
        ? "Calls"
        : directions >= clicks
          ? "Directions requests"
          : "Website clicks";
      const interpretation = `${topChannel} ${total > 1 ? "are" : "is"} your top conversion channel. Each one is someone who found you and took a step toward becoming a customer.`;

      readings.push({
        label: "From Google",
        value: `${total} actions`,
        context: parts.join(", ") + " this period. " + interpretation,
        status: total >= 10 ? "healthy" : "attention",
        verifyUrl: null,
      });
    }
  }

  // 4. GBP Profile completeness
  const place = checkup.place || {};
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
    let gbpInterpretation: string;
    if (missing === 0) {
      gbpInterpretation = "All fields complete. Google has everything it needs to show you accurately.";
    } else if (missing <= 2) {
      gbpInterpretation = `${missing} field${missing !== 1 ? "s" : ""} incomplete. Completing your profile helps Google match you with more searches.`;
    } else {
      gbpInterpretation = `${missing} fields incomplete. Customers and Google notice. An incomplete profile loses credibility before someone calls.`;
    }
    readings.push({
      label: "GBP Profile",
      value: `${complete}/5`,
      context: gbpInterpretation,
      status: complete >= 5 ? "healthy" : complete >= 3 ? "attention" : "critical",
      verifyUrl: googleSearchUrl,
      verifyLabel: "View your profile",
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

// ─── Client-Side Fallback Hero ─────────────────────────────────────
// When both Oz Engine API and Home Intelligence API return null/error,
// build a hero card from the readings data that the status strip already
// rendered successfully. This ensures the page NEVER looks empty.

function buildFallbackHero(
  readings: NonNullable<ReturnType<typeof extractReadings>>,
): OzMomentData | null {
  // Find the review reading -- it has the most actionable data
  const reviewReading = readings.find(r => r.label === "Reviews");
  const marketReading = readings.find(r => r.label === "Your Market");

  // If we have review data with a competitor gap, that's the strongest hero
  if (reviewReading && reviewReading.context.includes("Gap:")) {
    const gapMatch = reviewReading.context.match(/Gap:\s*(\d+)/);
    const gap = gapMatch ? parseInt(gapMatch[1], 10) : null;
    const compMatch = reviewReading.context.match(/^(.+?)\s+has\s+(\d+)/);
    const compName = compMatch ? compMatch[1] : null;

    if (gap && compName) {
      const weeksToClose = Math.ceil(gap / 2);
      const timeframe = weeksToClose <= 4
        ? `${weeksToClose} weeks`
        : weeksToClose <= 52
          ? `about ${Math.ceil(weeksToClose / 4)} months`
          : "over a year";
      return {
        headline: `${compName} has ${gap} more reviews than you. That gap is closeable.`,
        context: `At 2 reviews per week, you close it in ${timeframe}. Every review also strengthens how Google describes your business.`,
        status: gap > 100 ? "attention" : "healthy",
        verifyUrl: reviewReading.verifyUrl,
        surprise: 4,
        actionText: "See the full comparison",
        actionUrl: "/compare",
        signalType: "fallback_gap",
      };
    }
  }

  // If we lead in reviews
  if (reviewReading && reviewReading.context.includes("You lead")) {
    return {
      headline: reviewReading.context.split(".")[0] + ".",
      context: "Consistent reviews keep you ahead. One review per week compounds into a moat your competitors cannot close quickly.",
      status: "healthy",
      verifyUrl: reviewReading.verifyUrl,
      surprise: 3,
      actionText: null,
      actionUrl: null,
      signalType: "fallback_lead",
    };
  }

  // Market reading with competitor info
  if (marketReading) {
    return {
      headline: `Alloro is tracking your competitive landscape.`,
      context: marketReading.context,
      status: "healthy",
      verifyUrl: marketReading.verifyUrl,
      surprise: 2,
      actionText: null,
      actionUrl: null,
      signalType: "fallback_market",
    };
  }

  return null;
}

// ─── Component ──────────────────────────────────────────────────────

export default function HomePage() {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const navigate = useNavigate();
  const { userProfile, billingStatus } = useAuth();
  const { selectedLocation } = useLocationContext();
  const orgId = userProfile?.organizationId || null;

  const { data: ctx } = useQuery<DashboardContext>({
    queryKey: ["home-context", orgId, selectedLocation?.id],
    queryFn: () => apiGet({ path: "/user/dashboard-context" }),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const { data: rankingRaw } = useQuery<any>({
    queryKey: ["home-ranking", orgId, selectedLocation?.id],
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

  const { data: intelligenceData } = useQuery<{
    recentActions: string[];
    weeklyFinding: { headline: string; bullets: string[] } | null;
    watchline: string | null;
    watchlineType: string | null;
  }>({
    queryKey: ["home-intelligence", orgId],
    queryFn: () => apiGet({ path: "/user/home-intelligence" }),
    enabled: !!orgId,
    staleTime: 120_000,
  });

  const { data: ozData } = useQuery<{ ozMoment: OzMomentData | null }>({
    queryKey: ["oz-engine", orgId],
    queryFn: () => apiGet({ path: "/user/oz-engine" }),
    enabled: !!orgId,
    staleTime: 120_000,
  });

  const { data: proofData } = useQuery<{
    prooflineTimeline: Array<{
      date: string;
      title: string;
      narrative: string;
      proofType: string;
      valueChange: string | null;
    }>;
  }>({
    queryKey: ["proof-of-work", orgId],
    queryFn: () => apiGet({ path: "/user/proof-of-work" }),
    enabled: !!orgId,
    staleTime: 300_000,
  });

  // ── Derived State ──
  const action = actionData?.card || null;
  const greeting = buildGreeting(ctx || null);
  const readings = extractReadings(ctx || null, ranking, rankingRaw);
  const milestone = milestoneData?.card || null;
  const ozMoment = ozData?.ozMoment || null;

  const intelligenceMode: IntelligenceMode = ctx?.intelligence_mode || "referral_based";
  const showReferralSections = intelligenceMode !== "direct_acquisition";

  const isTrialActive = ctx?.org?.subscription_status === "active" && ctx?.org?.trial_end_at;
  const needsOnboarding = setupProgress && !setupProgress.completed && !setupProgress.dismissed;
  const needsBilling = billingStatus && !billingStatus.hasStripeSubscription && !billingStatus.isAdminGranted;

  const visiblePrompts = limitPrompts([
    { key: "onboarding", show: !!needsOnboarding },
    { key: "billing", show: !!needsBilling && !!isTrialActive },
    { key: "milestone", show: !!milestone },
  ]);



  // Status strip data from readings
  const statusItems = readings ? readings.slice(0, 4).map(r => ({
    label: r.label,
    value: r.value,
    context: r.context.split(".")[0], // First sentence only for strip
    status: r.status,
  })) : [];

  return (
    <div className="min-h-screen bg-[#F8F6F2]">
      <div className="max-w-[800px] mx-auto px-4 sm:px-6 py-8 sm:py-12">

        {/* ═══ ABOVE THE FOLD ═══ */}

        {/* ── 1. Greeting (ambient, one line) ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-4"
        >
          <h1 className="text-2xl font-semibold text-[#1A1D23] tracking-tight">{greeting}</h1>
        </motion.div>

        {/* ── 2. THE OZ MOMENT (HERO) ── */}
        {(() => {
          // Build a client-side fallback hero from readings when Oz engine and watchline both miss
          const fallbackHero = !ozMoment && !intelligenceData?.watchline && readings && readings.length > 0
            ? buildFallbackHero(readings)
            : null;
          const heroData = ozMoment || fallbackHero;

          if (heroData) {
            return (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="mb-5"
              >
                <div className={`w-full rounded-2xl px-6 py-6 sm:py-8 flex flex-col justify-center ${
                  heroData.signalType === "clean_week" || heroData.status === "healthy"
                    ? "bg-[#F8F6F2] border border-emerald-200"
                    : "bg-[#FDF4F2] border border-[#D56753]/10"
                }`}>
                  {/* Status indicator */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`w-2.5 h-2.5 rounded-full ${
                      heroData.status === "healthy" ? "bg-emerald-500" : heroData.status === "attention" ? "bg-amber-400" : "bg-red-500"
                    }`} />
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#9CA3AF]">
                      {heroData.signalType === "clean_week" ? "ALL CLEAR" : "THIS WEEK"}
                    </span>
                  </div>

                  {/* The headline */}
                  <h2 className="text-2xl sm:text-3xl font-semibold text-[#1A1D23] leading-tight tracking-tight mb-4">
                    {heroData.headline}
                  </h2>

                  {/* Supporting context */}
                  <p className="text-base text-gray-500 leading-relaxed max-w-[640px]">
                    {heroData.context}
                  </p>

                  {/* Action + verify row */}
                  <div className="flex flex-wrap items-center gap-4 mt-6">
                    {heroData.actionText && heroData.actionUrl && (
                      <button
                        onClick={() => navigate(heroData.actionUrl!)}
                        className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold bg-[#D56753] text-white hover:brightness-105 active:scale-[0.98] transition-all"
                      >
                        {heroData.actionText}
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                    {heroData.verifyUrl && (
                      <a
                        href={heroData.verifyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#D56753] hover:underline"
                      >
                        Verify on Google
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          }

          if (intelligenceData?.watchline) {
            return (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="mb-5"
              >
                <div className="w-full rounded-2xl bg-[#FDF4F2] border border-[#D56753]/10 px-6 py-6 sm:py-8 flex flex-col justify-center">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#9CA3AF] mb-5">THIS WEEK</span>
                  <h2 className="text-2xl sm:text-3xl font-semibold text-[#1A1D23] leading-tight tracking-tight">
                    {intelligenceData.watchline}
                  </h2>
                </div>
              </motion.div>
            );
          }

          return null;
        })()}

        {/* ── DRAFTS FOR YOU (the work Alloro did, waiting for one tap) ── */}
        {orgId && <PendingActionsCard orgId={orgId} />}

        {/* ── 3. Score Shortcuts (status strip) ── */}
        {statusItems.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-8"
          >
            <div className={`grid gap-0 ${statusItems.length >= 4 ? "grid-cols-2 sm:grid-cols-4" : statusItems.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
              {statusItems.map((item, i) => {
                const dotColor = item.status === "healthy" ? "bg-emerald-500" : item.status === "attention" ? "bg-amber-400" : "bg-red-500";
                return (
                  <div key={item.label} className={`py-5 px-5 ${i > 0 ? "sm:border-l sm:border-[#1A1D23]/5" : ""}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                      <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">{item.label}</span>
                    </div>
                    <p className="text-2xl font-semibold text-[#1A1D23] leading-none tracking-tight">{item.value}</p>
                    <p className="text-sm text-gray-500 mt-1.5 leading-snug">{item.context}</p>
                  </div>
                );
              })}
            </div>
          </motion.div>
        ) : ctx ? (
          <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-5 mb-5">
            <p className="text-sm font-medium text-[#1A1D23]">Alloro is scanning your market.</p>
            <p className="text-sm text-gray-500 mt-1">Your competitive readings will appear here within 24 hours of your first scan.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 mb-5">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className={`py-5 px-5 animate-pulse ${i > 1 ? "sm:border-l sm:border-[#1A1D23]/5" : ""}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-gray-200" />
                  <span className="h-3 w-20 bg-gray-200 rounded" />
                </div>
                <div className="h-7 w-24 bg-gray-200 rounded mb-1.5" />
                <div className="h-4 w-32 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* ── 4. One Action Card (SECONDARY -- below the fold) ── */}
        {action && !action.clear && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="mb-8"
          >
            <div className="w-full px-8 py-8 bg-[#212D40] rounded-2xl">
              <p className="text-xs font-semibold uppercase tracking-wider mb-4 text-[#D56753]">
                YOUR NEXT MOVE
              </p>
              <p className="text-xl sm:text-2xl font-semibold leading-snug tracking-tight text-white">
                {action.headline}
              </p>
              {action.body && (
                <p className="mt-3 text-sm leading-relaxed text-white/70">
                  {action.body}
                </p>
              )}
              {action.action_text && action.action_url && (
                <button
                  onClick={() => navigate(action.action_url!)}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold bg-[#D56753] text-white hover:brightness-110 active:scale-[0.98] transition-all"
                >
                  {action.action_text}
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* ═══ BELOW THE FOLD -- Intelligence Sections (no boxes) ═══ */}

        {/* ── This Week ── */}
        {intelligenceData?.weeklyFinding && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mb-10 pl-4 border-l-2 border-[#212D40]"
          >
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-3">THIS WEEK</p>
            <p className="text-xl font-semibold text-[#1A1D23] leading-snug">{intelligenceData.weeklyFinding.headline}</p>
            {intelligenceData.weeklyFinding.bullets.length > 0 && (
              <div className="mt-3 space-y-2">
                {intelligenceData.weeklyFinding.bullets.map((bullet, i) => (
                  <p key={i} className="text-sm text-gray-500 leading-relaxed">{bullet}</p>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Competitive detail lives on Get Found. Readings above the fold. */}

        {/* ── Working in the Background ── */}
        {(proofData?.prooflineTimeline?.length ?? 0) > 0 ? (
          <div className="mb-10 pl-4 border-l-2 border-[#1A1D23]/10">
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-3">WHAT ALLORO DID</p>
            <div className="space-y-3">
              {proofData!.prooflineTimeline.slice(0, 3).map((entry, i) => (
                <div key={i}>
                  <p className="text-xs text-gray-400 mb-0.5">
                    {new Date(entry.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                  <p className="text-sm text-[#1A1D23] font-semibold">{entry.title}</p>
                  {entry.narrative && (
                    <p className="text-sm text-gray-500 mt-0.5">{entry.narrative}</p>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => navigate("/progress")}
              className="mt-3 inline-flex items-center gap-1 text-xs text-[#D56753] font-semibold hover:underline"
            >
              See full timeline <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        ) : intelligenceData?.recentActions && intelligenceData.recentActions.length > 0 ? (
          <div className="mb-10 pl-4 border-l-2 border-[#1A1D23]/10">
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-3">WORKING IN THE BACKGROUND</p>
            <div className="space-y-2">
              {intelligenceData.recentActions.map((act, i) => (
                <p key={i} className="text-sm text-gray-500">{act}</p>
              ))}
            </div>
          </div>
        ) : null}

        {/* ═══ SECONDARY CONTENT ═══ */}
        <div className="space-y-6 mt-4">

        {orgId && (
          <NotificationWidget
            organizationId={orgId}
            locationId={selectedLocation?.id || null}
          />
        )}

        {/* ── Share Prompt: connect logged-in users to the referral system ── */}
        {/* Hidden for direct_acquisition verticals (plumbers, restaurants, etc.) */}
        {showReferralSections && ctx?.referral_stats?.referral_code && (() => {
          const checkup = ctx?.org?.checkup_data;
          // Prefer ranking data (filtered, location-aware) over stale checkup data
          const topComp = rankingRaw?.rawData?.topCompetitor || checkup?.topCompetitor;
          const compName = typeof topComp === "string" ? topComp : topComp?.name || null;
          const compReviews = typeof topComp === "object" ? topComp?.reviewCount : null;
          const clientRevs = checkup?.place?.reviewCount || checkup?.reviewCount || 0;
          const gap = compReviews && compReviews > clientRevs ? compReviews - clientRevs : 0;
          const link = `${window.location.origin}/checkup?ref=${ctx.referral_stats!.referral_code}`;

          const shareText = compName && gap > 0
            ? `I just found out ${compName} has ${gap} more reviews than me. Took 60 seconds to see. Check yours: ${link}`
            : compName
              ? `I just checked how I stack up against ${compName} on Google. You should see yours: ${link}`
              : `I just checked my Google presence against my competitors. Took 60 seconds. You should see yours: ${link}`;

          const lead = compReviews && clientRevs > compReviews ? clientRevs - compReviews : 0;
          const headline = compName && gap > 0
            ? `${compName} has ${gap} more reviews than you. Know someone in the same spot?`
            : compName && lead > 0
              ? `You lead your market by ${lead} reviews. Know someone who'd want to see their numbers?`
              : "Know a business owner who could use this?";

          return (
          <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-[#1A1D23] mb-1">{headline}</p>
                <p className="text-sm text-gray-500 mb-3">
                  They get a free Google Health Check. You both save on your first month.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      if (navigator.share) {
                        navigator.share({ text: shareText });
                      } else {
                        navigator.clipboard.writeText(link);
                      }
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#D56753] text-white text-sm font-medium hover:brightness-105 transition-all"
                  >
                    <Users className="w-4 h-4" />
                    Share your link
                  </button>
                </div>
              </div>
            </div>
          </div>
          );
        })()}

        {/* Referral data / upload prompt -- hidden for direct_acquisition verticals */}
        {showReferralSections && (
          ctx?.has_referral_data ? (
            <div className="pl-4 border-l-2 border-[#1A1D23]/10 py-2">
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Your Business Data</p>
              <p className="text-sm text-gray-500">
                {ctx?.referral_stats?.referrals_converted
                  ? `${ctx.referral_stats.referrals_converted} referral${ctx.referral_stats.referrals_converted !== 1 ? "s" : ""} converted`
                  : "Referral data uploaded"}
                {". "}
                <button onClick={() => navigate("/compare")} className="text-[#1A1D23] font-semibold hover:underline">
                  See details on Get Found
                </button>
              </p>
            </div>
          ) : ctx && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-6"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#D56753]/10 flex items-center justify-center flex-shrink-0">
                  <Upload className="w-5 h-5 text-[#D56753]" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#1A1D23] mb-1">See where your customers come from</p>
                  <p className="text-sm text-gray-500 mb-4">
                    Upload a referral report from your system and Alloro will show you which sources drive the most business, which ones are declining, and what to do about it.
                  </p>
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#D56753] text-white text-sm font-medium hover:brightness-105 transition-all"
                  >
                    <Upload className="w-4 h-4" />
                    Upload business data
                  </button>
                </div>
              </div>
            </motion.div>
          )
        )}

        <AnimatePresence>
          {visiblePrompts.has("milestone") && milestone && (
            <motion.div
              key="milestone"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="pl-4 border-l-2 border-blue-300 py-3"
            >
              <p className="text-sm font-semibold text-blue-800">{milestone.title}</p>
              <p className="mt-1 text-sm text-blue-700">{milestone.body}</p>
            </motion.div>
          )}
        </AnimatePresence>

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

      {orgId && (
        <PMSUploadWizardModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          clientId={String(orgId)}
          onSuccess={() => setShowUploadModal(false)}
        />
      )}
    </div>
  );
}
