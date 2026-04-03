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

import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
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
import {
  cardVariants,
  fadeInUp,
  scaleInFade,
  warmCardVariants,
  warmStagger,
} from "@/lib/animations";
import { useAuth } from "@/hooks/useAuth";
import { useLocationContext } from "@/contexts/locationContext";
import { apiGet, apiPatch, apiDelete } from "@/api/index";
import agents from "@/api/agents";
import ReviewRequestCard from "@/components/dashboard/ReviewRequestCard";
import OneActionCard from "@/components/dashboard/OneActionCard";
import CardCapture from "@/components/dashboard/CardCapture";
import AlloroActivityCard from "@/components/dashboard/AlloroActivityCard";
import MondayPreview from "@/components/dashboard/MondayPreview";
// ReferralCard defined locally (line ~569) with referralCode prop
import BillingPromptBar from "@/components/dashboard/BillingPromptBar";
import { isConferenceMode } from "./checkup/conferenceFallback";
import CompetitorDrawer from "@/components/dashboard/CompetitorDrawer";
import ScoreImprovementPlan from "@/components/dashboard/ScoreImprovementPlan";
import ScoreSimulator from "@/components/dashboard/ScoreSimulator";
// ScoreHistory moved to sub-page, removed from main dashboard to reduce clutter
import CompetitorComparison from "@/components/dashboard/CompetitorComparison";
import AddCompetitor from "@/components/dashboard/AddCompetitor";
import GBPConnectCard from "@/components/dashboard/GBPConnectCard";
import OnboardingChecklist from "@/components/dashboard/OnboardingChecklist";
import StreakBadge from "@/components/dashboard/StreakBadge";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import { fireConfetti } from "@/lib/confetti";
import { getPriorityItem } from "@/hooks/useLocalStorage";
import { TailorText } from "@/components/TailorText";

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

// ─── Tone Evolution (Guidara "Earning Informality") ────────────────

type ToneProfile = {
  formality: "formal" | "warm" | "familiar";
  useFirstName: boolean;
  canUseHumor: boolean;
  greetingStyle: "professional" | "personal" | "casual";
};

function getToneProfile(orgCreatedAt: string | Date | null | undefined): ToneProfile {
  if (!orgCreatedAt) {
    return { formality: "formal", useFirstName: false, canUseHumor: false, greetingStyle: "professional" };
  }
  const d = typeof orgCreatedAt === "string" ? new Date(orgCreatedAt) : orgCreatedAt;
  if (isNaN(d.getTime())) {
    return { formality: "formal", useFirstName: false, canUseHumor: false, greetingStyle: "professional" };
  }
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days >= 90) return { formality: "familiar", useFirstName: true, canUseHumor: true, greetingStyle: "casual" };
  if (days >= 30) return { formality: "warm", useFirstName: true, canUseHumor: false, greetingStyle: "personal" };
  return { formality: "formal", useFirstName: false, canUseHumor: false, greetingStyle: "professional" };
}

// ─── Greeting ───────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// ─── Narrative Greeting (WO-35, updated with tone evolution) ────────

type StreakInfo = { type: string; count: number; label: string } | null;
type WinInfo = { headline: string; detail: string | null; daysAgo: number } | null;

function narrativeGreeting(
  streak: StreakInfo,
  win: WinInfo,
  hasRanking: boolean,
  checkupRank?: number | null,
  checkupCity?: string | null,
  firstName?: string | null,
  tone?: ToneProfile | null,
): string {
  // Use tone to decide whether to include first name
  const useName = tone ? tone.useFirstName : true;
  const name = useName && firstName ? `, ${firstName}` : "";

  if (win && win.daysAgo <= 3) return `It worked${name}.`;
  if (streak && streak.count >= 12) return `Week ${streak.count}${name}.`;
  if (streak && streak.count >= 4) return `Week ${streak.count} of watching your market${name}.`;

  // Familiar tone gets a warmer greeting
  if (tone?.formality === "familiar" && firstName) {
    if (checkupRank && checkupCity) return `${firstName}, you're #${checkupRank} in ${checkupCity}.`;
    return `${getGreeting()}, ${firstName}.`;
  }

  if (checkupRank && checkupRank > 1 && checkupCity) return `You're #${checkupRank} in ${checkupCity}${name}.`;
  if (checkupRank === 1 && checkupCity) return `${getGreeting()}${name}. Alloro is watching ${checkupCity}.`;
  if (!hasRanking) return `Alloro already found something${name}.`;
  return `${getGreeting()}${name}.`;
}

// ─── Welcome Back Card ─────────────────────────────────────────────

const LAST_VISIT_KEY = "last_dashboard_visit";
const WELCOME_BACK_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

