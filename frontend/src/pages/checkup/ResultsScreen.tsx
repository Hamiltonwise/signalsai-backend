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
  Image,
  Reply,
} from "lucide-react";
import type { PlaceDetails } from "../../api/places";
import { sendCheckupEmail, triggerBuild, createCompetitorInvite } from "../../api/checkup";
import { trackEvent, getSessionId } from "../../api/tracking";
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
    // Three-score model (April 3 2026)
    googlePosition?: number;
    reviewHealth?: number;
    gbpCompleteness?: number;
    // Legacy aliases (backwards compatibility with stored data)
    trustSignal?: number;
    firstImpression?: number;
    responsiveness?: number;
    competitiveEdge?: number;
    localVisibility?: number;
    onlinePresence?: number;
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

// getScoreLabel removed: no composite scores displayed per Known 6.

// ScoreRing, ScoreCelebrationText, SubScoreBar removed.
// Checkup now shows readings with verification links per Known 1, 6, 7.

// Score Ring and Celebration Text removed per Known 6 (no composite scores).

// SubScoreBar removed per Known 6 (no sub-score bars with X/maxScore).

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
            : "bg-stone-50/80 border border-[#D56753]/10 hover:border-[#D56753]/20"
      } ${blurred ? "select-none" : ""}`}
    >
      {blurred && (
        <div className="absolute inset-0 backdrop-blur-[6px] bg-[#F8F6F2]/60 rounded-xl z-10" />
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
    <div className={`rounded-xl border p-5 ${isLeading ? "border-emerald-200 bg-emerald-50/50" : "border-[#D56753]/20 bg-stone-50/80"}`}>
      {/* Race header */}
      <p className={`text-sm font-semibold leading-snug ${isLeading ? "text-emerald-800" : "text-[#1A1D23]"}`}>
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
            <p className="text-base sm:text-lg font-semibold text-[#1A1D23] tabular-nums">{v.clientWeekly}</p>
            <p className="text-xs text-slate-400 leading-tight">Your pace</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-2 sm:p-2.5 text-center">
            <p className="text-base sm:text-lg font-semibold text-slate-500 tabular-nums">{v.competitorWeekly}</p>
            <p className="text-xs text-slate-400 leading-tight">Their pace</p>
          </div>
          <div className={`rounded-lg p-2 sm:p-2.5 text-center ${v.weeksToPass ? "bg-[#D56753]/5" : "bg-emerald-50"}`}>
            <p className={`text-base sm:text-lg font-semibold tabular-nums ${v.weeksToPass ? "text-[#D56753]" : "text-emerald-600"}`}>
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
                <p className="text-xs font-semibold text-[#1A1D23]">
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
    <div className="bg-stone-50/80 border border-stone-200/60 rounded-xl p-4">
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
          <span className="text-xs font-semibold text-[#1A1D23] shrink-0 tabular-nums">
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
            title: `${competitor.name}, see how they compare`,
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
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
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
                  : "Show them how they compare"}
            </button>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-3">
        They'll see their own results. Your data is never shared.
      </p>
    </div>
  );
}

function GapSection({ gaps }: { gaps: CheckupGapItem[] }) {
  if (!gaps || gaps.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-[#1A1D23] uppercase tracking-wide">
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

  // Target competitor: "Who do you want to beat?"
  // Pre-selects topCompetitor from the scan. Client can change it.
  const [selectedCompetitor, setSelectedCompetitor] = useState<{
    name: string;
    placeId: string;
  } | null>(null);

  // Initialize selectedCompetitor from topCompetitor on first render
  useEffect(() => {
    if (state?.topCompetitor && !selectedCompetitor) {
      setSelectedCompetitor({
        name: state.topCompetitor.name,
        placeId: state.topCompetitor.placeId,
      });
    }
  }, [state?.topCompetitor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Oz Pearlman sequential reveal: Oz moments first, then readings, then race, then gate
  const [revealStage, setRevealStage] = useState(0);
  useEffect(() => {
    // Stage 0: name + Oz moments (immediate)
    // Stage 1: readings + competitor context (1.5s)
    // Stage 2: gaps + race bars (3s)
    // Stage 3: findings + gate (4.5s)
    const timers = [
      setTimeout(() => setRevealStage(1), 1500),
      setTimeout(() => setRevealStage(2), 3000),
      setTimeout(() => setRevealStage(3), 4500),
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
          : `See how ${state.topCompetitor.name} compares to you in ${state.place.city || "your market"}.`
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
          <h2 className="text-xl font-semibold text-[#1A1D23] font-heading">
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
            session_id: getSessionId(),
            source_channel: getSourceChannel() || undefined,
            ref_code: state.refCode || new URLSearchParams(window.location.search).get("ref") || undefined,
            // Target competitor: the client's answer to "who do you want to beat?"
            target_competitor: selectedCompetitor || undefined,
            checkup_data: {
              score,
              topCompetitor: topCompetitor || null,
              market: market || null,
              findings: findings || [],
              ozMoments: state.ozMoments || [],
              place: {
                rating: place.rating,
                category: place.category,
                types: place.types,
                phone: place.phone || null,
                websiteUri: place.websiteUri || null,
                regularOpeningHours: place.regularOpeningHours || null,
                editorialSummary: place.editorialSummary || null,
                photosCount: place.photos?.length || 0,
              },
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
      setEmailError("That didn't work. Try again in a moment.");
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
        businessName: place.name,
        specialty: place.category || "",
        email: email.trim(),
        referralCode,
        checkupScore: score.composite,
        topCompetitorName: topCompetitor?.name || null,
        reviewGap: topCompetitor ? Math.max(0, topCompetitor.reviewCount - place.reviewCount) : null,
        city: place.city || null,
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
          <span className="inline-block text-xs font-semibold text-[#1A1D23]/60 bg-[#1A1D23]/4 border border-[#1A1D23]/10 rounded-full px-3.5 py-1.5">
            {state.intent}
          </span>
        </div>
      )}

      {/* Practice name + market context */}
      <div className="text-center">
        <p className="text-xs font-semibold tracking-widest text-[#D56753] uppercase mb-2">
          Your Market Reading
        </p>
        <h2 className="text-2xl font-semibold text-[#1A1D23]">
          {topCompetitor
            ? `${place.name} vs. ${topCompetitor.name}`
            : place.name}
        </h2>
        {market && market.totalCompetitors > 0 && (
          <p className="text-sm text-slate-400 mt-1.5">
            vs. {market.totalCompetitors} competitors in {market.city || "your market"}
          </p>
        )}
        {market && market.totalCompetitors === 0 && state.competitors && state.competitors.length > 0 && (
          <p className="text-sm text-emerald-600 mt-1.5 font-medium">
            Only {place.category || "specialist"} in {market.city || "your area"}. {state.competitors.length} nearby businesses are your referral market.
          </p>
        )}
        {market && market.totalCompetitors === 0 && (!state.competitors || state.competitors.length === 0) && (
          <p className="text-sm text-slate-400 mt-1.5">
            Scanning your market. Connect Google for deeper competitive intelligence.
          </p>
        )}
      </div>

      {/* ═══ OZ MOMENTS — Lead with the gut punch ═══ */}
      {/* These hit first. Before the readings. Before the data.
          The goal: "how did they know that?" within 10 seconds of seeing results. */}
      {state.ozMoments && state.ozMoments.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D56753]/70">
            What we found
          </p>
          {state.ozMoments.map((moment, i) => (
            <div
              key={i}
              className="rounded-2xl bg-[#212D40] p-5 space-y-2.5 shadow-lg"
              style={{ animation: `fade-in-up 0.5s ease-out ${i * 0.15}s both` }}
            >
              <p className="text-[15px] font-semibold text-white leading-snug">
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

      {/* ═══ HEAD-TO-HEAD — the "oh shit" moment ═══ */}
      {/* This is the centerpiece. Every doctor who scans the QR sees this.
          Side-by-side comparison, not flat reading cards. */}
      <div className={`space-y-4 transition-all duration-700 ${revealStage >= 1 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>

        {/* Matchup card */}
        {topCompetitor && (
          <div className="rounded-2xl overflow-hidden border border-stone-200/60">
            {/* Header bar */}
            <div className="bg-[#212D40] px-5 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/40 text-center">
                Head to Head
              </p>
            </div>

            {/* Side-by-side stats */}
            <div className="bg-stone-50/80 p-5">
              {/* Names row */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 mb-5">
                <div className="text-left">
                  <p className="text-sm font-semibold text-[#1A1D23] leading-snug truncate">{place.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">You</p>
                </div>
                <div className="text-xs font-semibold text-gray-300 uppercase">vs</div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-[#1A1D23] leading-snug truncate">{topCompetitor.name}</p>
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(topCompetitor.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[#D56753] font-semibold mt-0.5 hover:underline"
                  >
                    Verify <Globe className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* Rating comparison */}
              {place.rating != null && (
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-3 border-t border-stone-200/60">
                  <div className="text-left">
                    <p className={`text-2xl font-semibold tabular-nums ${
                      place.rating >= topCompetitor.rating ? "text-emerald-600" : "text-[#1A1D23]"
                    }`}>
                      {place.rating}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Rating</span>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-semibold tabular-nums ${
                      topCompetitor.rating > place.rating ? "text-[#D56753]" : "text-[#1A1D23]"
                    }`}>
                      {topCompetitor.rating}
                    </p>
                  </div>
                </div>
              )}

              {/* Review count comparison */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-3 border-t border-stone-200/60">
                <div className="text-left">
                  <p className={`text-2xl font-semibold tabular-nums ${
                    place.reviewCount >= topCompetitor.reviewCount ? "text-emerald-600" : "text-[#1A1D23]"
                  }`}>
                    {place.reviewCount}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Reviews</span>
                </div>
                <div className="text-right">
                  <p className={`text-2xl font-semibold tabular-nums ${
                    topCompetitor.reviewCount > place.reviewCount ? "text-[#D56753]" : "text-[#1A1D23]"
                  }`}>
                    {topCompetitor.reviewCount}
                  </p>
                </div>
              </div>

              {/* Gap callout */}
              {topCompetitor.reviewCount > place.reviewCount && (() => {
                const reviewGap = topCompetitor.reviewCount - place.reviewCount;
                const reviewRace = state.gaps?.find(g => g.velocity);
                const theirPace = reviewRace?.velocity?.competitorWeekly;
                return (
                  <div className="mt-3 rounded-xl bg-[#D56753]/5 border border-[#D56753]/10 px-4 py-3">
                    <p className="text-sm text-[#1A1D23] leading-relaxed">
                      <span className="font-semibold text-[#D56753]">{reviewGap} review gap</span>.
                      {theirPace && theirPace > 0
                        ? ` They're gaining ~${theirPace} per week. Every week you wait, it gets harder.`
                        : " Every new review they get widens the distance."}
                    </p>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* No competitor: solo reading */}
        {!topCompetitor && place.rating != null && (
          <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-5">
            <div className="flex items-center gap-2 mb-1">
              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
              <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Your Rating</span>
            </div>
            <p className="text-2xl font-semibold text-[#1A1D23]">{place.rating} stars, {place.reviewCount} reviews</p>
          </div>
        )}

        {/* GBP Completeness -- compact inline */}
        {(() => {
          const fields = [
            { name: "phone", has: !!(place.phone || (place as any).nationalPhoneNumber || (place as any).hasPhone) },
            { name: "hours", has: !!(place.regularOpeningHours || (place as any).hasHours) },
            { name: "website", has: !!(place.websiteUri || (place as any).hasWebsite) },
            { name: "photos", has: ((place as any).photosCount || place.photos?.length || 0) > 0 },
            { name: "description", has: !!(place.editorialSummary || (place as any).hasEditorialSummary) },
          ];
          const complete = fields.filter(f => f.has).length;
          const missing = fields.filter(f => !f.has).map(f => f.name);
          return (
            <div className="rounded-xl bg-stone-50/80 border border-stone-200/60 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ring-4 ring-opacity-20 ${
                    complete >= 5 ? "bg-emerald-500 ring-emerald-500" : complete >= 3 ? "bg-amber-400 ring-amber-400" : "bg-red-500 ring-red-500"
                  }`} />
                  <span className="text-sm font-semibold text-[#1A1D23]">Google Profile: {complete}/5</span>
                </div>
                {missing.length > 0 && (
                  <span className="text-xs text-[#D56753] font-semibold">
                    Missing {missing.length}
                  </span>
                )}
              </div>
              {missing.length > 0 && (
                <p className="text-xs text-gray-400 mt-2 ml-7">
                  {missing.join(", ")} {missing.length === 1 ? "is" : "are"} not set up. People searching for you notice.
                </p>
              )}
            </div>
          );
        })()}

        {/* Market context */}
        {market && market.totalCompetitors > 0 && (
          <p className="text-xs text-gray-400 text-center leading-relaxed">
            Based on public Google data for {market.totalCompetitors} {place.category ? place.category.toLowerCase() + "s" : "businesses"} in {market.city}. Every number is verifiable.
          </p>
        )}
      </div>

      {/* ═══ TARGET COMPETITOR PICKER — "Who do you want to beat?" ═══ */}
      {/* Shows when the scan found competitors. Pre-selects the top one.
          One tap to change. This writes target_competitor on account creation
          so the entire system runs against their chosen competitor from day one. */}
      {state.competitors && state.competitors.length > 0 && topCompetitor && (
        <div className={`transition-all duration-700 ${revealStage >= 1 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <div className="rounded-2xl border border-stone-200/60 bg-stone-50/80 p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Who do you want to beat?
            </p>
            <p className="text-xs text-gray-400 mb-4 leading-relaxed">
              Alloro will track this competitor weekly and tell you exactly what to do to close the gap.
            </p>
            <div className="space-y-2">
              {/* Top competitor first, then others */}
              {[topCompetitor, ...state.competitors.filter(c => c.placeId !== topCompetitor.placeId)]
                .slice(0, 5)
                .map((c) => {
                  const isSelected = selectedCompetitor?.placeId === c.placeId;
                  return (
                    <button
                      key={c.placeId}
                      type="button"
                      onClick={() => setSelectedCompetitor({ name: c.name, placeId: c.placeId })}
                      className={`w-full flex items-center justify-between rounded-xl px-4 py-3 text-left transition-all ${
                        isSelected
                          ? "bg-[#D56753]/8 border-2 border-[#D56753]/30"
                          : "bg-[#F0EDE8] border border-stone-200/60 hover:border-stone-300"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold truncate ${isSelected ? "text-[#D56753]" : "text-[#1A1D23]"}`}>
                          {c.name}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {c.reviewCount} reviews, {c.rating} stars
                        </p>
                      </div>
                      {isSelected && (
                        <div className="shrink-0 ml-3 w-5 h-5 rounded-full bg-[#D56753] flex items-center justify-center">
                          <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Gap Progress Bars — concrete closeable units */}
      <div className={`transition-all duration-700 ${revealStage >= 2 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
        {state.gaps && state.gaps.length > 0 && (
          <GapSection gaps={state.gaps} />
        )}
      </div>

      {/* Viral Loop: Send competitors their free checkup */}
      {state.competitors && state.competitors.length > 0 && (
        <CompetitorInviteSection
          competitors={state.competitors}
          senderName={state.place?.name || ""}
        />
      )}

      {/* Findings — first visible, rest blurred */}
      <div className={`space-y-3 transition-all duration-700 ${revealStage >= 3 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
        <h2 className="text-sm font-semibold text-[#1A1D23] uppercase tracking-wide">Key Findings</h2>
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
        <div className={`transition-all duration-700 ${revealStage >= 3 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
        <div className="bg-gradient-to-br from-[#F8F6F2] to-[#FFF9F7] border-2 border-[#D56753]/20 rounded-2xl p-7 shadow-warm-lg">
          <div className="mb-4">
            <p className="text-base font-semibold text-[#1A1D23] font-heading">
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
                    : "border-[#D56753]/15 bg-[#F8F6F2] focus:border-[#D56753] focus:ring-[#D56753]/10"
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
                      className="w-full h-12 flex items-center justify-center gap-2 rounded-xl border-2 border-stone-200/60 text-[#1A1D23] text-sm font-semibold hover:border-stone-300 transition-all"
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
                  <span className="text-xs text-slate-600">Send me a weekly update on my market and competitors</span>
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
              Takes 60 seconds
            </span>
            <span className="text-xs text-slate-400">
              Your data stays yours
            </span>
          </div>
          <p className="text-xs text-slate-300 text-center mt-2 leading-relaxed">
            Built on Claude by Anthropic. Your data is never sold or shared.
          </p>
        </div>
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

        {/* ═══ SHAREABLE CARD — the Spotify Wrapped artifact ═══ */}
        {/* Designed for screenshots. Uses readings, not scores. */}
        <div className="rounded-2xl overflow-hidden shadow-lg">
          <div className="bg-[#212D40] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/30 mb-3 text-center">
              Your Google Health Check
            </p>
            <p className="text-lg font-semibold text-white text-center mb-4">{place.name}</p>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-white/50">Rating</span>
                <span className="text-white font-semibold">{place.rating} stars</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/50">Reviews</span>
                <span className="text-white font-semibold">{place.reviewCount}</span>
              </div>
              {topCompetitor && (
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">{topCompetitor.name}</span>
                  <span className="text-white/70 font-semibold">{topCompetitor.reviewCount} reviews</span>
                </div>
              )}
            </div>
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
            <p className="text-xs font-semibold text-white/25 tracking-wider">ALLORO</p>
          </div>
        </div>

        {/* Share prompt — viral loop */}
        <div className="bg-stone-50/80 border border-stone-200/60 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Share2 className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-[#1A1D23]">
              Know a colleague who should see their market?
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Send them a link. See how your markets compare side by side.
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
            className="flex items-center gap-2 text-sm font-medium text-[#1A1D23] border border-stone-200/60 rounded-lg px-4 py-2.5 hover:border-stone-300 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            {linkCopied ? "Copied!" : "Share your checkup"}
          </button>
        </div>
        </>
      )}
    </div>
  );
}
