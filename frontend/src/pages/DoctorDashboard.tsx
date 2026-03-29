/**
 * Doctor Dashboard — Client-Facing Intelligence Layer
 *
 * UX Rules enforced:
 * - Every card has ONE job.
 * - Every number has a label.
 * - Every action has a specific outcome.
 * - Empty states are never dead ends.
 * - Mobile first.
 *
 * A front desk employee should know what to do in under 10 seconds.
 */

import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Copy,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Globe,
  Share2,
  Flame,
  Shield,
  Star,
  MapPin,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLocationContext } from "@/contexts/locationContext";
import { apiGet, apiPatch } from "@/api/index";
import agents from "@/api/agents";
import ReviewRequestCard from "@/components/dashboard/ReviewRequestCard";
import OneActionCard from "@/components/dashboard/OneActionCard";
import CSAgentChat from "@/components/dashboard/CSAgentChat";
import TTFVSensor from "@/components/dashboard/TTFVSensor";
import BillingPromptBar from "@/components/dashboard/BillingPromptBar";
import PatientPathBreadcrumb from "@/components/dashboard/PatientPathBreadcrumb";
import CompetitorDrawer from "@/components/dashboard/CompetitorDrawer";
import GBPConnectCard from "@/components/dashboard/GBPConnectCard";
import OnboardingChecklist from "@/components/dashboard/OnboardingChecklist";
import StreakBadge from "@/components/dashboard/StreakBadge";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";
import { getPriorityItem } from "@/hooks/useLocalStorage";

// ─── Types ──────────────────────────────────────────────────────────

interface RankingData {
  rankPosition: number | null;
  totalCompetitors: number | null;
  rankScore: number | null;
  specialty: string | null;
  location: string | null;
  placeId?: string | null;
  topCompetitor?: {
    name: string;
    reviewCount: number;
    rating: number;
  } | null;
  clientReviews?: number | null;
  previousPosition?: number | null;
}

interface ProoflineFinding {
  type: string;
  title: string;
  detail: string;
}

interface WebsiteInfo {
  generated_hostname: string;
  status: string;
  last_updated?: string;
  liveUrl?: string;
}

// ─── Greeting ───────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// ─── Narrative Greeting (WO-35) ─────────────────────────────────────

type StreakInfo = { type: string; count: number; label: string } | null;
type WinInfo = { headline: string; detail: string | null; daysAgo: number } | null;

function narrativeGreeting(streak: StreakInfo, win: WinInfo, hasRanking: boolean): string {
  if (win && win.daysAgo <= 3) return "It worked.";
  if (streak && streak.count >= 12) return `Week ${streak.count}.`;
  if (streak && streak.count >= 4) return `Week ${streak.count} of watching your market.`;
  if (!hasRanking) return "We already found something.";
  return `${getGreeting()}.`;
}

function narrativeSubhead(streak: StreakInfo, win: WinInfo, practiceName: string): string {
  if (win && win.daysAgo <= 3 && win.detail) return win.detail;
  if (streak && streak.count >= 12) return `${streak.count} weeks of ${streak.label}. Here's what moved.`;
  if (streak && streak.count >= 4) return `Here's what changed for ${practiceName}.`;
  return `What Alloro found for ${practiceName}.`;
}

// ─── Score Helpers ──────────────────────────────────────────────────

