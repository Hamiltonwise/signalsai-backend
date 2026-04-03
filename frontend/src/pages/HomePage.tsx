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
import { ChevronRight, MessageCircle } from "lucide-react";
import { apiGet } from "@/api/index";
import { useAuth } from "@/hooks/useAuth";
import { useLocationContext } from "@/contexts/locationContext";
import { getPriorityItem } from "@/hooks/useLocalStorage";
import OneActionCard from "@/components/dashboard/OneActionCard";
import OnboardingChecklist from "@/components/dashboard/OnboardingChecklist";
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
    checkup_data?: any;
    subscription_status?: string;
    trial_end_at?: string | null;
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
  ranking: RankingData | null,
): string {
  const firstName = ctx?.user?.first_name || null;
  const archetype = ctx?.org?.owner_archetype || null;
  const confidence = ctx?.org?.archetype_confidence || 0;
  const score = ctx?.org?.checkup_score || null;
  const position = ranking?.rankPosition || null;
  const city = ranking?.location?.split(",")[0]?.trim() || null;
  const competitor = ranking?.topCompetitor?.name || null;
  const prevPosition = ranking?.previousPosition || null;
  const checkupData = ctx?.org?.checkup_data;
  const checkupCompetitor = typeof checkupData === "object"
    ? checkupData?.topCompetitor?.name
    : null;

  const name = firstName
    ? `${getTimeGreeting()}, ${firstName}.`
    : `${getTimeGreeting()}.`;

  // Level 1: Full data (archetype + ranking + score)
  if (position && city && confidence >= 0.5 && archetype) {
    const positionChange = prevPosition && prevPosition !== position
      ? position < prevPosition ? "Moving up." : "Slipped a spot."
      : "Holding steady.";

    return `${name} You're #${position} in ${city}. ${positionChange}`;
  }

  // Level 2: Ranking + score, no archetype
  if (position && city) {
    return `${name} Your business is #${position} in ${city}. Score: ${score || "calculating"}.`;
  }

  // Level 3: Score only (day 1, checkup done)
  if (score) {
    const compLine = checkupCompetitor || competitor
      ? ` ${checkupCompetitor || competitor} is your closest competitor.`
      : "";
    return `${name} Your Business Clarity Score is ${score}.${compLine} First Monday email arrives soon.`;
  }

  // Level 4: Nothing yet
  return `${name} Welcome. Alloro is scanning your market. We will have your first finding ready soon.`;
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
  const { userProfile, billingStatus, hasGoogleConnection } = useAuth();
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
        `/api/practice-ranking/latest?googleAccountId=${userProfile?.googleAccountId || ""}${locParam}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (!res.ok) return null;
      const data = await res.json();
      return data?.results?.[0] || null;
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
  const score = ctx?.org?.checkup_score || null;
  const position = ranking?.rankPosition || null;
  const city = ranking?.location?.split(",")[0]?.trim() || null;
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
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="max-w-[640px] mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">

        {/* ── Greeting ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <p className="text-lg sm:text-xl font-semibold text-[#1A1D23] leading-relaxed">
            {greeting}
          </p>
        </motion.div>

        {/* ── One Action Card ── */}
        {action && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <div className={`rounded-2xl p-6 ${
              action.clear
                ? "bg-emerald-50 border border-emerald-100"
                : action.priority_level <= 2
                  ? "bg-white border border-orange-200 shadow-sm"
                  : "bg-white border border-gray-100 shadow-sm"
            }`}>
              <p className={`text-base font-semibold ${
                action.clear ? "text-emerald-800" : "text-[#1A1D23]"
              }`}>
                {action.headline}
              </p>
              <p className={`mt-2 text-sm leading-relaxed ${
                action.clear ? "text-emerald-700" : "text-gray-600"
              }`}>
                {action.body}
              </p>
              {action.action_text && action.action_url && (
                <button
                  onClick={() => navigate(action.action_url!)}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-alloro-orange hover:text-alloro-navy transition-colors"
                >
                  {action.action_text}
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* ── Position + Score (tappable to Compare page) ── */}
        {(position || score) && (
          <motion.button
            onClick={() => navigate("/compare")}
            className="w-full text-left rounded-2xl bg-white border border-gray-100 p-5 shadow-sm hover:border-alloro-orange/30 hover:shadow-md transition-all"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                {position && city && (
                  <p className="text-sm font-semibold text-[#1A1D23]">
                    #{position} in {city}
                  </p>
                )}
                {score && (
                  <p className="text-sm text-gray-500">
                    Business Clarity Score: {score}/100
                  </p>
                )}
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300" />
            </div>
          </motion.button>
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
              streakType={streak.type}
              streakCount={streak.count}
              streakLabel={streak.label}
            />
          </motion.div>
        )}

        {/* ── Temporary Prompts (max 2) ── */}
        {visiblePrompts.has("onboarding") && (
          <OnboardingChecklist
            setupProgress={setupProgress}
            orgId={orgId}
          />
        )}

        {visiblePrompts.has("billing") && (
          <CardCapture />
        )}

        {/* ── Community Proof ── */}
        <motion.p
          className="text-center text-xs text-gray-400 pt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          Business owners across the country checked theirs this morning.
        </motion.p>

      </div>

      {/* ── Billing Prompt Bar (global, system-level) ── */}
      <BillingPromptBar />
    </div>
  );
}