function useWelcomeBack(orgId: number | null) {
  const [showWelcomeBack, setShowWelcomeBack] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;

    const lastVisit = localStorage.getItem(LAST_VISIT_KEY);
    const now = Date.now();

    if (lastVisit) {
      const elapsed = now - Number(lastVisit);
      if (elapsed >= WELCOME_BACK_THRESHOLD_MS) {
        // User has been away 5+ days. Fetch the most recent event.
        const isPilot = typeof window !== "undefined" && (window.sessionStorage?.getItem("pilot_mode") === "true" || !!window.sessionStorage?.getItem("token")); const token = isPilot ? window.sessionStorage.getItem("token") : (getPriorityItem("auth_token") || getPriorityItem("token"));
        fetch(`/api/agents/data/latest?orgId=${orgId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
          .then((r) => r.json())
          .then((data) => {
            // Try to pull a meaningful summary from agent data
            const summary = extractWelcomeBackSummary(data);
            if (summary) {
              setWelcomeMessage(summary);
              setShowWelcomeBack(true);
            }
          })
          .catch(() => {
            // Fallback: generic welcome back
            setWelcomeMessage("We kept watching your market while you were away.");
            setShowWelcomeBack(true);
          });
      }
    }

    // Always update the timestamp on this visit
    localStorage.setItem(LAST_VISIT_KEY, String(now));
  }, [orgId]);

  const dismiss = useCallback(() => {
    setShowWelcomeBack(false);
  }, []);

  return { showWelcomeBack, welcomeMessage, dismissWelcomeBack: dismiss };
}

function extractWelcomeBackSummary(data: any): string | null {
  if (!data?.success) return "Your market didn't stop moving. Here's what changed.";

  // Check proofline findings -- deliver the reveal, not a report
  const proofline = data.agents?.proofline;
  if (proofline?.results) {
    const parsed =
      typeof proofline.results === "string"
        ? (() => { try { return JSON.parse(proofline.results); } catch { return null; } })()
        : proofline.results;
    const findings = parsed?.findings || parsed?.items;
    if (Array.isArray(findings) && findings.length > 0) {
      const top = findings[0];
      if (top.detail) {
        // The Oz moment: name the thing they were thinking about but didn't check
        return `Something moved while you were away. ${top.detail}`;
      }
      if (top.title) return top.title;
    }
  }

  return "Your market didn't stop moving. Here's what changed.";
}

function narrativeSubhead(
  streak: StreakInfo,
  win: WinInfo,
  practiceName: string,
  checkupCompetitor?: string | null,
): string {
  if (win && win.daysAgo <= 3 && win.detail) return win.detail;
  if (streak && streak.count >= 12) return `${streak.count} weeks of ${streak.label}. Here's what moved.`;
  if (streak && streak.count >= 4) return `Here's what changed for ${practiceName}.`;
  if (checkupCompetitor) return `Here's how you compare to ${checkupCompetitor}.`;
  if (practiceName && practiceName !== "Your Business") return `Here's what's happening for ${practiceName}.`;
  return "Here's what changed in your market.";
}

// ═══════════════════════════════════════════════════════════════════
// POSITION CARD — One job: show where you rank
// ═══════════════════════════════════════════════════════════════════

function PositionCard({ ranking, subScores }: { ranking: RankingData | null; subScores?: { trustSignal: number; firstImpression: number; responsiveness: number; competitiveEdge: number } | null }) {
  if (!ranking || !ranking.rankPosition) {
    return (
      <div className="card-preparing">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#D56753]/15 to-[#D56753]/5 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-[#D56753]" />
          </div>
          <div>
            <TailorText editKey="dashboard.position.scanning.title" defaultText="Scanning your market" as="p" className="text-sm font-bold text-[#1A1D23]" />
            <TailorText editKey="dashboard.position.scanning.status" defaultText="Working on it now" as="p" className="text-xs text-[#D56753] font-medium" />
          </div>
        </div>
        <p className="text-sm text-gray-500 leading-relaxed">
          <TailorText editKey="dashboard.position.scanning.body" defaultText="Alloro is reading your market right now. Your first position report arrives Monday morning." as="span" className="" />
        </p>
        <div className="mt-5 space-y-2.5">
          {["Finding your competitors", "Counting their reviews", "Measuring your visibility"].map((step, i) => (
            <div key={i} className="flex items-center gap-2.5 text-xs text-gray-500" style={{ animation: `fade-in-up 0.4s ease-out ${i * 0.15}s both` }}>
              <span className="w-2 h-2 rounded-full bg-[#D56753]/30 animate-pulse" style={{ animationDelay: `${i * 0.4}s` }} />
              {step}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const delta =
    ranking.previousPosition && ranking.rankPosition
      ? ranking.previousPosition - ranking.rankPosition
      : null;

  return (
    <div className="card-primary card-lift">
      <div className="flex items-start justify-between mb-1">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#D56753]/60">
          <TailorText editKey="dashboard.position.label" defaultText="Market Position" as="span" className="" />
        </p>
        {delta !== null && delta !== 0 && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
              delta > 0
                ? "badge-success"
                : delta <= -2
                  ? "bg-amber-50 text-amber-700 border border-amber-200/40"
                  : "bg-gray-50 text-gray-500"
            }`}
          >
            {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {delta > 0 ? "+" : ""}{delta} position{Math.abs(delta) !== 1 ? "s" : ""} since last scan
          </span>
        )}
      </div>

      <div className="mt-4">
        <span className="text-[40px] font-normal text-[#1A1D23] tracking-tight" style={{ fontVariantNumeric: 'tabular-nums', animation: 'score-reveal 0.6s ease-out' }}>
          #<AnimatedNumber value={ranking.rankPosition} duration={600} />
        </span>
        <span className="text-base text-[#1A1D23]/25 ml-2">
          of <AnimatedNumber value={ranking.totalCompetitors || 0} duration={800} />
        </span>
      </div>

      <p className="text-sm text-gray-500 mt-2">
        {ranking.totalCompetitors} {ranking.specialty || "competitor"}s in {(ranking.location && ranking.location !== "unknown") ? ranking.location : "your market"}
      </p>

      {ranking.rankScore != null && (
        <div className="mt-4 flex items-center gap-2">
          <span className={`badge-warm transition-all duration-700`}>
            <span className="inline-block w-2 h-2 rounded-full bg-current opacity-50 animate-pulse" />
            Business Clarity Score: {ranking.rankScore}/100
          </span>
        </div>
      )}

      {/* Sub-score breakdown from checkup data */}
      {subScores && (
        <div className="mt-5 pt-5 border-t border-[#D56753]/8 space-y-3">
          {[
            { label: "Trust Signal", score: subScores.trustSignal, max: 30 },
            { label: "First Impression", score: subScores.firstImpression, max: 30 },
            { label: "Responsiveness", score: subScores.responsiveness, max: 20 },
            { label: "Competitive Edge", score: subScores.competitiveEdge, max: 20 },
          ].map((s) => {
            const pct = Math.round((s.score / s.max) * 100);
            return (
              <div key={s.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-500">{s.label}</span>
                  <span className="text-xs font-semibold text-[#1A1D23]">{s.score}/{s.max}</span>
                </div>
                <div className="h-1.5 bg-[#D56753]/[0.06] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ease-out ${pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-[#D56753]"}`}
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
        <TailorText editKey="dashboard.competitor.label" defaultText="Your Top Competitor" as="span" className="" />
      </p>
      <p className="text-base font-semibold text-[#1A1D23] leading-relaxed">
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
  const { market, topCompetitor, findings, ozMoments } = ctx.data;

  // Priority 1: Oz Moments from the Checkup (the strongest "how did they know?" hits)
  if (ozMoments && Array.isArray(ozMoments)) {
    for (const oz of ozMoments.slice(0, 2)) {
      if (oz.hook) insights.push(oz.hook);
    }
  }

  // Priority 2: Original Checkup findings (review gap, rating gap, sentiment)
  if (findings && Array.isArray(findings)) {
    for (const f of findings) {
      if (f.detail && !insights.includes(f.detail)) {
        insights.push(f.detail);
      }
    }
  }

  // Priority 3: Market context (only if we don't have enough from above)
  if (insights.length < 2 && topCompetitor?.reviewCount && market?.rank) {
    insights.push(
      `You rank #${market.rank} of ${market.totalCompetitors} in ${market.city || "your market"}. ${topCompetitor.name} holds #1 with ${topCompetitor.reviewCount} reviews.`
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
      <div className="card-preparing">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#D56753]/15 to-[#D56753]/5 flex items-center justify-center">
            <Star className="w-5 h-5 text-[#D56753]" />
          </div>
          <div>
            <TailorText editKey="dashboard.findings.title" defaultText="Your agents are working" as="p" className="text-sm font-bold text-[#1A1D23]" />
            <TailorText editKey="dashboard.findings.status" defaultText="First report: Monday morning" as="p" className="text-xs text-[#D56753] font-medium" />
          </div>
        </div>
        <p className="text-sm text-gray-500 leading-relaxed">
          <TailorText editKey="dashboard.findings.body" defaultText="Your competitors are being analyzed right now. Named findings with dollar figures arrive in your first Monday email." as="span" className="" />
        </p>
      </div>
    );
  }

  if (findings.length === 0 && checkupInsights.length > 0) {
    return (
      <div className="card-supporting">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#D56753]/60 mb-4">
          <TailorText editKey="dashboard.findings.found" defaultText="What We Found" as="span" className="" />
        </p>
        <div className="space-y-3.5">
          {checkupInsights.map((insight, i) => (
            <div key={i} className="flex gap-3" style={{ animation: `fade-in-up 0.4s ease-out ${i * 0.1}s both` }}>
              <span className="shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-[#D56753]/15 to-[#D56753]/5 text-[#D56753] flex items-center justify-center text-xs font-bold mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-[#1A1D23]/80 leading-relaxed">{insight}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-5">
          From your checkup scan. Live agent findings replace this after the first scheduled analysis.
        </p>
      </div>
    );
  }

  return (
    <div className="card-supporting">
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#D56753]/60 mb-4">
        This Week's Findings
      </p>
      <div className="space-y-3.5">
        {findings.slice(0, 3).map((f, i) => (
          <div key={i} className="flex gap-3" style={{ animation: `fade-in-up 0.4s ease-out ${i * 0.1}s both` }}>
            <span className="shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-[#D56753]/15 to-[#D56753]/5 text-[#D56753] flex items-center justify-center text-xs font-bold mt-0.5">
              {i + 1}
            </span>
            <p className="text-sm text-[#1A1D23]/80 leading-relaxed">{f.detail || f.title}</p>
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
      <div className="card-preparing">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#212D40]/10 to-[#212D40]/5 flex items-center justify-center">
            <Globe className="w-5 h-5 text-[#1A1D23]/60" />
          </div>
          <div>
            <TailorText editKey="dashboard.website.title" defaultText="Your Website" as="p" className="text-sm font-bold text-[#1A1D23]" />
            <TailorText editKey="dashboard.website.status" defaultText="Being built for you" as="p" className="text-xs text-[#D56753] font-medium" />
          </div>
        </div>
        <p className="text-sm text-gray-500 leading-relaxed">
          <TailorText editKey="dashboard.website.body" defaultText="Alloro studied your competitors' websites and your reviews. Your site is being built from what it found. You'll get a notification when it's live." as="span" className="" />
        </p>
      </div>
    );
  }

  const siteUrl = `https://${website.generated_hostname}.sites.getalloro.com`;

  return (
    <div className="card-featured">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-50 flex items-center justify-center">
            <Globe className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <TailorText editKey="dashboard.website.title" defaultText="Your Website" as="p" className="text-sm font-bold text-[#1A1D23]" />
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
    <div className="card-supporting">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#212D40]/8 to-[#212D40]/3 flex items-center justify-center">
          <Share2 className="w-5 h-5 text-[#1A1D23]/60" />
        </div>
        <div>
          <TailorText editKey="dashboard.referral.title" defaultText="Know someone who should see this?" as="p" className="text-sm font-bold text-[#1A1D23]" />
          <TailorText editKey="dashboard.referral.subtitle" defaultText="Send them the checkup. When they join, you both save on month one." as="p" className="text-xs text-gray-500" />
        </div>
      </div>
      <div className="flex gap-2">
        <input
          readOnly
          value={link}
          className="flex-1 rounded-xl border border-[#212D40]/8 bg-[#F7F8FA] px-3 py-2.5 text-xs text-gray-500 truncate"
        />
        <button
          onClick={async () => {
            // Try Web Share API on mobile first (native share sheet)
            if (navigator.share) {
              try {
                await navigator.share({ title: "See where you rank", url: link });
                return;
              } catch { /* user cancelled or unsupported, fall through to clipboard */ }
            }
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
          {copied ? "Copied!" : "Share the link"}
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
        <p className="text-base font-semibold text-[#1A1D23] mb-4">
          {comp.name || "Your top competitor"} is one spot ahead.
        </p>
      )}
      {reviewGap != null && reviewGap > 0 && (
        <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-[#1A1D23]">Reviews needed</p>
            <p className="text-xs text-gray-500">They have {comp?.reviewCount}. You have {ranking.clientReviews}.</p>
          </div>
          <span className="text-lg font-semibold text-[#D56753]">{reviewGap}</span>
        </div>
      )}
    </div>
  );
}

function CompetitorActivityFeed({ ranking }: { ranking: RankingData | null }) {
  if (!ranking?.topCompetitor) {
    return (
      <div className="card-preparing">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#212D40]/10 to-[#212D40]/5 flex items-center justify-center">
            <Users className="w-5 h-5 text-[#1A1D23]/50" />
          </div>
          <div>
            <p className="text-sm font-bold text-[#1A1D23]">Watching your competitors</p>
            <p className="text-xs text-[#D56753] font-medium">Named activity appears after your first scan.</p>
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
    <div className="card-supporting">
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#D56753]/60 mb-4">Competitor Activity</p>
      <div className="space-y-3">
        {activities.map((a, i) => (
          <div key={i} className="flex items-start gap-3 text-sm">
            <span className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${a.dot}`} />
            <p className="text-gray-500">{a.text}</p>
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
    <div className="card-supporting">
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#D56753]/60 mb-4">Your Position</p>
      <div className="flex items-center gap-1">
        {positions.map((pos) => (
          <div key={pos} className="flex-1 flex flex-col items-center gap-1.5">
            <div className={`w-full h-2.5 rounded-full ${pos === ranking.rankPosition ? "bg-[#D56753]" : pos < ranking.rankPosition! ? "bg-[#212D40]/15" : "bg-gray-100"}`} />
            <span className={`text-xs font-bold ${pos === ranking.rankPosition ? "text-[#D56753]" : "text-gray-400"}`}>{pos}</span>
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
    <div className="flex items-center gap-1 rounded-xl bg-[#212D40]/[0.04] p-1 shrink-0">
      <button
        onClick={() => onChange("standard")}
        className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all duration-200 ${mode === "standard" ? "bg-white text-[#1A1D23] shadow-warm" : "text-gray-400 hover:text-gray-500"}`}
      >
        <Shield className="h-3.5 w-3.5" />
        Overview
      </button>
      <button
        onClick={() => onChange("growth")}
        className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all duration-200 btn-press ${mode === "growth" ? "bg-[#D56753] text-white shadow-warm" : "text-gray-400 hover:text-gray-500"}`}
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

// Lemonis Protocol questions are optional. Surfaced at day 30 or through
// CS conversation. Never a gate. The product delivers value from day 1
// without asking the owner to answer questions they may not know the answer to.

export default function DoctorDashboard() {
  const { userProfile, billingStatus, hasGoogleConnection } = useAuth();
  const { selectedLocation } = useLocationContext();

  const orgId = userProfile?.organizationId || null;

  const locationId = selectedLocation?.id ?? null;
  const practiceName = selectedLocation?.name || userProfile?.practiceName || "Your Business";
  // locationName available via selectedLocation?.name if needed in sub-components

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
      setTimeout(() => fireConfetti({ x: 0.5, y: 0.3 }), 300);
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
  // hasReferralData available via dashCtx?.has_referral_data if needed

  // Tone Evolution: earn informality over time
  const toneProfile = useMemo(() => getToneProfile(orgCreatedAt), [orgCreatedAt]);

  // Welcome Back: show card if user returns after 5+ days away
  const { showWelcomeBack, welcomeMessage, dismissWelcomeBack } = useWelcomeBack(orgId);

  const { data: rankingData, isLoading: isRankingLoading } = useQuery({
    queryKey: ["client-ranking", orgId, locationId],
    queryFn: async (): Promise<RankingData | null> => {
      if (!orgId) return null;
      const isPilot = typeof window !== "undefined" && (window.sessionStorage?.getItem("pilot_mode") === "true" || !!window.sessionStorage?.getItem("token")); const token = isPilot ? window.sessionStorage.getItem("token") : (getPriorityItem("auth_token") || getPriorityItem("token"));
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

  const { data: profileData, isError: isProfileError } = useQuery({
    queryKey: ["client-profile"],
    queryFn: async () => apiGet({ path: "/profile/get" }),
    staleTime: 10 * 60_000,
  });

  void isProfileError; // consumed by error boundary
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

  // Confetti on win detection (fires once per session)
  const [winCelebrated, setWinCelebrated] = useState(false);
  useEffect(() => {
    if (winData && winData.daysAgo <= 1 && !winCelebrated) {
      setWinCelebrated(true);
      setTimeout(() => fireConfetti({ x: 0.5, y: 0.4 }), 500);
    }
  }, [winData, winCelebrated]);

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

  // Tracked competitors (side-by-side comparison)
  const { data: trackedCompetitors, refetch: refetchCompetitors } = useQuery({
    queryKey: ["tracked-competitors", orgId],
    queryFn: async () => {
      const res = await apiGet({ path: "/user/competitors" });
      return res?.success ? (res.competitors ?? []) : [];
    },
    enabled: !!orgId,
    staleTime: 10 * 60_000,
  });

  const removeCompetitor = useCallback(async (placeId: string) => {
    await apiDelete({ path: `/user/competitors/${encodeURIComponent(placeId)}` });
    refetchCompetitors();
  }, [refetchCompetitors]);

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
    {/* Trial countdown banner — shows when trial is ending soon. Hidden in conference mode. */}
    {!isConferenceMode() && dashCtx?.trial && !dashCtx?.trial.is_subscribed && dashCtx?.trial.days_remaining <= 3 && dashCtx?.trial.days_remaining > 0 && (
      <div className="bg-[#D56753] text-white text-center py-2.5 px-4 text-sm font-medium">
        Your trial ends in {dashCtx?.trial.days_remaining} day{dashCtx?.trial.days_remaining !== 1 ? "s" : ""}. Your intelligence goes dark after that.{" "}
        <a href="/settings/billing" className="underline font-bold hover:text-white/90">Subscribe now</a>
      </div>
    )}

    {/* Trial expired overlay — full lockout after trial ends. Hidden in conference mode. */}
    {!isConferenceMode() && dashCtx?.trial && !dashCtx?.trial.is_subscribed && dashCtx?.trial.days_remaining <= 0 && (
      <div className="fixed inset-0 z-50 bg-white/95 flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-[#D56753]/10 flex items-center justify-center mx-auto">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#D56753" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-[#1A1D23]">Your trial has ended</h2>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">
              Alloro kept watching your market. Subscribe to see what changed while you were away.
            </p>
          </div>
          <a
            href="/settings/billing"
            className="inline-flex items-center gap-2 px-8 py-3 bg-[#D56753] text-white font-semibold rounded-xl shadow-lg shadow-[#D56753]/25 hover:brightness-105 transition-all"
          >
            Subscribe to continue
          </a>
          <p className="text-xs text-gray-400">Your data is saved. Pick up right where you left off.</p>
        </div>
      </div>
    )}

    {/* Billing prompt bar — top of dashboard, quiet, dismissable */}
    <BillingPromptBar
      orgId={orgId}
      score={effectiveRanking?.rankScore ?? null}
      finding={prooflineFindings[0]?.detail || null}
    />

    <motion.div
      className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:py-12 bg-gray-50/40 min-h-screen rounded-none sm:rounded-3xl sm:my-4 sm:border sm:border-gray-100/80 sm:shadow-sm"
      variants={warmStagger}
      initial="hidden"
      animate="visible"
    >
      {/* ── First Impression ──────────────────────────────────────
           Apple Health pattern: one calm hero, everything else recedes.
           The owner should understand their business in 3 seconds.
           ────────────────────────────────────────────────────────── */}
      <motion.div variants={warmCardVariants}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <h1 className="font-heading text-xl sm:text-2xl font-semibold text-[#1A1D23] leading-tight">
            {mode === "growth"
              ? "Close the gap."
              : narrativeGreeting(streakData, winData, !!effectiveRanking, effectiveRanking?.rankPosition, effectiveRanking?.location, userProfile?.firstName, toneProfile)}
          </h1>
          <ModeToggle mode={mode} onChange={setMode} />
        </div>
        <p className="text-sm text-gray-500 leading-relaxed">
          {mode === "growth"
            ? `What stands between ${practiceName} and the next position.`
            : narrativeSubhead(streakData, winData, practiceName, effectiveRanking?.topCompetitor?.name)}
        </p>
      </motion.div>

      {/* ── Hero: Market Position (always first, always visible) ──
           This is the thing Dr. Pawlak sees in 3 seconds.
           Apple Health pattern: one metric dominates. */}
      {!isLoading && mode === "standard" && (
        <motion.div variants={warmCardVariants}>
          <PositionCard ranking={effectiveRanking} subScores={checkupCtx?.data?.score ? { trustSignal: checkupCtx.data.score.trustSignal ?? checkupCtx.data.score.localVisibility ?? 0, firstImpression: checkupCtx.data.score.firstImpression ?? checkupCtx.data.score.onlinePresence ?? 0, responsiveness: checkupCtx.data.score.responsiveness ?? checkupCtx.data.score.reviewHealth ?? 0, competitiveEdge: checkupCtx.data.score.competitiveEdge ?? 10 } : null} />
        </motion.div>
      )}

      {/* Dreamweaver Card -- the Oz Pearlman reveal for returning users.
           Names the thing they were wondering about but hadn't checked. */}
      {showWelcomeBack && welcomeMessage && (
        <motion.div
          variants={fadeInUp}
          className="rounded-2xl border border-[#D56753]/15 bg-[#D56753]/[0.03] p-5 cursor-pointer hover:bg-[#D56753]/[0.05] transition-colors"
          onClick={dismissWelcomeBack}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-[#D56753] animate-pulse" />
            <p className="text-xs font-medium uppercase tracking-[0.05em] text-[#D56753]/50">While you were away</p>
          </div>
          <p className="text-sm font-medium text-[#1A1D23] leading-relaxed">
            {welcomeMessage}
          </p>
        </motion.div>
      )}

      {/* GBP instant value reveal (WO-42) */}
      {showGbpReveal && (
        <motion.div variants={cardVariants} className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5">
          <TailorText editKey="dashboard.gbpReveal.label" defaultText="Connected" as="p" className="text-xs font-bold uppercase tracking-widest text-emerald-600 mb-2" />
          <p className="text-sm font-bold text-[#1A1D23]">
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
        </motion.div>
      )}

      {/* Milestone check-in card (WO-51/52) */}
      {!isLoading && milestoneCard && (
        <motion.div variants={cardVariants} className="rounded-2xl border border-[#212D40]/15 bg-white p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-[#D56753] mb-3">
            Your first {milestoneCard.milestone} days.
          </p>
          {milestoneCard.sunday_fear && (
            <div className="mb-3">
              <p className="text-sm text-[#1A1D23]/70 leading-relaxed">
                When you started, you told us your biggest concern was:
                <span className="italic text-[#1A1D23] font-medium">
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
            <p className="text-sm text-[#1A1D23] font-medium">
              The one thing that moved: {milestoneCard.moved}
            </p>
          )}
          {milestoneCard.gap && (
            <p className="text-sm text-[#1A1D23]/60 mt-1">
              The one thing that hasn't yet: {milestoneCard.gap}
            </p>
          )}
        </motion.div>
      )}

      {/* Win celebration card (WO-34) -- Fitbit vibration moment */}
      {!isLoading && winData && (
        <motion.div variants={scaleInFade} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#D56753] to-[#c05544] p-6 text-white shadow-[0_8px_30px_rgba(213,103,83,0.3)]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-20 h-20 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
          <div className="relative">
            <TailorText editKey="dashboard.win.label" defaultText="This is a story worth telling" as="p" className="text-xs font-bold uppercase tracking-widest text-white/60 mb-2" />
            <p className="text-base font-bold leading-snug">
              {winData.headline || "Something changed. You acted. It worked."}
            </p>
            {winData.detail && (
              <p className="text-sm text-white/75 mt-2.5 leading-relaxed">{winData.detail}</p>
            )}
            {winData.daysAgo != null && winData.daysAgo <= 1 && (
              <p className="text-xs text-white/50 mt-3 uppercase tracking-wide">Just happened</p>
            )}
          </div>
        </motion.div>
      )}

      {/* One Action Card — first visible element below greeting (WO-29) */}
      {!isLoading && (
        <motion.div variants={scaleInFade}>
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
            gbpConnected={hasGoogleConnection || !!rankingData}
            topCompetitorName={effectiveRanking?.topCompetitor?.name || "your top competitor"}
          />
        </motion.div>
      )}

      {/* Monday Preview -- THE product, rendered. Shows what Monday morning
           looks like before the email actually fires. The screenshot moment. */}
      {!isLoading && (
        <motion.div variants={warmCardVariants}>
          <MondayPreview />
        </motion.div>
      )}

      {/* Card Capture — soft prompt during trial days 3-7 */}
      {dashCtx?.trial && (
        <CardCapture
          trialDaysRemaining={dashCtx.trial.days_remaining}
          isSubscribed={dashCtx.trial.is_subscribed}
        />
      )}

      {/* Onboarding Checklist — below One Action Card */}
      {!isLoading && (
        <OnboardingChecklist
          checkupScore={effectiveRanking?.rankScore ?? null}
          gbpConnected={hasGoogleConnection || !!rankingData}
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
              <p className="text-sm font-bold text-[#1A1D23]">{week1WinData.headline}</p>
              <p className="text-sm text-gray-500 leading-relaxed mt-1">{week1WinData.detail}</p>
            </div>
          </div>
        </div>
      )}

      {/* What Alloro did this week -- the retention mechanic */}
      {!isLoading && <motion.div variants={cardVariants}><AlloroActivityCard /></motion.div>}

      {/* Referral card rendered below in the isOwnerOrManager block with referralCode prop */}

      {isLoading && (
        <div className="space-y-4">
          <CardSkeleton height="7rem" />
          <CardSkeleton height="5rem" />
          <CardSkeleton height="8rem" />
        </div>
      )}

      {mode === "standard" ? (
        <>
          {/* Belonging signal -- the blue dot */}
          {effectiveRanking?.location && (
            <p className="text-xs text-gray-400 text-center font-heading italic">
              {(effectiveRanking.totalCompetitors ?? 0) < 10
                ? `Among the first business owners watching their market in ${effectiveRanking.location}.`
                : `One of ${effectiveRanking.totalCompetitors} business owners watching their market in ${effectiveRanking.location}.`}
            </p>
          )}

          {/* Streak badge (WO-33) */}
          {streakData && streakData.count >= 2 && (
            <motion.div variants={cardVariants}>
              <StreakBadge type={streakData.type} count={streakData.count} label={streakData.label} />
            </motion.div>
          )}

          {/* 2. One sentence finding — hide entirely when no competitor data */}
          {effectiveRanking?.topCompetitor && (
            <motion.div variants={cardVariants}>
              <CompetitorGap ranking={effectiveRanking} onCompetitorClick={setDrawerCompetitor} />
            </motion.div>
          )}

          {/* Score Improvement Plan — actionable steps to raise the score */}
          <motion.div variants={cardVariants} id="improvement-plan">
            <ScoreImprovementPlan />
          </motion.div>

          {/* What If Score Simulator — interactive projections */}
          <motion.div variants={cardVariants}>
            <ScoreSimulator />
          </motion.div>

          {/* Tracked Competitor Comparisons */}
          {trackedCompetitors && trackedCompetitors.length > 0 && (
            <>
              {trackedCompetitors.map((comp: any) => (
                <motion.div key={comp.placeId} variants={cardVariants}>
                  <CompetitorComparison
                    competitor={comp}
                    clientRating={checkupCtx?.data?.place?.rating ?? effectiveRanking?.topCompetitor?.rating ?? 0}
                    clientReviews={effectiveRanking?.clientReviews ?? checkupCtx?.data?.place?.reviewCount ?? 0}
                    clientPhotos={checkupCtx?.data?.place?.photoCount ?? checkupCtx?.data?.place?.photos ?? 0}
                    clientLastReviewDays={null}
                    onRemove={removeCompetitor}
                  />
                </motion.div>
              ))}
            </>
          )}

          {/* Add/Track Competitor */}
          <motion.div variants={cardVariants}>
            <AddCompetitor
              currentCount={trackedCompetitors?.length ?? 0}
              maxCount={3}
              onAdded={() => refetchCompetitors()}
            />
          </motion.div>

          {/* GBP Connect card -- optional enhancement, not a gate.
              Shows below intelligence content as a soft prompt.
              Use both auth context AND dashboard context as truth sources
              to prevent false "Connect Google" prompts (#9 fix). */}
          {!hasGoogleConnection && !dashCtx?.has_google_connection && (
            <GBPConnectCard gbpConnected={hasGoogleConnection || !!dashCtx?.has_google_connection} orgId={orgId} />
          )}

          {/* PatientPath Research Brief reveal (WO-43) */}
          {checkupCtx?.research_findings && checkupCtx.research_findings.length > 0 && (
            <motion.div variants={warmCardVariants} className="card-supporting">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#D56753]/60 mb-3">
                Before we built your site, we studied your business.
              </p>
              <div className="space-y-2.5">
                {checkupCtx.research_findings.map((finding: string, i: number) => (
                  <p key={i} className="text-sm text-[#1A1D23]/80 leading-relaxed">
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
            </motion.div>
          )}

          {/* 4. PatientPath breadcrumb -- quiet, lower. Hide card entirely on error instead of showing generic text. */}
          {isOwnerOrManager && !isWebsiteError && <motion.div variants={cardVariants}><WebsiteCard website={websiteData ?? null} /></motion.div>}

          {/* ══ BELOW THE FOLD ══ */}
          {isOwnerOrManager && <motion.div variants={cardVariants}><ProoflineFindings findings={prooflineFindings} checkupCtx={checkupCtx} /></motion.div>}
          {canSendReviews && <motion.div variants={cardVariants}><ReviewRequestCard placeId={effectiveRanking?.placeId ?? null} practiceName={practiceName} /></motion.div>}
          {isOwnerOrManager && <motion.div variants={cardVariants}><ReferralCard referralCode={referralCode} /></motion.div>}
        </>
      ) : (
        <>
          <motion.div variants={cardVariants}><GrowthPositionTrack ranking={effectiveRanking} /></motion.div>
          <motion.div variants={cardVariants}><GapToNext ranking={effectiveRanking} /></motion.div>
          <motion.div variants={cardVariants}><CompetitorActivityFeed ranking={effectiveRanking} /></motion.div>
          {canSendReviews && <motion.div variants={cardVariants}><ReviewRequestCard placeId={effectiveRanking?.placeId ?? null} practiceName={practiceName} /></motion.div>}
          {isOwnerOrManager && <motion.div variants={cardVariants}><ReferralCard referralCode={referralCode} /></motion.div>}
        </>
      )}

      {/* Exit emotion -- Peak-End Rule: the LAST thing seen determines memory.
          Context-aware. Never generic. Make them leave feeling better than when they arrived. */}
      {mode === "standard" && !isLoading && (
        <div className="text-center py-8">
          <p className="text-sm text-[#1A1D23]/30 italic font-heading">
            {winData && winData.daysAgo <= 3
              ? "Something moved this week. Because you acted."
              : streakData && streakData.count >= 8
                ? `Week ${streakData.count}. You've been watching your market longer than most ever will.`
                : streakData && streakData.count >= 3
                  ? `${streakData.count} weeks of clarity. That compounds.`
                  : effectiveRanking?.rankPosition === 1
                    ? "You're #1. Every week you check in, you stay there."
                    : effectiveRanking?.topCompetitor?.name
                      ? `${effectiveRanking.topCompetitor.name} didn't check theirs today. You did.`
                      : "You checked in. That puts you ahead of everyone who didn't."}
          </p>
          <div className="h-px divider-warm mt-8 mx-auto max-w-[10rem]" />
        </div>
      )}

      {/* Competitor Detail Drawer */}
      {drawerCompetitor && (
        <CompetitorDrawer
          competitor={drawerCompetitor}
          clientReviews={effectiveRanking?.clientReviews || 0}
          clientVelocityPerWeek={null}
          onClose={() => setDrawerCompetitor(null)}
        />
      )}

      {/* PatientPath status integrated into dashboard cards, not floating */}
    </motion.div>
    </>
  );
}

function tryParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}
