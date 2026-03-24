import { useState, useEffect } from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
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
} from "lucide-react";
import type { PlaceDetails } from "../../api/places";
import { sendCheckupEmail, triggerBuild } from "../../api/checkup";
import { trackEvent } from "../../api/tracking";

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
  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    review_gap: MessageSquare,
    review_lead: MessageSquare,
    rating_gap: Star,
    rating_strong: Star,
    market_rank: MapPin,
  };
  const Icon = iconMap[finding.type] || Target;

  return (
    <div
      className={`relative bg-white border border-slate-200 rounded-xl p-4 ${blurred ? "select-none" : ""}`}
    >
      {blurred && (
        <div className="absolute inset-0 backdrop-blur-[6px] bg-white/60 rounded-xl z-10" />
      )}
      <div className="flex items-start gap-3">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
            isPositive ? "bg-emerald-50" : "bg-red-50"
          }`}
        >
          <Icon
            className={`w-4 h-4 ${isPositive ? "text-emerald-600" : "text-red-500"}`}
          />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            {finding.title}
          </p>
          <p className="text-sm text-slate-500 mt-0.5">{finding.detail}</p>
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
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="bg-slate-50 rounded-lg p-2.5 text-center">
            <p className="text-lg font-bold text-[#212D40] tabular-nums">{v.clientWeekly}</p>
            <p className="text-[10px] text-slate-400 leading-tight">Your weekly pace</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-2.5 text-center">
            <p className="text-lg font-bold text-slate-500 tabular-nums">{v.competitorWeekly}</p>
            <p className="text-[10px] text-slate-400 leading-tight">Their weekly pace</p>
          </div>
          <div className={`rounded-lg p-2.5 text-center ${v.weeksToPass ? "bg-[#D56753]/5" : "bg-emerald-50"}`}>
            <p className={`text-lg font-bold tabular-nums ${v.weeksToPass ? "text-[#D56753]" : "text-emerald-600"}`}>
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
  const [emailError, setEmailError] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [relationship, setRelationship] = useState("owner");
  const [linkCopied, setLinkCopied] = useState(false);

  const isValidEmail = (v: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

  // Track: checkup.gate_viewed (fires once when results render)
  useEffect(() => {
    if (!state?.place || !state?.score) return;
    trackEvent("checkup.gate_viewed", {
      score: state.score.composite,
      blur_gate_cta_text: state.topCompetitor
        ? `See why ${state.topCompetitor.name} ranks above you in ${state.place.city || "your market"}.`
        : "See what's holding your score back.",
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
    if (!isValidEmail(email)) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    setEmailError("");

    setEmailSending(true);

    // Fire email send — don't block UI on it
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
    }).catch(() => {
      // Email send failed silently — prospect still sees results
    });

    // Track: checkup.email_captured (no PII — no email stored)
    trackEvent("checkup.email_captured", {
      score: score.composite,
      specialty: place.category,
      city: place.city,
      ref_code: state.refCode || null,
      gate_relationship: relationship,
      intent: state.intent || null,
    });

    // Trigger ClearPath build and navigate to building screen
    triggerBuild({
      email: email.trim(),
      placeId: place.placeId,
      practiceName: place.name,
      specialty: place.category || "",
      city: place.city || "",
    }).catch(() => {});

    navigate("/checkup/building", {
      state: {
        practiceName: place.name,
        specialty: place.category || "",
        email: email.trim(),
      },
      replace: true,
    });
  };

  // Blur gate CTA — WO4: use real competitor name
  const blurGateCta = topCompetitor
    ? `See why ${topCompetitor.name} ranks above you in ${place.city || "your market"}.`
    : "See what's holding your score back.";

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

      {/* Sub-scores — honest names for what we actually measure */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.06)] space-y-5">
        <SubScoreBar
          label="Market Rank"
          score={score.localVisibility}
          maxScore={40}
          icon={Eye}
        />
        <SubScoreBar
          label="Rating vs Market"
          score={score.onlinePresence}
          maxScore={40}
          icon={Globe}
        />
        <SubScoreBar
          label="Review Volume"
          score={score.reviewHealth}
          maxScore={20}
          icon={MessageSquare}
        />
      </div>

      {/* Transparency — what this score is based on */}
      <p className="text-[11px] text-slate-400 text-center leading-relaxed -mt-3">
        Based on public Google data for {market?.totalCompetitors || 0} nearby competitors.
        {" "}A full audit with connected accounts reveals more.
      </p>

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
              Unlock Full Report
            </span>
          </div>
          <p className="text-sm text-slate-600 mb-5 leading-relaxed">{blurGateCta}</p>
          <form onSubmit={handleEmailSubmit} className="space-y-3">
            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
                placeholder="Enter your email"
                required
                className={`w-full h-12 px-4 rounded-xl bg-slate-50 border text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 transition-colors ${
                  emailError
                    ? "border-red-400 focus:border-red-400 focus:ring-red-400/10"
                    : "border-slate-200 focus:border-[#D56753] focus:ring-[#D56753]/10"
                }`}
              />
              {emailError && (
                <p className="text-xs text-red-500 mt-1">{emailError}</p>
              )}
            </div>
            {/* Relationship question — segmentation data */}
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-medium text-slate-600 mb-1.5">
                Are you the business owner?
              </legend>
              {[
                { value: "owner", label: "Yes, this is my business" },
                { value: "manager", label: "I manage this business" },
                { value: "vendor", label: "I provide services to this business" },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2.5 cursor-pointer"
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
              {emailSending ? "Sending..." : "Unlock My Full Report"}
              {!emailSending && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>
          <p className="text-[11px] text-slate-400 text-center mt-5 leading-relaxed">
            Your business operates on a deterministic system. Alloro tracks all
            of it.
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

        {/* Share prompt — quiet, not primary CTA */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Share2 className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">
              Show a colleague what we found about their business.
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              const base = window.location.origin;
              const shareUrl = state.refCode
                ? `${base}/checkup?ref=${state.refCode}`
                : `${base}/checkup`;
              navigator.clipboard.writeText(shareUrl).then(() => {
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2000);
              });
            }}
            className="flex items-center gap-2 text-sm font-medium text-[#212D40] border border-[#212D40]/20 rounded-lg px-4 py-2.5 hover:border-[#212D40]/40 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            {linkCopied ? "Copied!" : "Copy link"}
          </button>
        </div>
        </>
      )}
    </div>
  );
}