function scoreColor(score: number | null): string {
  if (!score) return "text-gray-400";
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-[#D56753]";
}

function scoreBg(score: number | null): string {
  if (!score) return "bg-gray-100";
  if (score >= 80) return "bg-emerald-50";
  if (score >= 60) return "bg-amber-50";
  return "bg-[#D56753]/5";
}

// ═══════════════════════════════════════════════════════════════════
// POSITION CARD — One job: show where you rank
// ═══════════════════════════════════════════════════════════════════

function PositionCard({ ranking, subScores }: { ranking: RankingData | null; subScores?: { localVisibility: number; onlinePresence: number; reviewHealth: number } | null }) {
  if (!ranking || !ranking.rankPosition) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-gray-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-[#212D40]">Market Position</p>
            <p className="text-xs text-gray-400">Scan scheduled</p>
          </div>
        </div>
        <p className="text-sm text-gray-500">
          Your first market scan is scheduled. Check back tomorrow to see where you rank.
        </p>
      </div>
    );
  }

  const delta =
    ranking.previousPosition && ranking.rankPosition
      ? ranking.previousPosition - ranking.rankPosition
      : null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex items-start justify-between mb-1">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
          Market Position
        </p>
        {delta !== null && delta !== 0 && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
              delta > 0
                ? "bg-emerald-50 text-emerald-700"
                : delta <= -2
                  ? "bg-amber-50 text-amber-700"
                  : "bg-gray-100 text-gray-600"
            }`}
          >
            {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {delta > 0 ? "+" : ""}{delta} position{Math.abs(delta) !== 1 ? "s" : ""} since last scan
          </span>
        )}
      </div>

      <div className="mt-2">
        <span className="text-5xl font-black text-[#212D40]">
          #{ranking.rankPosition}
        </span>
        <span className="text-lg text-gray-400 ml-2">
          of {ranking.totalCompetitors}
        </span>
      </div>

      <p className="text-sm text-gray-500 mt-2">
        {ranking.totalCompetitors} {ranking.specialty || "competitor"}s in {ranking.location || "your market"}
      </p>

      {ranking.rankScore != null && (
        <div className="mt-4">
          <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${scoreBg(ranking.rankScore)} ${scoreColor(ranking.rankScore)}`}>
            Score: {ranking.rankScore}/100
          </span>
        </div>
      )}

      {/* Sub-score breakdown from checkup data */}
      {subScores && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-2.5">
          {[
            { label: "Local Visibility", score: subScores.localVisibility, max: 40 },
            { label: "Online Presence", score: subScores.onlinePresence, max: 40 },
            { label: "Review Health", score: subScores.reviewHealth, max: 20 },
          ].map((s) => {
            const pct = Math.round((s.score / s.max) * 100);
            return (
              <div key={s.label}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[11px] font-medium text-gray-500">{s.label}</span>
                  <span className="text-[11px] font-semibold text-gray-700">{s.score}/{s.max}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-[#D56753]"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// COMPETITOR GAP — One job: name who's beating you and by how much
// ═══════════════════════════════════════════════════════════════════

function CompetitorGap({ ranking, onCompetitorClick }: { ranking: RankingData | null; onCompetitorClick?: (comp: { name: string; rating: number; reviewCount: number }) => void }) {
  if (!ranking?.topCompetitor) return null;

  const comp = ranking.topCompetitor;
  const reviewGap =
    comp.reviewCount && ranking.clientReviews
      ? comp.reviewCount - ranking.clientReviews
      : null;

  return (
    <button
      type="button"
      onClick={() => onCompetitorClick?.({ name: comp.name, rating: comp.rating, reviewCount: comp.reviewCount })}
      className="w-full text-left rounded-2xl px-5 py-4 hover:shadow-md transition-shadow"
      style={{ backgroundColor: "rgba(213, 103, 83, 0.05)" }}
    >
      <p className="text-xs font-bold uppercase tracking-wider text-[#D56753] mb-2">
        Your Top Competitor
      </p>
      <p className="text-base font-semibold text-[#212D40] leading-relaxed">
        <span className="font-bold">{comp.name || "your top competitor"}</span>{" "}
        {ranking.rankPosition === 1 ? "is closest to your position" : "holds position #1"}
        {comp.rating ? ` with a ${comp.rating}-star rating` : ""}
        {reviewGap != null && reviewGap > 0 ? ` and ${reviewGap} more review${reviewGap !== 1 ? "s" : ""} than you` : ""}.
      </p>
      {reviewGap != null && reviewGap > 0 && reviewGap <= 10 && (
        <p className="text-xs text-[#D56753] font-medium mt-2">
          {reviewGap} review{reviewGap !== 1 ? "s" : ""} to close the gap. That's {Math.ceil(reviewGap / 3)} weeks at 3 per week.
        </p>
      )}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CHECKUP INTELLIGENCE — Day 1: turn checkup data into intelligence
// Biological-economic lens: need threatened + economic consequence
// ═══════════════════════════════════════════════════════════════════

// TODO: type this properly
function buildCheckupIntelligence(ctx: any): string[] {
  if (!ctx?.data) return [];
  const insights: string[] = [];
  const { market, topCompetitor, score } = ctx.data;

  if (topCompetitor?.rating && market?.avgRating && market.avgRating > 4.5) {
    insights.push(
      `The average rating in your market is ${market.avgRating.toFixed(1)} stars. Practices below that lose visibility in Google's local pack.`
    );
  }

  if (topCompetitor?.reviewCount && market?.avgReviews) {
    const gap = topCompetitor.reviewCount - (market.avgReviews || 0);
    if (gap > 20) {
      insights.push(
        `${topCompetitor.name} has ${topCompetitor.reviewCount} reviews, ${gap} more than the market average. Each review increases local search ranking and client trust.`
      );
    }
    if (topCompetitor.reviewCount > 50) {
      const weeksToClose = Math.ceil(topCompetitor.reviewCount / 3);
      insights.push(
        `At 3 reviews per week, it would take ${weeksToClose} weeks to match ${topCompetitor.name}. Starting now changes your trajectory by Q3.`
      );
    }
  }

  if (market?.totalCompetitors && market.rank) {
    if (market.rank > Math.ceil(market.totalCompetitors / 2)) {
      insights.push(
        `You rank #${market.rank} of ${market.totalCompetitors} in ${market.city || "your market"}. The top 3 capture over 70% of new client searches.`
      );
    } else if (market.rank <= 3) {
      insights.push(
        `You're #${market.rank} of ${market.totalCompetitors} in ${market.city || "your market"}. Holding a top-3 position means you appear in Google's local pack for most searches.`
      );
    }
  }

  if (score?.visibility != null && score.visibility < 50) {
    insights.push(
      `Your online visibility score is ${score.visibility}/100. Potential clients searching for your specialty may find a competitor first.`
    );
  }

  return insights.slice(0, 3);
}

// ═══════════════════════════════════════════════════════════════════
// PROOFLINE FINDINGS — One job: show what the agents discovered
// Falls back to checkup intelligence on day 1
// ═══════════════════════════════════════════════════════════════════

function ProoflineFindings({ findings, checkupCtx }: { findings: ProoflineFinding[]; checkupCtx?: any }) {
  const checkupInsights = findings.length === 0 ? buildCheckupIntelligence(checkupCtx) : [];

  if (findings.length === 0 && checkupInsights.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
            <Star className="w-5 h-5 text-gray-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-[#212D40]">Agent Findings</p>
            <p className="text-xs text-gray-400">Scan scheduled</p>
          </div>
        </div>
        <p className="text-sm text-gray-500">
          Alloro agents are analyzing your competitors. First findings appear Monday morning after the Sunday scan.
        </p>
      </div>
    );
  }

  if (findings.length === 0 && checkupInsights.length > 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <p className="text-xs font-bold uppercase tracking-wider text-[#D56753] mb-4">
          What We Found
        </p>
        <div className="space-y-3">
          {checkupInsights.map((insight, i) => (
            <div key={i} className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-lg bg-[#D56753]/10 text-[#D56753] flex items-center justify-center text-xs font-bold mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-gray-700 leading-relaxed">{insight}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-4">
          From your checkup scan. Live agent findings replace this after the first scheduled analysis.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">
        This Week's Findings
      </p>
      <div className="space-y-3">
        {findings.slice(0, 3).map((f, i) => (
          <div key={i} className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-lg bg-[#D56753]/10 text-[#D56753] flex items-center justify-center text-xs font-bold mt-0.5">
              {i + 1}
            </span>
            <p className="text-sm text-gray-700 leading-relaxed">{f.detail || f.title}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// WEBSITE CARD — One job: link to your live site
// ═══════════════════════════════════════════════════════════════════

function WebsiteCard({ website }: { website: WebsiteInfo | null }) {
  if (!website) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
            <Globe className="w-5 h-5 text-gray-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-[#212D40]">Your Website</p>
            <p className="text-xs text-gray-400">In progress</p>
          </div>
        </div>
        <p className="text-sm text-gray-500">
          Your PatientPath website is being built. You'll get a notification when it's live.
        </p>
      </div>
    );
  }

  const siteUrl = `https://${website.generated_hostname}.sites.getalloro.com`;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <Globe className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-[#212D40]">Your Website</p>
            <p className="text-xs text-gray-500">{website.generated_hostname}</p>
          </div>
        </div>
        <a
          href={siteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-lg bg-[#212D40] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#212D40]/90 transition-colors"
        >
          View site
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// REFERRAL CARD — One job: let you share your referral link
// ═══════════════════════════════════════════════════════════════════

function ReferralCard({ referralCode }: { referralCode: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!referralCode) return null;

  const link = `${window.location.origin}/checkup?ref=${referralCode}`;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-[#212D40]/5 flex items-center justify-center">
          <Share2 className="w-5 h-5 text-[#212D40]" />
        </div>
        <div>
          <p className="text-sm font-bold text-[#212D40]">Refer a Colleague</p>
          <p className="text-xs text-gray-500">You both get one month free</p>
        </div>
      </div>
      <div className="flex gap-2">
        <input
          readOnly
          value={link}
          className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-500 truncate"
        />
        <button
          onClick={() => {
            navigator.clipboard.writeText(link).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-xs font-semibold transition-all ${
            copied
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-[#212D40] text-white hover:bg-[#212D40]/90"
          }`}
        >
          <Copy className="h-3 w-3" />
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// GROWTH MODE CARDS
// ═══════════════════════════════════════════════════════════════════

function GapToNext({ ranking }: { ranking: RankingData | null }) {
  if (!ranking?.rankPosition || ranking.rankPosition <= 1) {
    return (
      <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-6">
        <p className="text-lg font-bold text-emerald-800">You're #1</p>
        <p className="text-sm text-emerald-600 mt-1">Every review keeps you there. Don't stop.</p>
      </div>
    );
  }

  const comp = ranking.topCompetitor;
  const reviewGap = comp?.reviewCount && ranking.clientReviews
    ? comp.reviewCount - ranking.clientReviews
    : null;

  return (
    <div className="rounded-2xl border-2 border-[#D56753]/20 bg-white p-6">
      <p className="text-xs font-bold uppercase tracking-wider text-[#D56753] mb-3">
        What It Takes to Reach Position #{ranking.rankPosition - 1}
      </p>
      {comp && (
        <p className="text-base font-semibold text-[#212D40] mb-4">
          {comp.name || "Your top competitor"} is one spot ahead.
        </p>
      )}
      {reviewGap != null && reviewGap > 0 && (
        <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-[#212D40]">Reviews needed</p>
            <p className="text-xs text-gray-500">They have {comp?.reviewCount}. You have {ranking.clientReviews}.</p>
          </div>
          <span className="text-lg font-black text-[#D56753]">{reviewGap}</span>
        </div>
      )}
    </div>
  );
}

function CompetitorActivityFeed({ ranking }: { ranking: RankingData | null }) {
  if (!ranking?.topCompetitor) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
            <Users className="w-5 h-5 text-gray-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-[#212D40]">Competitor Activity</p>
            <p className="text-xs text-gray-400">Market data appears after your first scan.</p>
          </div>
        </div>
      </div>
    );
  }

  const comp = ranking.topCompetitor;
  const activities: { text: string; dot: string }[] = [];
  if (comp.reviewCount > 0) activities.push({ text: `${comp.name || "Your top competitor"} has ${comp.reviewCount} reviews at ${comp.rating} stars`, dot: "bg-amber-400" });
  if (ranking.totalCompetitors && ranking.totalCompetitors > 5) activities.push({ text: `${ranking.totalCompetitors} competitors in ${ranking.location || "your market"}`, dot: "bg-blue-400" });
  if (ranking.rankPosition && ranking.rankPosition > 3) activities.push({ text: "Top 3 positions get 70% of new client search clicks", dot: "bg-gray-300" });

  if (activities.length === 0) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">Competitor Activity</p>
      <div className="space-y-3">
        {activities.map((a, i) => (
          <div key={i} className="flex items-start gap-3 text-sm">
            <span className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${a.dot}`} />
            <p className="text-gray-600">{a.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function GrowthPositionTrack({ ranking }: { ranking: RankingData | null }) {
  if (!ranking?.rankPosition || !ranking.totalCompetitors) return null;

  const maxPos = Math.min(ranking.totalCompetitors, 10);
  const positions = Array.from({ length: maxPos }, (_, i) => i + 1);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">Your Position</p>
      <div className="flex items-center gap-1">
        {positions.map((pos) => (
          <div key={pos} className="flex-1 flex flex-col items-center gap-1.5">
            <div className={`w-full h-2.5 rounded-full ${pos === ranking.rankPosition ? "bg-[#D56753]" : pos < ranking.rankPosition! ? "bg-[#212D40]/15" : "bg-gray-100"}`} />
            <span className={`text-[10px] font-bold ${pos === ranking.rankPosition ? "text-[#D56753]" : "text-gray-300"}`}>{pos}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
        <span>#1, Top of market</span>
        <span>#{maxPos}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MODE TOGGLE
// ═══════════════════════════════════════════════════════════════════

function ModeToggle({ mode, onChange }: { mode: "standard" | "growth"; onChange: (m: "standard" | "growth") => void }) {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1 shrink-0">
      <button
        onClick={() => onChange("standard")}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${mode === "standard" ? "bg-white text-[#212D40] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
      >
        <Shield className="h-3.5 w-3.5" />
        Overview
      </button>
      <button
        onClick={() => onChange("growth")}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${mode === "growth" ? "bg-[#D56753] text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
      >
        <Flame className="h-3.5 w-3.5" />
        Growth
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function DoctorDashboard() {
  const { userProfile, billingStatus, hasGoogleConnection } = useAuth();
  const { selectedLocation } = useLocationContext();

  const orgId = userProfile?.organizationId || null;
  const locationId = selectedLocation?.id ?? null;
  const practiceName = selectedLocation?.name || userProfile?.practiceName || "Your Practice";
  const locationName = selectedLocation?.name || null;

  const userRole = getPriorityItem("user_role") as string | null;
  const isOwnerOrManager = userRole === "admin" || userRole === "manager";
  const canSendReviews = userRole !== "viewer";

  // GBP instant value reveal (WO-42)
  const [searchParams, setSearchParams] = useSearchParams();
  const [showGbpReveal, setShowGbpReveal] = useState(false);
  useEffect(() => {
    if (searchParams.get("gbp") === "connected") {
      setShowGbpReveal(true);
      searchParams.delete("gbp");
      setSearchParams(searchParams, { replace: true });
      setTimeout(() => setShowGbpReveal(false), 12000);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Checkup context -- pre-populates dashboard on first login before ranking scan
  const { data: dashCtx } = useQuery({
    queryKey: ["dashboard-context"],
    queryFn: async () => {
      const res = await apiGet({ path: "/user/dashboard-context" });
      return res?.success ? res : null;
    },
    staleTime: 30 * 60_000,
  });
  const checkupCtx = dashCtx?.checkup_context ?? null;
  const week1WinData = dashCtx?.week1_win ?? null;
  const orgCreatedAt = dashCtx?.org_created_at ?? null;
  const hasReferralData = dashCtx?.has_referral_data ?? false;
  const accountAgeDays = orgCreatedAt
    ? Math.floor((Date.now() - new Date(orgCreatedAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const { data: rankingData, isLoading: isRankingLoading, isError: isRankingError } = useQuery({
    queryKey: ["client-ranking", orgId, locationId],
    queryFn: async (): Promise<RankingData | null> => {
      if (!orgId) return null;
      const token = localStorage.getItem("auth_token");
      const res = await fetch(
        `/api/practice-ranking/latest?googleAccountId=${orgId}${locationId ? `&locationId=${locationId}` : ""}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) return null;
      const json = await res.json();
      if (!json.success || !json.rankings?.length) return null;
      const latest = json.rankings[0];
      const raw = latest.rawData ?? latest.raw_data ?? null;
      const competitors = raw?.competitors ?? [];
      const topComp = competitors.length > 0 ? competitors[0] : null;
      const prev = latest.previousAnalysis ?? latest.previous_analysis ?? null;
      return {
        rankPosition: latest.rank_position ?? latest.rankPosition ?? null,
        totalCompetitors: latest.total_competitors ?? latest.totalCompetitors ?? null,
        rankScore: latest.rank_score ?? latest.rankScore ?? null,
        specialty: latest.specialty || null,
        location: latest.location || null,
        placeId: raw?.client_gbp?.placeId ?? latest.raw_data?.client_gbp?.placeId ?? latest.gbp_location_id ?? null,
        topCompetitor: topComp
          ? {
              name: topComp.name,
              reviewCount: topComp.totalReviews ?? topComp.reviewCount ?? 0,
              rating: topComp.averageRating ?? topComp.rating ?? 0,
            }
          : null,
        clientReviews: raw?.client_gbp?.totalReviewCount ?? null,
        previousPosition: prev?.rankPosition ?? prev?.rank_position ?? null,
      };
    },
    enabled: !!orgId,
    staleTime: 10 * 60_000,
  });

  const { data: agentData, isLoading: isAgentLoading } = useQuery({
    queryKey: ["client-agent-data", orgId, locationId],
    queryFn: () => agents.getLatestAgentData(orgId!, locationId),
    enabled: !!orgId,
    staleTime: 10 * 60_000,
  });

  const prooflineFindings: ProoflineFinding[] = (() => {
    if (!agentData?.success) return [];
    // Backend returns { success, agents: { proofline: { results: ... } } }
    const prooflineData = agentData.agents?.proofline;
    if (!prooflineData?.results) return [];
    const output = typeof prooflineData.results === "string" ? tryParse(prooflineData.results) : prooflineData.results;
    if (typeof output === "object" && output !== null) {
      const f = (output as any).findings || (output as any).items || [];
      if (Array.isArray(f)) return f.slice(0, 3);
    }
    return [];
  })();

  const { data: websiteData, isError: isWebsiteError } = useQuery({
    queryKey: ["client-website", orgId],
    queryFn: async (): Promise<WebsiteInfo | null> => {
      const res = await apiGet({ path: "/user/website" });
      if (!res?.success || !res?.website) return null;
      return res.website;
    },
    enabled: !!orgId,
    staleTime: 10 * 60_000,
  });

  // PatientPath build status for breadcrumb
  const { data: patientpathData } = useQuery({
    queryKey: ["patientpath-status", orgId],
    queryFn: async () => {
      const res = await apiGet({ path: "/user/patientpath" });
      return res?.success ? res : null;
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const { data: profileData, isError: isProfileError } = useQuery({
    queryKey: ["client-profile"],
    queryFn: async () => apiGet({ path: "/profile/get" }),
    staleTime: 10 * 60_000,
  });

  const isProfileUnavailable = isProfileError;
  const referralCode = profileData?.referral_code || profileData?.organization?.referral_code || null;

  // Setup progress — tracks checklist completion state
  const queryClient = useQueryClient();
  const { data: setupProgress, isLoading: isSetupLoading } = useQuery({
    queryKey: ["setup-progress"],
    queryFn: async () => {
      const res = await apiGet({ path: "/onboarding/setup-progress" });
      return res?.success ? res.progress : null;
    },
    staleTime: 5 * 60_000,
  });

  const markChecklistStep = useCallback(async (step: string) => {
    await apiPatch({
      path: "/onboarding/setup-progress",
      passedData: { [`checklist_${step}`]: true },
    }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["setup-progress"] });
  }, [queryClient]);

  // Milestone card (WO-51/52: Day 30, 60, 180 check-in)
  const { data: milestoneCard } = useQuery({
    queryKey: ["milestone-card", orgId],
    queryFn: async () => {
      const res = await apiGet({ path: "/user/milestone-card" });
      return res?.success ? res.card : null;
    },
    enabled: !!orgId,
    staleTime: 10 * 60_000,
  });

  // Streaks + Win (WO-33, WO-34)
  const { data: streaksAndWin } = useQuery({
    queryKey: ["user-streaks", orgId],
    queryFn: async () => {
      const res = await apiGet({ path: "/user/streaks" });
      return res?.success ? { streak: res.streak, win: res.win } : { streak: null, win: null };
    },
    enabled: !!orgId,
    staleTime: 10 * 60_000,
  });
  const streakData = streaksAndWin?.streak ?? null;
  const winData = streaksAndWin?.win ?? null;

  // One Action Card — backend intelligence engine
  const { data: oneActionResponse } = useQuery({
    queryKey: ["one-action-card", orgId],
    queryFn: async () => {
      const res = await apiGet({ path: "/user/one-action-card" });
      return res?.success ? res : null;
    },
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  });
  const oneActionData = oneActionResponse?.card ?? null;
  const driftGPData = oneActionResponse?.driftGP ?? null;
  const competitorVelocityData = oneActionResponse?.competitorVelocity ?? null;

  // Merge: use checkup context as fallback when live ranking hasn't run yet
  const effectiveRanking: RankingData | null = rankingData ?? (checkupCtx?.data ? {
    rankPosition: checkupCtx.data.market?.rank ?? null,
    totalCompetitors: checkupCtx.data.market?.totalCompetitors ?? null,
    rankScore: checkupCtx.score ?? null,
    specialty: null,
    location: checkupCtx.data.market?.city ?? null,
    topCompetitor: checkupCtx.data.topCompetitor ? {
      name: checkupCtx.data.topCompetitor.name || "",
      reviewCount: checkupCtx.data.topCompetitor.reviewCount || 0,
      rating: checkupCtx.data.topCompetitor.rating || 0,
    } : null,
    clientReviews: null,
    previousPosition: null,
  } : null);

  const [mode, setMode] = useState<"standard" | "growth">("standard");
  const [drawerCompetitor, setDrawerCompetitor] = useState<{ name: string; rating: number; reviewCount: number } | null>(null);

  // Initial loading gate: wait for the 3 most important queries before showing content.
  // This prevents the "popcorn" effect where cards pop in one by one.
  const isInitialLoading = isRankingLoading || isAgentLoading || isSetupLoading;
  const isLoading = isInitialLoading;

  return (
    <>
    {/* Billing prompt bar — top of dashboard, quiet, dismissable */}
    <BillingPromptBar
      orgId={orgId}
      score={effectiveRanking?.rankScore ?? null}
      finding={prooflineFindings[0]?.detail || null}
    />

    <div className="mx-auto max-w-2xl space-y-5 px-4 py-6 sm:py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-[#212D40] truncate">
            {mode === "growth"
              ? "Close the gap."
              : narrativeGreeting(streakData, winData, !!effectiveRanking)}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {mode === "growth"
              ? `What stands between ${practiceName} and the next position.`
              : narrativeSubhead(streakData, winData, practiceName)}
          </p>
          {locationName && (
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {locationName}
            </p>
          )}
        </div>
        <ModeToggle mode={mode} onChange={setMode} />
      </div>

      {/* GBP instant value reveal (WO-42) */}
      {showGbpReveal && (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5">
          <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-600 mb-2">
            Connected
          </p>
          <p className="text-sm font-bold text-[#212D40]">
            {effectiveRanking?.clientReviews != null && effectiveRanking.clientReviews > 0
              ? `${effectiveRanking.clientReviews} reviews`
              : null}
            {effectiveRanking?.clientReviews != null && effectiveRanking.clientReviews > 0 &&
              effectiveRanking?.topCompetitor?.rating
              ? ", "
              : null}
            {checkupCtx?.data?.place?.rating
              ? `${checkupCtx.data.place.rating} average`
              : null}
            {effectiveRanking?.rankPosition
              ? `. Ranked #${effectiveRanking.rankPosition} of ${effectiveRanking.totalCompetitors || "?"} in ${effectiveRanking.location || "your market"}.`
              : ". Live monitoring is on."}
          </p>
          <p className="text-xs text-emerald-600 mt-2">
            Rankings, reviews, and competitor activity are now tracked automatically.
          </p>
        </div>
      )}

      {/* Milestone check-in card (WO-51/52) */}
      {!isLoading && milestoneCard && (
        <div className="rounded-2xl border border-[#212D40]/15 bg-white p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-[#D56753] mb-3">
            Your first {milestoneCard.milestone} days.
          </p>
          {milestoneCard.sunday_fear && (
            <div className="mb-3">
              <p className="text-sm text-[#212D40]/70 leading-relaxed">
                When you started, you told us your biggest concern was:
                <span className="italic text-[#212D40] font-medium">
                  {" "}&ldquo;{milestoneCard.sunday_fear.length > 50 ? milestoneCard.sunday_fear.slice(0, 50) + "..." : milestoneCard.sunday_fear}&rdquo;
                </span>
              </p>
              {milestoneCard.sunday_fear_resolved && milestoneCard.sunday_fear_resolution && (
                <p className="text-sm text-emerald-700 font-medium mt-2">
                  {milestoneCard.sunday_fear_resolution}
                </p>
              )}
            </div>
          )}
          {milestoneCard.moved && (
            <p className="text-sm text-[#212D40] font-medium">
              The one thing that moved: {milestoneCard.moved}
            </p>
          )}
          {milestoneCard.gap && (
            <p className="text-sm text-[#212D40]/60 mt-1">
              The one thing that hasn't yet: {milestoneCard.gap}
            </p>
          )}
        </div>
      )}

      {/* Win celebration card (WO-34) -- Fitbit vibration moment */}
      {!isLoading && winData && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#D56753] to-[#c05544] p-6 text-white shadow-[0_8px_30px_rgba(213,103,83,0.3)]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-20 h-20 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
          <div className="relative">
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/60 mb-2">
              Win detected
            </p>
            <p className="text-base font-bold leading-snug">
              {winData.headline || "Alloro caught something. You acted. It worked."}
            </p>
            {winData.detail && (
              <p className="text-sm text-white/75 mt-2.5 leading-relaxed">{winData.detail}</p>
            )}
            {winData.daysAgo != null && winData.daysAgo <= 1 && (
              <p className="text-[10px] text-white/50 mt-3 uppercase tracking-wide">Just happened</p>
            )}
          </div>
        </div>
      )}

      {/* One Action Card — first visible element below greeting (WO-29) */}
      {!isLoading && (
        <OneActionCard
          serverCard={oneActionData}
          billingActive={billingStatus?.hasStripeSubscription !== false || billingStatus?.isAdminGranted === true}
          driftGP={driftGPData}
          rankingDrop={
            effectiveRanking?.previousPosition && effectiveRanking?.rankPosition &&
            effectiveRanking.rankPosition - effectiveRanking.previousPosition >= 2
              ? {
                  previousPosition: effectiveRanking.previousPosition,
                  currentPosition: effectiveRanking.rankPosition,
                  keyword: effectiveRanking.specialty || undefined,
                }
              : null
          }
          competitorVelocity={competitorVelocityData}
          gbpConnected={hasGoogleConnection}
          topCompetitorName={effectiveRanking?.topCompetitor?.name || "your top competitor"}
        />
      )}

      {/* Onboarding Checklist — below One Action Card */}
      {!isLoading && (
        <OnboardingChecklist
          checkupScore={effectiveRanking?.rankScore ?? null}
          gbpConnected={hasGoogleConnection}
          pmsUploaded={!!setupProgress?.checklist_pms || !!setupProgress?.step2_pms_uploaded}
          referralShared={!!setupProgress?.checklist_share}
          referralCode={referralCode}
          checkupRank={effectiveRanking?.rankPosition}
          checkupTotal={effectiveRanking?.totalCompetitors}
          checkupCity={effectiveRanking?.location}
          onStepComplete={markChecklistStep}
          onDismiss={() => {
            apiPatch({ path: "/onboarding/setup-progress", passedData: { checklist_dismissed: true } }).catch(() => {});
          }}
        />
      )}

      {/* Week 1 Win card (WO-48) */}
      {!isLoading && week1WinData && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Star className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#212D40]">{week1WinData.headline}</p>
              <p className="text-sm text-gray-600 leading-relaxed mt-1">{week1WinData.detail}</p>
            </div>
          </div>
        </div>
      )}

      {/* What Alloro did while you slept */}
      {!isLoading && effectiveRanking && (
        <p className="text-[11px] text-gray-400 text-center -mt-2">
          {accountAgeDays !== null && accountAgeDays < 7
            ? "Alloro is learning your market. First full report arrives Monday."
            : `47 agents watching your market. Last scan: ${new Date().toLocaleDateString("en-US", { weekday: "long" })}.`}
        </p>
      )}

      {isLoading && (
        <div className="space-y-4">
          <CardSkeleton height="7rem" />
          <CardSkeleton height="5rem" />
          <CardSkeleton height="8rem" />
        </div>
      )}

      {mode === "standard" ? (
        <>
          {/* ══ ABOVE THE FOLD — spec layer order ══ */}

          {/* 1. Practice Health Score ring */}
          {isRankingError && <p className="text-xs text-gray-400 italic">Data temporarily unavailable.</p>}
          <PositionCard ranking={effectiveRanking} subScores={checkupCtx?.data?.score ? { localVisibility: checkupCtx.data.score.localVisibility, onlinePresence: checkupCtx.data.score.onlinePresence, reviewHealth: checkupCtx.data.score.reviewHealth } : null} />

          {/* Streak badge (WO-33) */}
          {streakData && streakData.count >= 2 && (
            <StreakBadge type={streakData.type} count={streakData.count} label={streakData.label} />
          )}

          {/* 2. One sentence finding */}
          <CompetitorGap ranking={effectiveRanking} onCompetitorClick={setDrawerCompetitor} />

          {/* GBP Connect card — only show when a higher-priority OneActionCard rule is active.
              When OneActionCard itself shows the GBP rule, this would be a duplicate. */}
          {!hasGoogleConnection && (oneActionData || driftGPData || competitorVelocityData) && (
            <GBPConnectCard gbpConnected={hasGoogleConnection} orgId={orgId} />
          )}

          {/* PatientPath Research Brief reveal (WO-43) */}
          {checkupCtx?.research_findings && checkupCtx.research_findings.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-[#D56753] mb-3">
                Before we built your site, we studied your business.
              </p>
              <div className="space-y-2.5">
                {checkupCtx.research_findings.map((finding: string, i: number) => (
                  <p key={i} className="text-sm text-[#212D40]/80 leading-relaxed">
                    {finding}
                  </p>
                ))}
              </div>
              {websiteData?.liveUrl && (
                <a
                  href={websiteData.liveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#D56753] hover:underline"
                >
                  Preview my site
                </a>
              )}
            </div>
          )}

          {/* 4. PatientPath breadcrumb — quiet, lower */}
          {isWebsiteError && <p className="text-xs text-gray-400 italic">Data temporarily unavailable.</p>}
          {isOwnerOrManager && <WebsiteCard website={websiteData ?? null} />}

          {/* ══ BELOW THE FOLD ══ */}
          {isOwnerOrManager && <ProoflineFindings findings={prooflineFindings} checkupCtx={checkupCtx} />}
          {canSendReviews && <ReviewRequestCard placeId={effectiveRanking?.placeId ?? null} practiceName={practiceName} />}
          {isProfileUnavailable && <p className="text-xs text-gray-400 italic">Data temporarily unavailable.</p>}
          {isOwnerOrManager && <ReferralCard referralCode={referralCode} />}
        </>
      ) : (
        <>
          <GrowthPositionTrack ranking={effectiveRanking} />
          <GapToNext ranking={effectiveRanking} />
          <CompetitorActivityFeed ranking={effectiveRanking} />
          {canSendReviews && <ReviewRequestCard placeId={effectiveRanking?.placeId ?? null} practiceName={practiceName} />}
          {isOwnerOrManager && <ReferralCard referralCode={referralCode} />}
        </>
      )}

      {/* CS Agent — floating chat */}
      <CSAgentChat
        practiceName={practiceName}
        score={effectiveRanking?.rankScore ?? null}
        locationId={locationId}
        hasReferralData={hasReferralData}
      />

      {/* TTFV Sensor — bottom bar, 90s after first load */}
      <TTFVSensor orgId={orgId} onYes={() => { /* billing prompt auto-shows via ttfv-status check */ }} />

      {/* Competitor Detail Drawer */}
      {drawerCompetitor && (
        <CompetitorDrawer
          competitor={drawerCompetitor}
          clientReviews={effectiveRanking?.clientReviews || 0}
          clientVelocityPerWeek={null}
          onClose={() => setDrawerCompetitor(null)}
        />
      )}

      {/* PatientPath Breadcrumb — quiet lower-right card */}
      <PatientPathBreadcrumb
        status={
          websiteData ? "live"
          : (patientpathData?.status === "preview_ready" || patientpathData?.status === "building" || patientpathData?.status === "researching")
            ? (patientpathData.status === "researching" ? "building" : patientpathData.status)
            : null
        }
        previewUrl={patientpathData?.previewUrl || null}
        liveUrl={websiteData ? `https://${websiteData.generated_hostname}.sites.getalloro.com` : null}
        hostname={websiteData?.generated_hostname || null}
      />
    </div>
    </>
  );
}

function tryParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}
