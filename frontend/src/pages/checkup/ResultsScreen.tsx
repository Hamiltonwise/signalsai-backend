import { useState, useEffect } from "react";
import { useLocation, useNavigate, Navigate, Link } from "react-router-dom";
import {
  Eye,
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
} from "lucide-react";
import type { PlaceDetails } from "../../api/places";
import { sendCheckupEmail, triggerBuild } from "../../api/checkup";
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
    localVisibility: number;
    onlinePresence: number;
    reviewHealth: number;
  };
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
  refCode?: string;
  intent?: string;
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

function ScoreRing({
  score,
  size = 160,
  strokeWidth = 10,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#f1f5f9"
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
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold text-slate-900">{score}</span>
        <span className={`text-sm font-semibold ${getScoreLabelColor(score)}`}>
          {getScoreLabel(score)}
        </span>
      </div>
    </div>
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
      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-slate-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-slate-700">{label}</span>
          <span className="text-sm font-semibold text-slate-900">
            {score}/{maxScore}
          </span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
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
    finding.type.includes("lead") || finding.type.includes("strong");
  const isSentiment = finding.type === "sentiment_insight";
  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    review_gap: MessageSquare,
    review_lead: MessageSquare,
    rating_gap: Star,
    rating_strong: Star,
    market_rank: MapPin,
    sentiment_insight: Zap,
  };
  const Icon = iconMap[finding.type] || Target;

  return (
    <div
      className={`relative ${isSentiment ? "bg-[#212D40] border-[#212D40]" : "bg-white border-slate-200"} border rounded-xl p-4 ${blurred ? "select-none" : ""}`}
    >
      {blurred && (
        <div className="absolute inset-0 backdrop-blur-[6px] bg-white/60 rounded-xl z-10" />
      )}
      <div className="flex items-start gap-3">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
            isSentiment ? "bg-[#D56753]/20" : isPositive ? "bg-emerald-50" : "bg-red-50"
          }`}
        >
          <Icon
            className={`w-4 h-4 ${isSentiment ? "text-[#D56753]" : isPositive ? "text-emerald-600" : "text-red-500"}`}
          />
        </div>
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${isSentiment ? "text-white" : "text-slate-900"}`}>
            {finding.title}
          </p>
          <p className={`text-sm mt-0.5 ${isSentiment ? "text-white/70" : "text-slate-500"}`}>{finding.detail}</p>
          {finding.impact > 0 && (
            <p className="text-xs font-medium text-red-500 mt-1.5">
              Est. ${finding.impact.toLocaleString()}/yr at risk
            </p>
          )}
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
      <p className={`text-sm font-bold leading-snug ${isLeading ? "text-emerald-800" : "text-[#212D40]"}`}>
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
          <span className="text-[11px] font-semibold text-[#212D40] tabular-nums">
            You: {gap.current}
          </span>
          <span className="text-[11px] font-semibold text-slate-400 tabular-nums">
            {gap.competitorName}: {gap.target > gap.current ? gap.target - 1 : gap.target}
          </span>
        </div>
      </div>

      {/* Velocity stats */}
      {v && (
        <div className="mt-4 grid grid-cols-3 gap-1.5 sm:gap-2">
          <div className="bg-slate-50 rounded-lg p-2 sm:p-2.5 text-center">
            <p className="text-base sm:text-lg font-bold text-[#212D40] tabular-nums">{v.clientWeekly}</p>
            <p className="text-[10px] text-slate-400 leading-tight">Your pace</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-2 sm:p-2.5 text-center">
            <p className="text-base sm:text-lg font-bold text-slate-500 tabular-nums">{v.competitorWeekly}</p>
            <p className="text-[10px] text-slate-400 leading-tight">Their pace</p>
          </div>
          <div className={`rounded-lg p-2 sm:p-2.5 text-center ${v.weeksToPass ? "bg-[#D56753]/5" : "bg-emerald-50"}`}>
            <p className={`text-base sm:text-lg font-bold tabular-nums ${v.weeksToPass ? "text-[#D56753]" : "text-emerald-600"}`}>
              {v.weeksToPass ? `${v.weeksToPass}w` : "---"}
            </p>
            <p className="text-[10px] text-slate-400 leading-tight">
              {v.weeksToPass ? "To pass" : isLeading ? "Leading" : "Increase pace"}
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
                <p className="text-xs font-bold text-[#212D40]">
                  This week's target: {v.thisWeekAsk} review{v.thisWeekAsk !== 1 ? "s" : ""}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {gap.timeEstimate}
                </p>
              </div>
              <span className="text-[11px] text-[#D56753] font-medium shrink-0">
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
        <p className="text-sm font-semibold text-[#212D40] leading-snug">
          {gap.label}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#D56753] rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs font-bold text-[#212D40] shrink-0 tabular-nums">
            {gap.current}/{gap.target}
          </span>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-slate-400">
            {gap.timeEstimate}
          </span>
          <span className="text-[11px] text-[#D56753] font-medium">
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

function GapSection({ gaps }: { gaps: CheckupGapItem[] }) {
  if (!gaps || gaps.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold text-[#212D40] uppercase tracking-wide">
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
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [relationship, setRelationship] = useState("owner");
  const [weeklyUpdates, setWeeklyUpdates] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);

  // Vendor path state
  const [vendorEmail, setVendorEmail] = useState("");
  const [vendorEmailError, setVendorEmailError] = useState("");
  const [vendorWantsMore, setVendorWantsMore] = useState(true);
  const [vendorSubmitted, setVendorSubmitted] = useState(false);
  const [vendorShareCopied, setVendorShareCopied] = useState(false);

  const isValidEmail = (v: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

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

  const { place, score, topCompetitor, findings, totalImpact, market } = state;

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
            checkup_score: score.composite,
            source_channel: getSourceChannel() || new URLSearchParams(window.location.search).get("ref") || undefined,
            checkup_data: {
              score,
              topCompetitor: topCompetitor || null,
              market: market || null,
              findingSummary: findings[0]?.detail || null,
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
          setEmailError("Welcome back! Sign in at /signin to see your dashboard.");
          setEmailSending(false);
          return;
        }
        setEmailError(createData.error || "Account creation failed.");
        setEmailSending(false);
        return;
      }

      // Store token -- user is now logged in
      if (createData.token) {
        localStorage.setItem("auth_token", createData.token);
        localStorage.setItem("token", createData.token);
      }
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

    // Step 5: Route through BuildingScreen (brand moment), then auto-nav to dashboard
    setTimeout(() => navigate("/checkup/building", {
      replace: true,
      state: {
        practiceName: place.name,
        specialty: place.category || "",
        email: email.trim(),
      },
    }), 500);
  };

  // Blur gate CTA -- named competitor, named city (40-60% higher conversion per Unbounce/Optimizely)
  const cityLabel = place.city || "your market";
  const blurGateCta = topCompetitor
    ? score.composite >= 80
      ? `You're ahead in ${cityLabel}, but ${topCompetitor.name} is closing the gap. See the full picture.`
      : `See why ${topCompetitor.name} ranks above you in ${cityLabel}.`
    : market && market.totalCompetitors > 0
      ? `${market.totalCompetitors} competitors in ${market.city} are fighting for your referrals. See where you stand.`
      : `Unlock your competitive breakdown for ${cityLabel}.`;

  return (
    <div className="w-full max-w-md mt-2 sm:mt-6 space-y-7 pb-6">
      {/* Intent context chip */}
      {state.intent && (
        <div className="text-center">
          <span className="inline-block text-xs font-semibold text-[#212D40]/60 bg-[#212D40]/4 border border-[#212D40]/10 rounded-full px-3.5 py-1.5">
            {state.intent}
          </span>
        </div>
      )}

      {/* Practice name + market context */}
      <div className="text-center">
        <p className="text-xs font-semibold tracking-widest text-[#D56753] uppercase mb-2">
          Business Health Score
        </p>
        <h2 className="text-2xl font-extrabold text-[#212D40]">{place.name}</h2>
        {market && (
          <p className="text-sm text-slate-400 mt-1.5">
            vs. {market.totalCompetitors} competitors in {market.city}
          </p>
        )}
      </div>

      {/* Composite Score Ring — larger, more prominent */}
      <div className="flex justify-center py-2">
        <ScoreRing score={score.composite} size={180} strokeWidth={12} />
      </div>

      {/* Diagnostic sentence — the difference between a number and a diagnosis */}
      {market && topCompetitor && market.rank > 0 && topCompetitor.reviewCount > place.reviewCount && (
        <p className="text-sm text-slate-600 text-center leading-relaxed -mt-2">
          <span className="font-semibold text-[#212D40]">{place.name}</span> ranks
          #{market.rank} in {market.city}.{" "}
          {topCompetitor.name} has{" "}
          <span className="font-semibold text-[#D56753]">
            {topCompetitor.reviewCount - place.reviewCount} more review{topCompetitor.reviewCount - place.reviewCount !== 1 ? "s" : ""}
          </span>.
          Here's the one move that changes it.
        </p>
      )}

      {/* Sub-scores — transparent breakdown with plain-English explanation */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.06)] space-y-6">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Behind the Score</p>

        {/* Local Visibility */}
        <div className="space-y-2">
          <SubScoreBar label="Local Visibility" score={score.localVisibility} maxScore={40} icon={Eye} />
          <p className="text-xs text-slate-500 leading-relaxed pl-11">
            {market && market.rank > 0 ? (
              <>
                You rank <span className="font-semibold text-slate-700">#{market.rank} of {market.totalCompetitors}</span> {place.category ? `${place.category.toLowerCase()}s` : "competitors"} in {market.city}.
                {topCompetitor && <> <span className="font-semibold text-slate-700">{topCompetitor.name}</span> holds #1 with {topCompetitor.reviewCount} reviews. You have {place.reviewCount}.</>}
              </>
            ) : (
              <>Position data is being calculated. Check back after the next scan.</>
            )}
          </p>
        </div>

        {/* Online Presence */}
        <div className="space-y-2">
          <SubScoreBar label="Online Presence" score={score.onlinePresence} maxScore={40} icon={Globe} />
          <p className="text-xs text-slate-500 leading-relaxed pl-11">
            {place.rating ? (
              <>
                Your <span className="font-semibold text-slate-700">{place.rating}-star rating</span> {market && market.avgRating ? (
                  place.rating >= market.avgRating
                    ? <>is above the {market.city} market average of {market.avgRating.toFixed(1)}.</>
                    : <>is below the {market.city} market average of {market.avgRating.toFixed(1)}. Every 0.1-star improvement moves your score.</>
                ) : <>contributes to your online presence score.</>}
                {!place.websiteUri && <> No website linked on your profile, which reduces visibility.</>}
              </>
            ) : (
              <>Your Google Business Profile data is being analyzed.</>
            )}
          </p>
        </div>

        {/* Review Health */}
        <div className="space-y-2">
          <SubScoreBar label="Review Health" score={score.reviewHealth} maxScore={20} icon={MessageSquare} />
          <p className="text-xs text-slate-500 leading-relaxed pl-11">
            You have <span className="font-semibold text-slate-700">{place.reviewCount} review{place.reviewCount !== 1 ? "s" : ""}</span>
            {place.rating ? <> averaging {place.rating} stars</> : null}.
            {market && market.avgReviews > 0 && (
              place.reviewCount >= market.avgReviews
                ? <> That's above the local average of {Math.round(market.avgReviews)}.</>
                : <> The local average is {Math.round(market.avgReviews)}. Each new review closes the gap.</>
            )}
            {topCompetitor && topCompetitor.reviewCount > place.reviewCount && (
              <> <span className="font-semibold text-slate-700">{topCompetitor.name}</span> has {topCompetitor.reviewCount}.</>
            )}
          </p>
        </div>
      </div>

      {/* Transparency — what this score is based on */}
      <p className="text-[11px] text-slate-400 text-center leading-relaxed -mt-3">
        Based on public Google data for {market?.totalCompetitors || 0} nearby competitors.
        {" "}A full audit with connected accounts reveals more.
      </p>

      {/* Share prompt — right after score, natural moment */}
      <div className="bg-[#212D40] rounded-2xl p-5 flex flex-col sm:flex-row items-center gap-4">
        <div className="flex-1 text-center sm:text-left">
          <p className="text-sm font-semibold text-white">
            Know a colleague who should see their score?
          </p>
          <p className="text-xs text-white/50 mt-1">
            Share a link with your market data. No practice name included.
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
              });
            }
          }}
          className="shrink-0 flex items-center gap-2 text-sm font-semibold text-[#212D40] bg-white rounded-lg px-5 py-2.5 hover:bg-gray-50 active:scale-[0.98] transition-all"
        >
          <Share2 className="w-3.5 h-3.5" />
          {linkCopied ? "Copied!" : "Share score"}
        </button>
      </div>

      {/* Gap Progress Bars — concrete closeable units */}
      {state.gaps && state.gaps.length > 0 && (
        <GapSection gaps={state.gaps} />
      )}

      {/* Findings — first visible, rest blurred */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-[#212D40] uppercase tracking-wide">Key Findings</h2>
        {findings.map((f, i) => (
          <FindingCard
            key={f.type}
            finding={f}
            blurred={i > 0 && !emailSubmitted}
          />
        ))}
      </div>

      {/* Dollar figure — blurred until email captured */}
      {totalImpact > 0 && (
        <div
          className={`relative text-center bg-red-50 border border-red-100 rounded-2xl p-5 ${!emailSubmitted ? "select-none" : ""}`}
        >
          {!emailSubmitted && (
            <div className="absolute inset-0 backdrop-blur-[6px] bg-white/60 rounded-2xl z-10" />
          )}
          <p className="text-sm font-medium text-red-600">
            Estimated Annual Risk
          </p>
          <p className="text-3xl font-bold text-red-700 mt-1">
            ${totalImpact.toLocaleString()}
          </p>
          <p className="text-xs text-red-500 mt-1">
            in potential revenue you may be leaving on the table
          </p>
        </div>
      )}

      {/* Blur Gate — Email Capture */}
      {!emailSubmitted ? (
        <div className="bg-white border-2 border-[#D56753]/25 rounded-2xl p-7 shadow-[0_8px_30px_rgba(213,103,83,0.1)]">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg bg-[#D56753]/8 flex items-center justify-center">
              <Lock className="w-4 h-4 text-[#D56753]" />
            </div>
            <span className="text-base font-bold text-[#212D40]">
              {topCompetitor ? `Your ${topCompetitor.name} Comparison` : "Unlock Full Report"}
            </span>
          </div>
          <p className="text-sm text-slate-600 mb-5 leading-relaxed">{blurGateCta}</p>
          <form onSubmit={handleEmailSubmit} className="space-y-3">
            {/* Email */}
            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
                placeholder="Your email"
                required
                className={`w-full h-12 px-4 rounded-xl bg-slate-50 border text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 transition-colors ${
                  emailError
                    ? "border-red-400 focus:border-red-400 focus:ring-red-400/10"
                    : "border-slate-200 focus:border-[#D56753] focus:ring-[#D56753]/10"
                }`}
              />
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
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPasswordError(""); }}
                placeholder="Create a password"
                required
                minLength={8}
                className={`w-full h-12 px-4 rounded-xl bg-slate-50 border text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 transition-colors ${
                  passwordError
                    ? "border-red-400 focus:border-red-400 focus:ring-red-400/10"
                    : "border-slate-200 focus:border-[#D56753] focus:ring-[#D56753]/10"
                }`}
              />
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
                { value: "vendor", label: "I provide services to this practice" },
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
                      Your email, so we can notify you if this practice's results change.
                    </p>
                    <input
                      type="email"
                      value={vendorEmail}
                      onChange={(e) => { setVendorEmail(e.target.value); setVendorEmailError(""); }}
                      placeholder="Your email"
                      className={`w-full h-12 px-4 rounded-xl bg-slate-50 border text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 transition-colors ${
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
                      <span className="text-xs text-slate-600">I'd like to run a Checkup for my other practices</span>
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
                            wants_checkup_for_other_practices: vendorWantsMore,
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
                      className="w-full h-12 flex items-center justify-center gap-2 rounded-xl border-2 border-[#212D40]/20 text-[#212D40] text-sm font-semibold hover:border-[#212D40]/40 transition-all"
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
                <button
                  type="submit"
                  disabled={emailSending}
                  className="w-full h-13 flex items-center justify-center gap-2 rounded-xl bg-[#D56753] text-white text-[15px] font-semibold shadow-[0_4px_14px_rgba(213,103,83,0.35)] hover:shadow-[0_6px_20px_rgba(213,103,83,0.45)] hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-70"
                >
                  {emailSending
                    ? "Creating your account..."
                    : topCompetitor
                      ? `See why ${topCompetitor.name} ranks above you`
                      : market?.city
                        ? `See what's keeping you from #1 in ${market.city}`
                        : "Unlock my full report"}
                  {!emailSending && <ArrowRight className="w-4 h-4" />}
                </button>
              </>
            )}
          </form>
          <p className="text-[11px] text-slate-400 text-center mt-5 leading-relaxed">
            Your full report takes 30 seconds to unlock.
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

        {/* Share prompt — viral loop for unicorn path */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Share2 className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">
              Know a colleague who should see their score?
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Share a link that shows your market data (no practice name) with a prompt to take their own checkup.
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
            className="flex items-center gap-2 text-sm font-medium text-[#212D40] border border-[#212D40]/20 rounded-lg px-4 py-2.5 hover:border-[#212D40]/40 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            {linkCopied ? "Copied!" : "Share your market score"}
          </button>
        </div>
        </>
      )}
    </div>
  );
}
