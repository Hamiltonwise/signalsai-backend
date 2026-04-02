import { useState, useEffect } from "react";
import { useLocation, useNavigate, Navigate, Link } from "react-router-dom";
import {
  Eye,
  EyeOff,
  Globe,
  MessageSquare,
  Lock,
  ArrowRight,
  Star,
  MapPin,
  CheckCircle2,
  Target,
  Copy,
  Share2,
  Zap,
  Shield,
  Image,
  Reply,
  Swords,
} from "lucide-react";
import type { PlaceDetails } from "../../api/places";
import { sendCheckupEmail, triggerBuild, createCompetitorInvite } from "../../api/checkup";
import { trackEvent } from "../../api/tracking";
import { withTimeout, getSourceChannel } from "./conferenceFallback";

// ---------------------------------------------------------------------------
// Types — passed via React Router state from the scanning phase
// ---------------------------------------------------------------------------

export interface CheckupCompetitor {
  name: string;
  rating: number;
  reviewCount: number;
  placeId: string;
  location?: { lat: number; lng: number };
}

export interface CheckupFinding {
  type: string;
  title: string;
  detail: string;
  value: number;
  impact: number;
}

export interface CheckupGapVelocity {
  clientWeekly: number;
  competitorWeekly: number;
  weeksToPass: number | null;
  thisWeekAsk: number;
  competitorName: string;
}

export interface CheckupGapItem {
  id: string;
  label: string;
  current: number;
  target: number;
  unit: string;
  action: string;
  timeEstimate: string;
  competitorName: string | null;
  velocity?: CheckupGapVelocity;
}

export interface CheckupResults {
  place: PlaceDetails;
  score: {
    composite: number;
    // New First Impression sub-scores
    trustSignal: number;
    firstImpression: number;
    responsiveness: number;
    competitiveEdge: number;
    // Legacy aliases (backend sends both during transition)
    localVisibility: number;
    onlinePresence: number;
    reviewHealth: number;
  };
  scoreLabel?: string;
  competitiveDataLimited?: boolean;
  topCompetitor: CheckupCompetitor | null;
  competitors: CheckupCompetitor[];
  findings: CheckupFinding[];
  totalImpact: number;
  market: {
    city: string;
    totalCompetitors: number;
    avgRating: number;
    avgReviews: number;
    rank: number;
  };
  gaps?: CheckupGapItem[];
  ozMoments?: Array<{
    hook: string;
    implication: string;
    action: string;
    shareability: number;
  }>;
  refCode?: string;
  intent?: string;
  userQuestion?: string;
  partial?: boolean; // true when user skipped before API finished
}

// ---------------------------------------------------------------------------
// Score Labels — WO4: Never use "Poor", "Fair", "Good"
// ---------------------------------------------------------------------------

function getScoreLabel(score: number): string {
  if (score >= 80) return "Strong Position";
  if (score >= 60) return "Getting There";
  return "Room to Grow";
}

