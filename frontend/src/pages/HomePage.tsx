/**
 * Home -- "Am I okay?" + "What should I do?"
 *
 * The 3-second experience. Open. See. Know. Close.
 *
 * Four-level graceful degradation:
 * 1. Full data: "Dr. Pawlak, you're #3 in Winter Garden. Steady. Nothing needs you tonight."
 * 2. Ranking + score, no archetype: "Your business is #3 in Winter Garden. Score: 72."
 * 3. Score only, day 1: "Your Business Clarity Score is 52. Surf City Endo is your closest competitor."
 * 4. Nothing yet: "Welcome. Alloro is scanning your market."
 *
 * Rules:
 * - Max 2 temporary prompts visible at once
 * - Surprise moments appear when earned, vanish when seen
 * - Monday Preview: cut. The email IS the surprise.
 * - 5 core elements: greeting, action card, position, score, chat bubble
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

        {/* ── Greeting + Score Hero ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-10"
        >
          <p className="text-base text-gray-500 mb-6">{greeting}</p>

          {/* Score: the centerpiece. 40% of viewport per Apple Principle. */}
          {score != null && (
            <div className="mb-4">
              <p className="text-7xl sm:text-8xl font-semibold text-[#1A1D23] tracking-tight leading-none">
                {score}
              </p>
              <p className="text-sm text-gray-400 mt-2">Business Clarity Score</p>
            </div>
          )}

          {/* Position removed: Places API position doesn't match what
              customers see on Google Search. Showing an inaccurate rank
              destroys trust instantly. The score and action card use
              verifiable data (reviews, GBP completeness, photos). */}
        </motion.div>

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
