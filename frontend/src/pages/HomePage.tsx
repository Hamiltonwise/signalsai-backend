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

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { apiGet } from "@/api/index";
import { useAuth } from "@/hooks/useAuth";
import { useLocationContext } from "@/contexts/locationContext";
import { getPriorityItem } from "@/hooks/useLocalStorage";
import BillingPromptBar from "@/components/dashboard/BillingPromptBar";
import CardCapture from "@/components/dashboard/CardCapture";
import { NotificationWidget } from "@/components/dashboard/NotificationWidget";

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

type ReadingStatus = "healthy" | "attention" | "critical";

// ─── Extract Readings from Data ─────────────────────────────────────

function extractReadings(ctx: DashboardContext | null, ranking: RankingData | null, rankingRaw: any) {
  const checkup = ctx?.org?.checkup_data;
  if (!checkup) return null;

  const topCompetitor = checkup.topCompetitor || checkup.top_competitor || null;
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
    const rankPos = ranking?.rankPosition;
    const totalComp = ranking?.totalCompetitors;
    const specialty = checkup.market?.specialty || "business";
    const totalTracked = totalComp || checkup.market?.totalCompetitors || null;
    const rankLabel = rankPos && city
      ? `#${rankPos} in ${city}`
      : city
        ? `${specialty} in ${city}`
        : "Your local market";
    const rankContext = rankPos && city && totalTracked
      ? `When patients search for ${specialty === "orthodontist" ? "an" : "a"} ${specialty} near ${city} in Google Maps, you appear #${rankPos} of ${totalTracked} practices tracked.`
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

  // 2. Reviews -- your count vs competitor gap
  const clientReviews = checkup.place?.reviewCount || checkup.reviewCount || 0;
  const clientRating = checkup.place?.rating || checkup.rating || null;
  if (clientReviews > 0) {
    const gap = competitorReviews ? competitorReviews - clientReviews : null;
    const reviewContext = gap && gap > 0 && competitorName
      ? `${competitorName} has ${competitorReviews}. Gap: ${gap}.`
      : gap && gap <= 0
        ? `You lead your top competitor by ${Math.abs(gap || 0)} reviews.`
        : clientRating
          ? `${clientRating} stars on Google.`
          : "Alloro monitors your reviews daily.";

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

      readings.push({
        label: "From Google",
        value: `${total} actions`,
        context: parts.join(", ") + " this period.",
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
    readings.push({
      label: "GBP Profile",
      value: `${complete}/5`,
      context: missing > 0 ? `${missing} field${missing !== 1 ? "s" : ""} incomplete.` : "All fields complete.",
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

  const { data: intelligenceData } = useQuery<{
    recentActions: string[];
    weeklyFinding: { headline: string; bullets: string[] } | null;
    watchline: string | null;
  }>({
    queryKey: ["home-intelligence", orgId],
    queryFn: () => apiGet({ path: "/user/home-intelligence" }),
    enabled: !!orgId,
    staleTime: 120_000,
  });

  // ── Derived State ──
  const action = actionData?.card || null;
  const greeting = buildGreeting(ctx || null);
  const readings = extractReadings(ctx || null, ranking, rankingRaw);
  const milestone = milestoneData?.card || null;

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

  // Market intelligence for below-fold
  const checkupForMarket = ctx?.org?.checkup_data;
  const marketComp = checkupForMarket?.topCompetitor;
  const marketClientReviews = checkupForMarket?.place?.reviewCount || checkupForMarket?.reviewCount || 0;
  const marketCompReviews = marketComp?.reviewCount || 0;
  const marketGap = marketCompReviews - marketClientReviews;
  const marketCity = checkupForMarket?.market?.city;
  const marketTotalComp = checkupForMarket?.market?.totalCompetitors;
  const marketRank = checkupForMarket?.market?.rank;

  return (
    <div className="min-h-screen bg-[#F8F6F2]">
      <div className="max-w-[1100px] mx-auto px-6 sm:px-10 py-10 sm:py-14">

        {/* ═══ ABOVE THE FOLD ═══ */}

        {/* ── 1. Greeting (ambient, light) ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <h1 className="text-4xl sm:text-5xl font-light text-[#1A1D23] tracking-tight leading-tight">{greeting}</h1>
        </motion.div>

        {/* ── 2. Watchline ── */}
        {(intelligenceData?.watchline || action) && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="text-xl sm:text-2xl font-light text-[#1A1D23]/60 mb-8"
          >
            {intelligenceData?.watchline
              ? intelligenceData.watchline
              : action?.clear
                ? "Nothing moved against you this week. Alloro checked."
                : "Something changed in your market this week."}
          </motion.p>
        )}

        {/* ── 3. One Action Card (DOMINANT) ── */}
        {action && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-8"
          >
            <div className={`w-full px-8 py-8 sm:py-10 ${
              action.clear
                ? "bg-[#F8F6F2] border-l-4 border-emerald-500"
                : "bg-[#212D40] rounded-lg"
            }`}>
              <p className={`text-xs font-semibold uppercase tracking-widest mb-4 ${
                action.clear ? "text-emerald-600" : "text-[#D56753]"
              }`}>
                YOUR NEXT MOVE
              </p>
              <p className={`text-2xl sm:text-3xl font-medium leading-snug tracking-tight ${
                action.clear ? "text-[#1A1D23]" : "text-white"
              }`}>
                {action.headline}
              </p>
              {action.body && (
                <p className={`mt-3 text-base leading-relaxed ${
                  action.clear ? "text-[#1A1D23]/50" : "text-white/50"
                }`}>
                  {action.body}
                </p>
              )}
              {action.action_text && action.action_url && (
                <button
                  onClick={() => navigate(action.action_url!)}
                  className="mt-6 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold bg-[#D56753] text-white hover:brightness-110 active:scale-[0.98] transition-all"
                >
                  {action.action_text}
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* ── 3. Status Strip (compact horizontal, above the fold) ── */}
        {statusItems.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="mb-10"
          >
            <div className={`grid gap-0 ${statusItems.length >= 4 ? "grid-cols-2 sm:grid-cols-4" : statusItems.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
              {statusItems.map((item, i) => {
                const dotColor = item.status === "healthy" ? "bg-emerald-500" : item.status === "attention" ? "bg-amber-400" : "bg-red-500";
                return (
                  <div key={item.label} className={`py-5 px-5 ${i > 0 ? "sm:border-l sm:border-[#1A1D23]/5" : ""}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                      <span className="text-xs text-gray-400 font-semibold uppercase tracking-widest">{item.label}</span>
                    </div>
                    <p className="text-2xl sm:text-[28px] font-semibold text-[#1A1D23] leading-none tracking-tight">{item.value}</p>
                    <p className="text-sm text-gray-500 mt-1.5 leading-snug">{item.context}</p>
                  </div>
                );
              })}
            </div>
          </motion.div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 mb-10">
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

        {/* ═══ BELOW THE FOLD -- Intelligence Sections (no boxes) ═══ */}

        {/* ── What Alloro Found ── */}
        {intelligenceData?.weeklyFinding && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mb-10 pl-4 border-l-2 border-[#212D40]"
          >
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest mb-3">WHAT ALLORO FOUND</p>
            <p className="text-xl font-semibold text-[#1A1D23] leading-snug">{intelligenceData.weeklyFinding.headline}</p>
            {intelligenceData.weeklyFinding.bullets.length > 0 && (
              <div className="mt-3 space-y-2">
                {intelligenceData.weeklyFinding.bullets.map((bullet, i) => (
                  <p key={i} className="text-[15px] text-gray-700 leading-relaxed">{bullet}</p>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ── Your Market This Week ── */}
        {marketComp?.name && marketClientReviews > 0 && (
          <div className="mb-10 pl-4 border-l-2 border-[#D56753]/30">
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest mb-3">YOUR MARKET THIS WEEK</p>
            {marketRank && marketTotalComp && marketCity && (
              <p className="text-[15px] text-gray-700">
                You appear #{marketRank} of {marketTotalComp} practices tracked in {marketCity}.
              </p>
            )}
            {marketGap > 0 && (
              <p className="text-lg font-semibold text-[#1A1D23] mt-2">
                The gap: {marketComp.name} has {marketCompReviews} reviews. You have {marketClientReviews}.
              </p>
            )}
            {marketGap <= 0 && (
              <p className="text-[15px] text-gray-700 mt-1">
                You lead {marketComp.name} by {Math.abs(marketGap)} reviews. Consistent reviews keep you ahead.
              </p>
            )}
            <p className="text-sm text-gray-400 mt-2">
              Alloro is watching this market. You will know if anything changes.
            </p>
          </div>
        )}

        {/* ── What Alloro Did ── */}
        {intelligenceData?.recentActions && intelligenceData.recentActions.length > 0 && (
          <div className="mb-10 pl-4 border-l-2 border-[#1A1D23]/10">
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest mb-3">WHAT ALLORO DID</p>
            <div className="space-y-2">
              {intelligenceData.recentActions.map((act, i) => (
                <p key={i} className="text-[15px] text-gray-700">{act}</p>
              ))}
            </div>
          </div>
        )}

        {/* ═══ SECONDARY CONTENT ═══ */}
        <div className="space-y-6 mt-4">

        {orgId && (
          <NotificationWidget
            organizationId={orgId}
            locationId={selectedLocation?.id || null}
          />
        )}

        {ctx?.has_referral_data && (
          <div className="pl-4 border-l-2 border-[#1A1D23]/10 py-2">
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Your Business Data</p>
            <p className="text-sm text-gray-500">
              {ctx?.referral_stats?.referrals_converted
                ? `${ctx.referral_stats.referrals_converted} referral${ctx.referral_stats.referrals_converted !== 1 ? "s" : ""} converted`
                : "Referral data uploaded"}
              {" -- "}
              <button onClick={() => navigate("/compare")} className="text-[#1A1D23] font-semibold hover:underline">
                See details on Get Found
              </button>
            </p>
          </div>
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
    </div>
  );
}