function getScoreLabelColor(score: number): string {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-[#D56753]";
}

function getScoreRingColor(score: number): string {
  if (score >= 80) return "stroke-emerald-500";
  if (score >= 60) return "stroke-amber-500";
  return "stroke-[#D56753]";
}

// ---------------------------------------------------------------------------
// Score Ring — animated circular gauge
// ---------------------------------------------------------------------------

function useCountUp(target: number, duration = 1500): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (target <= 0) { setValue(0); return; }
    const start = performance.now();
    let raf: number;

    function tick(now: number) {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      // ease-out cubic for a satisfying deceleration
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

function ScoreRing({
  score,
  size = 140,
  strokeWidth = 10,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const displayScore = useCountUp(score, 1500);

  return (
    <div
      className="relative"
      style={{ width: size, height: size, animation: 'score-reveal 0.8s ease-out' }}
    >
      {/* Warm glow behind the ring for high scores */}
      {score >= 75 && (
        <div
          className="absolute inset-0 rounded-full glow-success"
          style={{ margin: -8 }}
        />
      )}
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(214, 104, 83, 0.06)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className={`${getScoreRingColor(score)} transition-all duration-1000 ease-out`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          style={{ filter: score >= 75 ? 'drop-shadow(0 0 6px rgba(34, 197, 94, 0.3))' : undefined }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold text-[#1A1D23]">{displayScore}</span>
        <span className={`text-sm font-semibold ${getScoreLabelColor(score)}`}>
          {getScoreLabel(score)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score Celebration Text -- delight layer beneath the ring
// ---------------------------------------------------------------------------

function ScoreCelebrationText({ score }: { score: number }) {
  if (score >= 75) {
    return (
      <p className="text-sm text-emerald-600 text-center font-medium -mt-1 animate-fade-in">
        That&apos;s a strong foundation.
      </p>
    );
  }
  if (score >= 40) {
    return (
      <p className="text-sm text-slate-500 text-center -mt-1 animate-fade-in">
        Room to grow, and we know exactly where.
      </p>
    );
  }
  return (
    <p className="text-sm text-slate-500 text-center -mt-1 animate-fade-in">
      There&apos;s a clear path forward. Let&apos;s start.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Sub-score Bar — shows label, points out of max, and fill bar
// ---------------------------------------------------------------------------

function SubScoreBar({
  label,
  score,
  maxScore,
  icon: Icon,
}: {
  label: string;
  score: number;
  maxScore: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const pct = Math.round((score / maxScore) * 100);

  return (
    <div className="flex items-center gap-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
        pct >= 80 ? "bg-emerald-50" : pct >= 60 ? "bg-amber-50" : "bg-[#D56753]/8"
      }`}>
        <Icon className={`w-4 h-4 ${
          pct >= 80 ? "text-emerald-600" : pct >= 60 ? "text-amber-600" : "text-[#D56753]"
        }`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-[#1A1D23]/70">{label}</span>
          <span className="text-sm font-semibold text-[#1A1D23]">
            {score}/{maxScore}
          </span>
        </div>
        <div className="h-2 bg-[#D56753]/[0.06] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ease-out ${
              pct >= 80
                ? "bg-emerald-500"
                : pct >= 60
                  ? "bg-amber-500"
                  : "bg-[#D56753]"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Finding Card
// ---------------------------------------------------------------------------

function FindingCard({
  finding,
  blurred,
}: {
  finding: CheckupFinding;
  blurred: boolean;
}) {
  const isPositive =
    finding.type.includes("lead") || finding.type.includes("strong") || finding.type === "recency_strong" || finding.type === "response_strong";
  const isSentiment = finding.type === "sentiment_insight";
  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    review_gap: MessageSquare,
    review_lead: MessageSquare,
    rating_gap: Star,
    rating_strong: Star,
    recency_strong: Star,
    recency_stale: Star,
    response_gap: Reply,
    response_strong: Reply,
    profile_incomplete: Globe,
    photo_gap: Image,
    hours_missing: Globe,
    no_competitors: MapPin,
    market_rank: MapPin,
    sentiment_insight: Zap,
  };
  const Icon = iconMap[finding.type] || Target;

  return (
    <div
      className={`relative rounded-xl p-4 transition-all duration-300 ${
        isSentiment
          ? "bg-[#212D40] border border-[#212D40] shadow-lg"
          : isPositive
            ? "bg-gradient-to-r from-emerald-50/60 to-white border border-emerald-200/40"
            : "bg-white border border-[#D56753]/10 hover:border-[#D56753]/20"
      } ${blurred ? "select-none" : ""}`}
    >
      {blurred && (
        <div className="absolute inset-0 backdrop-blur-[6px] bg-white/60 rounded-xl z-10" />
      )}
      <div className="flex items-start gap-3">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
            isSentiment
              ? "bg-[#D56753]/20"
              : isPositive
                ? "bg-emerald-100/80"
                : "bg-[#D56753]/8"
          }`}
        >
          <Icon
            className={`w-4 h-4 ${isSentiment ? "text-[#D56753]" : isPositive ? "text-emerald-600" : "text-[#D56753]"}`}
          />
        </div>
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${isSentiment ? "text-white" : "text-[#1A1D23]"}`}>
            {finding.title}
          </p>
          <p className={`text-sm mt-1 leading-relaxed ${isSentiment ? "text-white/70" : "text-slate-500"}`}>{finding.detail}</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gap Progress Bar — concrete closeable units, not percentages
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Review Race Card — velocity-based progress, framed as a race
// ---------------------------------------------------------------------------

function ReviewRaceCard({ gap }: { gap: CheckupGapItem }) {
  const v = gap.velocity;
  const [expanded, setExpanded] = useState(false);
  const pct =
    gap.target > 0 ? Math.min(100, Math.round((gap.current / gap.target) * 100)) : 0;
  const isLeading = gap.current >= gap.target;

  return (
    <div className={`rounded-xl border p-5 ${isLeading ? "border-emerald-200 bg-emerald-50/50" : "border-[#D56753]/20 bg-white"}`}>
      {/* Race header */}
      <p className={`text-sm font-bold leading-snug ${isLeading ? "text-emerald-800" : "text-[#1A1D23]"}`}>
        {gap.label}
      </p>

      {/* Race track */}
      <div className="mt-4 relative">
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ease-out ${isLeading ? "bg-emerald-500" : "bg-[#D56753]"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-xs font-semibold text-[#1A1D23] tabular-nums">
            You: {gap.current}
          </span>
          <span className="text-xs font-semibold text-slate-400 tabular-nums">
            {gap.competitorName}: {gap.target > gap.current ? gap.target - 1 : gap.target}
          </span>
        </div>
      </div>

      {/* Velocity stats */}
      {v && (
        <div className="mt-4 grid grid-cols-3 gap-1 sm:gap-2">
          <div className="bg-slate-50 rounded-lg p-2 sm:p-2.5 text-center">
            <p className="text-base sm:text-lg font-bold text-[#1A1D23] tabular-nums">{v.clientWeekly}</p>
            <p className="text-xs text-slate-400 leading-tight">Your pace</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-2 sm:p-2.5 text-center">
            <p className="text-base sm:text-lg font-bold text-slate-500 tabular-nums">{v.competitorWeekly}</p>
            <p className="text-xs text-slate-400 leading-tight">Their pace</p>
          </div>
          <div className={`rounded-lg p-2 sm:p-2.5 text-center ${v.weeksToPass ? "bg-[#D56753]/5" : "bg-emerald-50"}`}>
            <p className={`text-base sm:text-lg font-bold tabular-nums ${v.weeksToPass ? "text-[#D56753]" : "text-emerald-600"}`}>
              {v.weeksToPass && v.weeksToPass <= 52 ? `${v.weeksToPass}w` : v.weeksToPass && v.weeksToPass > 52 ? "1yr+" : "---"}
            </p>
            <p className="text-xs text-slate-400 leading-tight">
              {v.weeksToPass && v.weeksToPass <= 52 ? "To pass" : v.weeksToPass && v.weeksToPass > 52 ? "Focus on pace" : isLeading ? "Leading" : "Increase pace"}
            </p>
          </div>
        </div>
      )}

      {/* This week's ask */}
      {v && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-4 w-full text-left"
        >
          <div className={`rounded-lg p-3 border transition-colors ${
            expanded ? "border-[#D56753]/20 bg-[#D56753]/3" : "border-slate-200 bg-slate-50 hover:border-[#D56753]/20"
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-[#1A1D23]">
                  This week's target: {v.thisWeekAsk} review{v.thisWeekAsk !== 1 ? "s" : ""}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {gap.timeEstimate}
                </p>
              </div>
              <span className="text-xs text-[#D56753] font-medium shrink-0">
                {expanded ? "Hide" : "How"}
              </span>
            </div>
            {expanded && (
              <p className="text-xs text-slate-600 leading-relaxed mt-2.5 pt-2.5 border-t border-slate-200">
                {gap.action}
              </p>
            )}
          </div>
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Standard Gap Bar (for non-velocity gaps like rating, GBP completeness)
// ---------------------------------------------------------------------------

function GapBar({ gap }: { gap: CheckupGapItem }) {
  const pct =
    gap.target > 0 ? Math.min(100, Math.round((gap.current / gap.target) * 100)) : 0;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left"
      >
        <p className="text-sm font-semibold text-[#1A1D23] leading-snug">
          {gap.label}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#D56753] rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs font-bold text-[#1A1D23] shrink-0 tabular-nums">
            {gap.current}/{gap.target}
          </span>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-slate-400">
            {gap.timeEstimate}
          </span>
          <span className="text-xs text-[#D56753] font-medium">
            {expanded ? "Hide action" : "What to do"}
          </span>
        </div>
      </button>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <p className="text-xs text-slate-600 leading-relaxed">
            {gap.action}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gap Section — routes review_race to ReviewRaceCard, others to GapBar
// ---------------------------------------------------------------------------

// ─── Viral Loop: Competitor Invite Section ──────────────────────────

function CompetitorInviteSection({
  competitors,
  senderName,
}: {
  competitors: Array<{ name: string; placeId: string; rating: number; reviewCount: number }>;
  senderName: string;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleInvite = async (competitor: { name: string; placeId: string }) => {
    setLoadingId(competitor.placeId);
    try {
      const res = await createCompetitorInvite({
        competitorPlaceId: competitor.placeId,
        competitorName: competitor.name,
        senderName,
      });
      if (res.success && res.inviteUrl) {
        // Norton frictionless handoff: use Web Share API on mobile, clipboard on desktop
        if (navigator.share) {
          await navigator.share({
            title: `${competitor.name}, see where you rank`,
            text: `We already know who's ahead of ${competitor.name}. 60 seconds to find out.`,
            url: res.inviteUrl,
          }).catch(() => {
            // User cancelled share sheet, fall back to clipboard
            navigator.clipboard.writeText(res.inviteUrl!);
          });
        } else {
          await navigator.clipboard.writeText(res.inviteUrl);
        }
        setCopiedId(competitor.placeId);
        setTimeout(() => setCopiedId(null), 3000);
        trackEvent("checkup.competitor_invite_created", {
          competitorName: competitor.name,
        });
      }
    } catch { /* silent */ }
    finally { setLoadingId(null); }
  };

  if (competitors.length === 0) return null;

  return (
    <div className="rounded-2xl border border-dashed border-[#D56753]/20 bg-[#D56753]/[0.02] p-5">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
        Your competitors haven't seen this yet
      </p>
      <div className="space-y-2">
        {competitors.slice(0, 4).map((c) => (
          <div key={c.placeId} className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#1A1D23] break-words">{c.name}</p>
              <p className="text-xs text-gray-400">{c.reviewCount} reviews, {c.rating} stars</p>
            </div>
            <button
              onClick={() => handleInvite(c)}
              disabled={loadingId === c.placeId}
              className="shrink-0 ml-3 text-xs font-semibold text-[#D56753] hover:underline disabled:opacity-40"
            >
              {copiedId === c.placeId
                ? "Link copied!"
                : loadingId === c.placeId
                  ? "..."
                  : "Show them where they rank"}
            </button>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-3">
        They'll see their own score. Your data is never shared.
      </p>
    </div>
  );
}

function GapSection({ gaps }: { gaps: CheckupGapItem[] }) {
  if (!gaps || gaps.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold text-[#1A1D23] uppercase tracking-wide">
        The Race
      </h2>
      <p className="text-xs text-slate-400 -mt-1">
        Real numbers. Real competitors. Here's exactly what it takes to move up.
      </p>
      {gaps.map((gap) =>
        gap.velocity ? (
          <ReviewRaceCard key={gap.id} gap={gap} />
        ) : (
          <GapBar key={gap.id} gap={gap} />
        ),
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component — all data arrives via React Router state
// ---------------------------------------------------------------------------

export default function ResultsScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as CheckupResults | undefined;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [relationship, setRelationship] = useState("owner");
  const [weeklyUpdates, setWeeklyUpdates] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);

  // Oz Pearlman sequential reveal: score first, then competitors, then finding, then gate
  const [revealStage, setRevealStage] = useState(0);
  useEffect(() => {
    // Stage 0: score ring (immediate)
    // Stage 1: competitors + diagnostic (after 2s)
    // Stage 2: sub-scores + gaps (after 4s)
    // Stage 3: findings + gate (after 6s)
    const timers = [
      setTimeout(() => setRevealStage(1), 2000),
      setTimeout(() => setRevealStage(2), 4000),
      setTimeout(() => setRevealStage(3), 6000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  // Vendor path state
  const [vendorEmail, setVendorEmail] = useState("");
  const [vendorEmailError, setVendorEmailError] = useState("");
  const [vendorWantsMore, setVendorWantsMore] = useState(true);
  const [vendorSubmitted, setVendorSubmitted] = useState(false);
  const [vendorShareCopied, setVendorShareCopied] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const isValidEmail = (v: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

  // Common email domain typos that cause delivery failure
  const EMAIL_TYPO_MAP: Record<string, string> = {
    "gmial.com": "gmail.com", "gamil.com": "gmail.com", "gmai.com": "gmail.com",
    "gnail.com": "gmail.com", "gmaill.com": "gmail.com", "gmail.co": "gmail.com",
    "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com", "yhaoo.com": "yahoo.com",
    "hotmal.com": "hotmail.com", "hotmial.com": "hotmail.com",
    "outloo.com": "outlook.com", "outlok.com": "outlook.com",
    "icoud.com": "icloud.com", "iclould.com": "icloud.com",
  };
  const suggestEmailFix = (v: string): string | null => {
    const domain = v.trim().split("@")[1]?.toLowerCase();
    if (domain && EMAIL_TYPO_MAP[domain]) {
      return v.trim().replace(/@.*$/, `@${EMAIL_TYPO_MAP[domain]}`);
    }
    return null;
  };
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);

  // Track: checkup.gate_viewed (fires once when results render)
  useEffect(() => {
    if (!state?.place || !state?.score) return;
    trackEvent("checkup.gate_viewed", {
      score: state.score.composite,
      blur_gate_cta_text: state.topCompetitor
        ? state.score.composite >= 80
          ? `You're ahead, but ${state.topCompetitor.name} is closing the gap.`
          : `See why ${state.topCompetitor.name} ranks above you in ${state.place.city || "your market"}.`
        : `Competitive breakdown for ${state.place.city || "your market"}.`,
    });
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Redirect if no data (user navigated directly)
  if (!state?.place || !state?.score) {
    return <Navigate to="/checkup" replace />;
  }

  const { place, score, topCompetitor, findings, totalImpact: _totalImpact, market } = state;

  // Non-local business detection: software companies, online-only, no meaningful GBP
  const NON_LOCAL_TYPES = ["software_company", "corporate_office", "headquarters"];
  const NON_LOCAL_CATEGORIES = ["software", "technology", "saas", "emr", "erp", "crm", "app"];
  const isNonLocal = (() => {
    const cat = (place.category || "").toLowerCase();
    const types = (place.types || []).map((t: string) => t.toLowerCase());
    if (NON_LOCAL_TYPES.some(t => types.includes(t))) return true;
    if (NON_LOCAL_CATEGORIES.some(c => cat.includes(c))) return true;
    // If no competitors found AND no reviews AND no rating, likely not a local service business
    if (market && market.totalCompetitors === 0 && !place.reviewCount && !place.rating) return true;
    return false;
  })();

  // Honest gate for non-local businesses
  if (isNonLocal) {
    return (
      <div className="w-full max-w-md mt-2 sm:mt-6 space-y-6 pb-6 text-center">
        <div className="card-primary p-8">
          <div className="w-14 h-14 rounded-2xl bg-[#D56753]/8 flex items-center justify-center mx-auto mb-5">
            <Globe className="w-6 h-6 text-[#D56753]" />
          </div>
          <h2 className="text-xl font-bold text-[#1A1D23] font-heading">
            We built this for local service businesses.
          </h2>
          <p className="text-sm text-[#1A1D23]/60 mt-4 leading-relaxed">
            Alloro reads local markets: competitors, reviews, visibility, referral patterns.
            {place.name} looks like it operates differently, and we don't want to give you
            data that isn't useful.
          </p>
          <p className="text-sm text-[#1A1D23]/60 mt-3 leading-relaxed">
            If we're wrong about this, or if you'd like to know when Alloro
            supports your type of business, we'd genuinely like to hear from you.
          </p>
          <a
            href={`mailto:corey@getalloro.com?subject=${encodeURIComponent(place.name + " - Alloro Checkup")}&body=${encodeURIComponent("Hi Corey,\n\nI tried the checkup for " + place.name + " and got the non-local business message. Here's what I was hoping to learn:\n\n")}`}
            className="btn-primary btn-press inline-flex items-center gap-2 mt-6"
          >
            Tell us what you were looking for
            <ArrowRight className="w-4 h-4" />
          </a>
          <p className="text-xs text-[#1A1D23]/30 mt-4">
            Corey reads every one of these personally.
          </p>
        </div>

        <Link
          to="/checkup"
          className="text-sm text-[#D56753] font-medium hover:underline"
        >
          Try a different business
        </Link>
      </div>
    );
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (emailSending) return;

    // Validate
    let hasError = false;
    if (!isValidEmail(email)) {
      setEmailError("Please enter a valid email address.");
      hasError = true;
    } else {
      setEmailError("");
    }
    if (password.length < 8) {
      setPasswordError("Use at least 8 characters.");
      hasError = true;
    } else {
      setPasswordError("");
    }
    if (hasError) return;

    setEmailSending(true);

    // Step 1: Create account via Checkup gate endpoint (no email verification)
    let referralCode: string | null = null;
    try {
      const createRes = await withTimeout(
        fetch("/api/checkup/create-account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim(),
            password,
            practice_name: place.name,
            place_id: place.placeId,
            relationship,
            agreedToTerms,
            checkup_score: score.composite,
            source_channel: getSourceChannel() || new URLSearchParams(window.location.search).get("ref") || undefined,
            checkup_data: {
              score,
              topCompetitor: topCompetitor || null,
              market: market || null,
              findings: findings || [],
              ozMoments: state.ozMoments || [],
              place: { rating: place.rating, category: place.category, types: place.types },
              placeId: place.placeId || null,
              reviewCount: place.reviewCount || 0,
            },
          }),
        }),
        10000
      );

      if (!createRes) {
        setEmailError("Connection timed out. Check your WiFi and try again.");
        setEmailSending(false);
        return;
      }

      const createData = await createRes.json();

      if (!createRes.ok || !createData.success) {
        if (createData.existingAccount) {
          setEmailError("Welcome back! You already have an account.");
          setEmailSending(false);
          return;
        }
        setEmailError(createData.error || "We couldn't create your account. Check your email and password, then try again.");
        setEmailSending(false);
        return;
      }

      // Store token -- user is now logged in
      if (createData.token) {
        localStorage.setItem("auth_token", createData.token);
        localStorage.setItem("token", createData.token);
      }
      referralCode = createData.referralCode || null;
    } catch {
      setEmailError("Something went wrong. Please try again.");
      setEmailSending(false);
      return;
    }

    // Mark gate as complete — unblurs findings, shows share UI
    setEmailSubmitted(true);
    setEmailSending(false);

    // Step 2: Fire email send in background (5s timeout, fire-and-forget)
    withTimeout(
      sendCheckupEmail({
        email: email.trim(),
        practiceName: place.name,
        city: place.city || "",
        compositeScore: score.composite,
        topCompetitorName: topCompetitor?.name || null,
        topCompetitorReviews: topCompetitor?.reviewCount || null,
        practiceReviews: place.reviewCount,
        finding: findings[0]?.detail || "",
        rank: market?.rank || 0,
        totalCompetitors: market?.totalCompetitors || 0,
      }),
      5000
    ).catch(() => {});

    // Step 3: Track event
    trackEvent("checkup.email_captured", {
      score: score.composite,
      specialty: place.category,
      city: place.city,
      ref_code: state.refCode || null,
      gate_relationship: relationship,
      weekly_updates: weeklyUpdates,
      intent: state.intent || null,
    });

    // Step 4: Trigger build (5s timeout, fire-and-forget)
    withTimeout(
      triggerBuild({
        email: email.trim(),
        placeId: place.placeId,
        practiceName: place.name,
        specialty: place.category || "",
        city: place.city || "",
      }),
      5000
    ).catch(() => {});

    // Step 5: Route through BuildingScreen (brand moment), then auto-nav to share screen
    setTimeout(() => navigate("/checkup/building", {
      replace: true,
      state: {
        practiceName: place.name,
        specialty: place.category || "",
        email: email.trim(),
        referralCode,
        checkupScore: score.composite,
      },
    }), 500);
  };

  // Blur gate CTA -- named competitor, named city (40-60% higher conversion per Unbounce/Optimizely)
  const cityLabel = place.city || "your market";

  return (
    <div className="w-full max-w-md mt-2 sm:mt-6 space-y-7 pb-6">
      {/* Intent context chip */}
      {state.intent && (
        <div className="text-center">
          <span className="inline-block text-xs font-semibold text-[#1A1D23]/60 bg-[#212D40]/4 border border-[#212D40]/10 rounded-full px-3.5 py-1.5">
            {state.intent}
          </span>
        </div>
      )}

      {/* Practice name + market context */}
      <div className="text-center">
        <p className="text-xs font-semibold tracking-widest text-[#D56753] uppercase mb-2">
          How You Stack Up
        </p>
        <h2 className="text-2xl font-semibold text-[#1A1D23]">{place.name}</h2>
        {market && market.totalCompetitors > 0 && (
          <p className="text-sm text-slate-400 mt-1.5">
            vs. {market.totalCompetitors} competitors in {market.city}
          </p>
        )}
        {market && market.totalCompetitors === 0 && state.competitors && state.competitors.length > 0 && (
          <p className="text-sm text-emerald-600 mt-1.5 font-medium">
            Only {place.category || "specialist"} in {market.city}. {state.competitors.length} nearby businesses are your referral market.
          </p>
        )}
        {market && market.totalCompetitors === 0 && (!state.competitors || state.competitors.length === 0) && (
          <p className="text-sm text-slate-400 mt-1.5">
            Scanning your market. Connect Google for deeper competitive intelligence.
          </p>
        )}
      </div>

      {/* Composite Score Ring — larger, more prominent */}
      <div className="flex justify-center py-2">
        <ScoreRing score={score.composite} size={180} strokeWidth={12} />
      </div>
      <ScoreCelebrationText score={score.composite} />

      {/* Stage 1: Diagnostic sentence — the difference between a number and a diagnosis */}
      {revealStage >= 1 && market && market.rank === 1 && topCompetitor && (
        <p className="text-sm text-emerald-700 text-center leading-relaxed -mt-2 font-medium">
          <span className="font-semibold">{place.name}</span> is #1 in {market.city}.
          {place.reviewCount > topCompetitor.reviewCount
            ? ` ${place.reviewCount - topCompetitor.reviewCount} reviews ahead of ${topCompetitor.name}.`
            : ` ${topCompetitor.name} is close behind.`}
        </p>
      )}
      {market && topCompetitor && market.rank > 1 && topCompetitor.reviewCount > place.reviewCount && (
        <p className="text-sm text-slate-600 text-center leading-relaxed -mt-2">
          <span className="font-semibold text-[#1A1D23]">{place.name}</span> ranks
          #{market.rank} in {market.city}.{" "}
          {topCompetitor.name} has{" "}
          <span className="font-semibold text-[#D56753]">
            {topCompetitor.reviewCount - place.reviewCount} more review{topCompetitor.reviewCount - place.reviewCount !== 1 ? "s" : ""}
          </span>.
          Here's the one move that changes it.
        </p>
      )}

      {/* Sub-scores — First Impression breakdown */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.06)] space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Behind the Score</p>
          {state.scoreLabel && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              score.composite >= 80 ? "bg-emerald-50 text-emerald-700" :
              score.composite >= 60 ? "bg-blue-50 text-blue-700" :
              score.composite >= 40 ? "bg-amber-50 text-amber-700" :
              "bg-red-50 text-red-700"
            }`}>{state.scoreLabel}</span>
          )}
        </div>

        {/* Trust Signal */}
        <div className="space-y-2">
          <SubScoreBar label="Trust Signal" score={score.trustSignal ?? score.localVisibility} maxScore={30} icon={Shield} />
          <p className="text-xs text-slate-500 leading-relaxed pl-11">
            {place.rating ? (
              <>
                Your <span className="font-semibold text-slate-700">{place.rating}-star rating</span> with{" "}
                <span className="font-semibold text-slate-700">{place.reviewCount} review{place.reviewCount !== 1 ? "s" : ""}</span>.
                {market && market.avgRating > 0 && (
                  place.rating >= market.avgRating
                    ? <> People see a rating above the {market.city} average of {market.avgRating.toFixed(1)}.</>
                    : <> The {market.city} average is {market.avgRating.toFixed(1)}. Every improvement matters.</>
                )}
              </>
            ) : (
              <>Rating and review data is being analyzed.</>
            )}
          </p>
        </div>

        {/* First Impression */}
        <div className="space-y-2">
          <SubScoreBar label="First Impression" score={score.firstImpression ?? score.onlinePresence} maxScore={30} icon={Image} />
          <p className="text-xs text-slate-500 leading-relaxed pl-11">
            Photos, business hours, contact info, and description completeness.
            {!place.websiteUri && <> No website linked on your profile, which reduces trust.</>}
            {" "}People decide in seconds whether to call or scroll past.
          </p>
        </div>

        {/* Responsiveness */}
        <div className="space-y-2">
          <SubScoreBar label="Responsiveness" score={score.responsiveness ?? score.reviewHealth} maxScore={20} icon={Reply} />
          <p className="text-xs text-slate-500 leading-relaxed pl-11">
            How actively you engage with reviews. People notice when owners respond, especially to negative feedback.
          </p>
        </div>

        {/* Competitive Edge */}
        <div className="space-y-2">
          <SubScoreBar label="Competitive Edge" score={score.competitiveEdge ?? 10} maxScore={20} icon={Swords} />
          <p className="text-xs text-slate-500 leading-relaxed pl-11">
            {state.competitiveDataLimited ? (
              <>Competitive data limited in your area. This score reflects your profile strength alone.</>
            ) : market && market.totalCompetitors > 0 ? (
              <>
                How you compare to <span className="font-semibold text-slate-700">{market.totalCompetitors}</span> nearby alternatives.
                {topCompetitor && <> <span className="font-semibold text-slate-700">{topCompetitor.name}</span> is the closest comparison.</>}
              </>
            ) : (
              <>Profile strength score. Connect your account for competitive intelligence.</>
            )}
          </p>
        </div>
      </div>

      {/* Transparency — what this score is based on */}
      <p className="text-xs text-slate-400 text-center leading-relaxed -mt-3">
        Based on public Google data{market?.totalCompetitors ? ` and ${market.totalCompetitors} nearby alternatives` : ""}.
        {" "}A full audit with connected accounts reveals more.
      </p>

      {/* ═══ OZ MOMENTS: The jaw-drop insights from combined data ═══ */}
      {/* These use progressive specificity: named competitor + specific number + consequence.
          The goal: make the person stop scrolling and think "how did they know that?" */}
      {/* Oz Pearlman moments: the "how did they know that?" reveal */}
      {revealStage >= 1 && state.ozMoments && state.ozMoments.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D56753]/70">
            The pattern we spotted
          </p>
          {state.ozMoments.map((moment, i) => (
            <div
              key={i}
              className={`rounded-2xl bg-[#212D40] p-5 space-y-2.5 transition-all duration-700 shadow-lg ${
                revealStage >= 2 ? "opacity-100 translate-y-0" : i === 0 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
              style={{ animation: `fade-in-up 0.5s ease-out ${i * 0.15}s both` }}
            >
              <p className="text-[15px] font-bold text-white leading-snug">
                {moment.hook}
              </p>
              <p className="text-sm text-white/60 leading-relaxed">
                {moment.implication}
              </p>
              <div className="pt-2 border-t border-white/8">
                <p className="text-xs text-[#D56753] font-semibold">
                  {moment.action}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Share prompt — right after Oz moments, when the impulse is strongest.
           Oz principle: the share is the user's own idea, not an ask. */}
      <div className="bg-[#212D40] rounded-2xl p-5 flex flex-col sm:flex-row items-center gap-4">
        <div className="flex-1 text-center sm:text-left">
          <p className="text-sm font-semibold text-white">
            Know someone who should see their market?
          </p>
          <p className="text-xs text-white/50 mt-1">
            Send them a link to run their own scan. No names shared.
          </p>
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              const res = await fetch("/api/checkup/share", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  score: score.composite,
                  city: place?.city,
                  rank: market?.rank,
                  totalCompetitors: market?.totalCompetitors,
                  topCompetitorName: topCompetitor?.name,
                  specialty: place?.category,
                }),
              });
              const data = await res.json();
              if (data.success && data.shareUrl) {
                await navigator.clipboard.writeText(data.shareUrl);
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2000);
              }
            } catch {
              const base = window.location.origin;
              const shareUrl = state.refCode
                ? `${base}/checkup?ref=${state.refCode}`
                : `${base}/checkup`;
              navigator.clipboard.writeText(shareUrl).then(() => {
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2000);
              }).catch(() => {});
            }
          }}
          className="shrink-0 flex items-center gap-2 text-sm font-semibold text-[#1A1D23] bg-white rounded-lg px-5 py-2.5 hover:bg-gray-50 active:scale-[0.98] transition-all"
        >
          <Share2 className="w-3.5 h-3.5" />
          {linkCopied ? "Copied!" : "Share and split the check"}
        </button>
      </div>

      {/* Gap Progress Bars — concrete closeable units */}
      {state.gaps && state.gaps.length > 0 && (
        <GapSection gaps={state.gaps} />
      )}

      {/* Viral Loop: Send competitors their free checkup */}
      {state.competitors && state.competitors.length > 0 && (
        <CompetitorInviteSection
          competitors={state.competitors}
          senderName={state.place?.name || ""}
        />
      )}

      {/* Findings — first visible, rest blurred */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-[#1A1D23] uppercase tracking-wide">Key Findings</h2>
        {state.userQuestion && (
          <div className="bg-[#D56753]/5 border border-[#D56753]/15 rounded-xl px-4 py-3 text-sm text-[#1A1D23]">
            You asked: &ldquo;{state.userQuestion}&rdquo;. Here&apos;s what we found.
          </div>
        )}
        {/* Show first 2 findings + 1 Oz moment free (the "That's Right" value).
            Remaining findings blurred until email. No dollar impact shown --
            facts are more honest than estimates. */}
        {findings.map((f, i) => (
          <FindingCard
            key={f.type}
            finding={{...f, impact: 0}}
            blurred={i > 1 && !emailSubmitted}
          />
        ))}
      </div>

      {/* Blur Gate — Voss-style: they're receiving something, not being extracted from.
          Frame as delivery, not transaction. "Your full checkup is ready." */}
      {!emailSubmitted ? (
        <div className="bg-gradient-to-br from-white to-[#FFF9F7] border-2 border-[#D56753]/20 rounded-2xl p-7 shadow-warm-lg">
          <div className="mb-4">
            <p className="text-base font-bold text-[#1A1D23] font-heading">
              Your full checkup is ready.
            </p>
            <p className="text-sm text-[#1A1D23]/50 mt-1">
              {topCompetitor
                ? `See the complete ${place.name} vs ${topCompetitor.name} breakdown with your action plan.`
                : `See your complete ${cityLabel || "market"} analysis with your action plan.`}
            </p>
          </div>
          {market && market.totalCompetitors > 3 && (
            <p className="text-xs text-slate-400 mb-4 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {market.totalCompetitors} businesses in {market.city} are in this market. Intelligence is how you stay ahead.
            </p>
          )}
          <form onSubmit={handleEmailSubmit} className="space-y-3">
            {/* Email */}
            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailError(""); setEmailSuggestion(suggestEmailFix(e.target.value)); }}
                onBlur={() => setEmailSuggestion(suggestEmailFix(email))}
                placeholder="Your email"
                autoComplete="email"
                required
                className={`w-full h-10 sm:h-12 px-3 sm:px-4 rounded-xl border text-sm sm:text-base text-[#1A1D23] placeholder:text-slate-400 focus:outline-none focus:ring-4 transition-all duration-200 ${
                  emailError
                    ? "border-red-400 focus:border-red-400 focus:ring-red-400/10 bg-red-50/30"
                    : "border-[#D56753]/15 bg-white focus:border-[#D56753] focus:ring-[#D56753]/10"
                }`}
              />
              {emailSuggestion && (
                <button
                  type="button"
                  onClick={() => { setEmail(emailSuggestion); setEmailSuggestion(null); }}
                  className="text-xs text-[#D56753] mt-1 hover:underline"
                >
                  Did you mean {emailSuggestion}?
                </button>
              )}
              {emailError && (
                <p className="text-xs text-red-500 mt-1">
                  {emailError.includes("already") ? (
                    <>You already have an account. <Link to="/signin" className="font-semibold text-[#D56753] underline">Sign in here &rarr;</Link></>
                  ) : emailError}
                </p>
              )}
            </div>
            {/* Password — creates account directly */}
            <div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setPasswordError(""); }}
                  placeholder="Create a password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={`w-full h-10 sm:h-12 px-3 sm:px-4 pr-10 rounded-xl bg-slate-50 border text-sm sm:text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 transition-colors ${
                    passwordError
                      ? "border-red-400 focus:border-red-400 focus:ring-red-400/10"
                      : "border-slate-200 focus:border-[#D56753] focus:ring-[#D56753]/10"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              </div>
              {passwordError && (
                <p className="text-xs text-red-500 mt-1">{passwordError}</p>
              )}
            </div>
            {/* Relationship — spec: owner/vendor/other */}
            <fieldset className="space-y-1">
              <legend className="text-xs font-medium text-slate-600 mb-1.5">
                Are you the owner or manager of this business?
              </legend>
              {[
                { value: "owner", label: "Yes, I'm the owner or manager" },
                { value: "vendor", label: "I provide services to this business" },
                { value: "other", label: "Other" },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-3 cursor-pointer py-1.5"
                >
                  <input
                    type="radio"
                    name="relationship"
                    value={opt.value}
                    checked={relationship === opt.value}
                    onChange={(e) => setRelationship(e.target.value)}
                    className="w-5 h-5 text-[#D56753] border-slate-300 focus:ring-[#D56753]/20"
                  />
                  <span className="text-sm text-slate-700">{opt.label}</span>
                </label>
              ))}
            </fieldset>
            {/* VENDOR PATH: show share flow instead of account creation */}
            {relationship === "vendor" ? (
              <div className="space-y-3 pt-2 border-t border-slate-100">
                {!vendorSubmitted ? (
                  <>
                    <p className="text-xs text-slate-600">
                      Your email, so we can notify you if this business's results change.
                    </p>
                    <input
                      type="email"
                      value={vendorEmail}
                      onChange={(e) => { setVendorEmail(e.target.value); setVendorEmailError(""); }}
                      placeholder="Your email"
                      className={`w-full h-10 sm:h-12 px-3 sm:px-4 rounded-xl bg-slate-50 border text-sm sm:text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 transition-colors ${
                        vendorEmailError ? "border-red-400 focus:ring-red-400/10" : "border-slate-200 focus:border-[#D56753] focus:ring-[#D56753]/10"
                      }`}
                    />
                    {vendorEmailError && <p className="text-xs text-red-500">{vendorEmailError}</p>}
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={vendorWantsMore}
                        onChange={(e) => setVendorWantsMore(e.target.checked)}
                        className="w-4 h-4 rounded text-[#D56753] border-slate-300 focus:ring-[#D56753]/20"
                      />
                      <span className="text-xs text-slate-600">I'd like to run a Checkup for my other locations</span>
                    </label>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!isValidEmail(vendorEmail)) {
                          setVendorEmailError("Enter a valid email.");
                          return;
                        }
                        // Save vendor to backend
                        fetch("/api/checkup/vendor", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            email: vendorEmail.trim(),
                            referring_place_id: place.placeId,
                            wants_checkup_for_other_locations: vendorWantsMore,
                          }),
                        }).catch(() => {});
                        setVendorSubmitted(true);
                      }}
                      className="w-full h-12 flex items-center justify-center gap-2 rounded-xl bg-[#D56753] text-white text-sm font-semibold hover:brightness-105 active:scale-[0.98] transition-all"
                    >
                      Get share link
                    </button>
                  </>
                ) : (
                  <>
                    <div className="bg-slate-50 rounded-xl p-4">
                      <p className="text-sm text-slate-700 leading-relaxed">
                        I ran <strong>{place.name}</strong> through Alloro's competitive analysis
                        and thought you'd want to see what I found.
                      </p>
                      <p className="text-xs text-[#D56753] font-medium mt-2">
                        {window.location.origin}/checkup
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/checkup`).then(() => {
                          setVendorShareCopied(true);
                          setTimeout(() => setVendorShareCopied(false), 2000);
                        });
                      }}
                      className="w-full h-12 flex items-center justify-center gap-2 rounded-xl border-2 border-[#212D40]/20 text-[#1A1D23] text-sm font-semibold hover:border-[#212D40]/40 transition-all"
                    >
                      {vendorShareCopied ? "Copied!" : "Copy link"}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <>
                {/* OWNER/OTHER PATH: account creation */}
                {/* Weekly updates checkbox */}
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={weeklyUpdates}
                    onChange={(e) => setWeeklyUpdates(e.target.checked)}
                    className="w-4 h-4 rounded text-[#D56753] border-slate-300 focus:ring-[#D56753]/20"
                  />
                  <span className="text-xs text-slate-600">Send me a weekly update on my score and competitors</span>
                </label>
                {topCompetitor && (
                  <p className="text-xs text-slate-400">
                    Includes detailed comparison with {topCompetitor.name}
                    {findings.length > 1 &&
                      ` and ${findings.length - 1} more finding${findings.length > 2 ? "s" : ""}`}
                  </p>
                )}
                {/* Terms of Service agreement */}
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-[#D56753] border-slate-300 focus:ring-[#D56753]/20"
                  />
                  <span className="text-xs text-slate-600">
                    I agree to the{" "}
                    <a href="https://getalloro.com/terms" target="_blank" rel="noopener noreferrer" className="text-[#D56753] underline hover:text-[#C45A46]">
                      Terms of Service
                    </a>{" "}
                    and{" "}
                    <a href="https://getalloro.com/privacy" target="_blank" rel="noopener noreferrer" className="text-[#D56753] underline hover:text-[#C45A46]">
                      Privacy Policy
                    </a>
                  </span>
                </label>
                <button
                  type="submit"
                  disabled={emailSending || !agreedToTerms}
                  className="w-full h-[3.25rem] flex items-center justify-center gap-2 rounded-xl text-white text-[15px] font-semibold shadow-[0_4px_16px_rgba(214,104,83,0.3),0_2px_4px_rgba(214,104,83,0.15)] hover:shadow-[0_8px_24px_rgba(214,104,83,0.35),0_2px_8px_rgba(214,104,83,0.2)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-200 disabled:opacity-70"
                  style={{ background: agreedToTerms ? 'linear-gradient(135deg, #D66853 0%, #C45A46 100%)' : '#94a3b8' }}
                >
                  {emailSending
                    ? "Setting up your checkup..."
                    : "See my full checkup results"}
                  {!emailSending && <ArrowRight className="w-4 h-4" />}
                </button>
              </>
            )}
          </form>
          {/* Trust signals -- 15-42% conversion lift per Baymard Institute */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mt-5">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Lock className="w-3 h-3" /> No credit card
            </span>
            <span className="text-xs text-slate-400">
              Cancel anytime
            </span>
            <span className="text-xs text-slate-400">
              Your data stays yours
            </span>
          </div>
          <p className="text-xs text-slate-300 text-center mt-2 leading-relaxed">
            Built on Claude by Anthropic. Your data is never sold or shared.
          </p>
        </div>
      ) : (
        <>
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
          <p className="text-base font-semibold text-emerald-900 mt-2">
            Full report unlocked
          </p>
          <p className="text-sm text-emerald-700 mt-1">
            We&apos;ll send a detailed breakdown to {email}
          </p>
        </div>

        {/* ═══ SHAREABLE SCORE CARD — the Spotify Wrapped artifact ═══ */}
        {/* Designed for screenshots. The visual that gets texted to colleagues. */}
        <div className="rounded-2xl overflow-hidden shadow-lg">
          <div className="bg-[#212D40] p-6 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/30 mb-3">
              Business Clarity Score
            </p>
            <p className="text-5xl font-semibold text-white">{score.composite}</p>
            <p className="text-sm font-semibold text-white/60 mt-1">{place.name}</p>
            {market && (
              <p className="text-xs text-white/30 mt-1">
                #{market.rank} of {market.totalCompetitors} in {market.city}
              </p>
            )}
          </div>
          {state.ozMoments && state.ozMoments[0] && (
            <div className="bg-[#D56753] px-6 py-4">
              <p className="text-sm font-semibold text-white leading-snug">
                {state.ozMoments[0].hook}
              </p>
            </div>
          )}
          <div className="bg-[#1a2533] px-6 py-3 flex items-center justify-between">
            <p className="text-xs text-white/25">getalloro.com/checkup</p>
            <p className="text-xs font-bold text-white/25 tracking-wider">ALLORO</p>
          </div>
        </div>

        {/* Share prompt — viral loop */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Share2 className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">
              Know a colleague who should see their market?
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Send them a link. When they join, you both split month one.
          </p>
          <button
            type="button"
            onClick={async () => {
              try {
                const res = await fetch("/api/checkup/share", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    score: state.score?.composite,
                    city: state.place?.city,
                    rank: state.market?.rank,
                    totalCompetitors: state.market?.totalCompetitors,
                    topCompetitorName: state.topCompetitor?.name,
                    specialty: state.place?.category,
                  }),
                });
                const data = await res.json();
                if (data.success && data.shareUrl) {
                  await navigator.clipboard.writeText(data.shareUrl);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2000);
                }
              } catch {
                // Fallback to generic link
                const base = window.location.origin;
                const shareUrl = state.refCode
                  ? `${base}/checkup?ref=${state.refCode}`
                  : `${base}/checkup`;
                navigator.clipboard.writeText(shareUrl).then(() => {
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2000);
                });
              }
            }}
            className="flex items-center gap-2 text-sm font-medium text-[#1A1D23] border border-[#212D40]/20 rounded-lg px-4 py-2.5 hover:border-[#212D40]/40 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            {linkCopied ? "Copied!" : "Share and split the check"}
          </button>
        </div>
        </>
      )}
    </div>
  );
}
