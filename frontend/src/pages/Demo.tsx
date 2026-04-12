/**
 * AAE Demo Account -- /demo
 *
 * Pre-seeded Valley Specialty Practice. No auth. No API calls.
 * Corey says "let me show you what it looks like fully running" and opens this.
 *
 * Practice: Valley Specialty Practice, Salt Lake City, Utah
 * Score: 61. Rank: #3 of 5 specialists.
 * All competitor names are FICTIONAL to avoid showing real practice data in a demo.
 * Identity matches conference fallback in conferenceFallback.ts.
 * Uses universal specialist language, not dental-specific.
 *
 * Design: matches Alloro design system (Oura/Apple Health aesthetic).
 * Warm backgrounds, generous whitespace, status rings, visual gap bars.
 */

import { useState, useEffect } from "react";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Zap,
  Calendar,
  Target,
  Users,
  ArrowRight,
  Activity,
  Loader2,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";

// -- Demo Data ---------------------------------------------------------------
// URL params override defaults: ?name=...&city=...&reviews=...&rating=...
// This lets Corey customize the demo at the booth for any prospect.

const DEFAULTS = {
  name: "Valley Specialty Practice",
  city: "Salt Lake City",
  state: "Utah",
  score: 61,
  rank: 3,
  totalCompetitors: 5,
  specialty: "specialist",
  reviews: 61,
  rating: 4.6,
  competitorName: "Summit Specialists",
  competitorReviews: 284,
  competitorRating: 4.9,
  startRank: 6,
  startScore: 42,
};

// Pre-configured verticals: use ?vertical=plumber (or restaurant, attorney, etc.)
// Each vertical tells a compelling 4-month growth story with realistic data.
const VERTICAL_PROFILES: Record<string, typeof DEFAULTS> = {
  plumber: {
    name: "Cascade Plumbing",
    city: "Denver",
    state: "Colorado",
    score: 72,
    rank: 2,
    totalCompetitors: 8,
    specialty: "plumber",
    reviews: 94,
    rating: 4.7,
    competitorName: "Mile High Plumbing",
    competitorReviews: 312,
    competitorRating: 4.8,
    startRank: 5,
    startScore: 38,
  },
  restaurant: {
    name: "Ember Kitchen",
    city: "Austin",
    state: "Texas",
    score: 67,
    rank: 4,
    totalCompetitors: 12,
    specialty: "restaurant",
    reviews: 187,
    rating: 4.5,
    competitorName: "Willow & Sage",
    competitorReviews: 524,
    competitorRating: 4.7,
    startRank: 9,
    startScore: 34,
  },
  attorney: {
    name: "Birch & Crane Law",
    city: "Charlotte",
    state: "North Carolina",
    score: 58,
    rank: 3,
    totalCompetitors: 6,
    specialty: "attorney",
    reviews: 38,
    rating: 4.8,
    competitorName: "Prescott Legal Group",
    competitorReviews: 127,
    competitorRating: 4.9,
    startRank: 6,
    startScore: 29,
  },
  medspa: {
    name: "Luma Aesthetics",
    city: "Scottsdale",
    state: "Arizona",
    score: 74,
    rank: 2,
    totalCompetitors: 9,
    specialty: "medspa",
    reviews: 156,
    rating: 4.9,
    competitorName: "Desert Glow Med Spa",
    competitorReviews: 289,
    competitorRating: 4.8,
    startRank: 7,
    startScore: 41,
  },
  chiropractor: {
    name: "Summit Spine & Wellness",
    city: "Nashville",
    state: "Tennessee",
    score: 65,
    rank: 3,
    totalCompetitors: 7,
    specialty: "chiropractor",
    reviews: 72,
    rating: 4.7,
    competitorName: "Music City Chiropractic",
    competitorReviews: 198,
    competitorRating: 4.6,
    startRank: 6,
    startScore: 35,
  },
};

function useDemoPractice() {
  const [params] = useSearchParams();
  // ?vertical=plumber loads the plumber profile. Individual params still override.
  const verticalKey = params.get("vertical")?.toLowerCase() || "";
  const base = VERTICAL_PROFILES[verticalKey] || DEFAULTS;
  return {
    name: params.get("name") || base.name,
    city: params.get("city") || base.city,
    state: params.get("state") || base.state,
    score: Number(params.get("score")) || base.score,
    rank: Number(params.get("rank")) || base.rank,
    totalCompetitors: Number(params.get("competitors")) || base.totalCompetitors,
    specialty: params.get("specialty") || base.specialty,
    reviews: Number(params.get("reviews")) || base.reviews,
    rating: Number(params.get("rating")) || base.rating,
    competitorName: params.get("competitor") || base.competitorName,
    competitorReviews: Number(params.get("compReviews")) || base.competitorReviews,
    competitorRating: Number(params.get("compRating")) || base.competitorRating,
    startRank: Number(params.get("startRank")) || base.startRank,
    startScore: Number(params.get("startScore")) || base.startScore,
  };
}

// Owner names per vertical (non-medical verticals drop the "Dr." prefix)
const DEMO_OWNERS: Record<string, string> = {
  plumber: "Mike",
  restaurant: "Chef Rivera",
  attorney: "Mr. Crane",
  medspa: "Dr. Luma",
  chiropractor: "Dr. Mitchell",
};

const REFERRING_GPS = [
  { name: "Dr. Sarah Chen", practice: "Chen Family Practice", referrals: 18, trend: "up" as const, trendLabel: "+3 vs last quarter", lastReferral: "5 days ago", status: "active" as const },
  { name: "Dr. Marcus Webb", practice: "Webb Group", referrals: 12, trend: "flat" as const, trendLabel: "Same as last quarter", lastReferral: "12 days ago", status: "active" as const },
  { name: "Dr. Amanda Torres", practice: "Torres & Associates", referrals: 8, trend: "down" as const, trendLabel: "Down 40%, was 13 last quarter", lastReferral: "40 days ago", status: "drift" as const },
  { name: "Dr. James Okafor", practice: "Okafor Group", referrals: 4, trend: "up" as const, trendLabel: "New referring relationship", lastReferral: "8 days ago", status: "active" as const },
  { name: "Dr. Lisa Park", practice: "Park Group", referrals: 6, trend: "down" as const, trendLabel: "Silent for 74 days", lastReferral: "74 days ago", status: "drift" as const },
];

// Tasks are generated dynamically in the WeeklyTasks component using practice data

// Ranking history is generated dynamically in the component using startRank/startScore

// Top moves are generated dynamically in ProgressReport using practice data

// Next 90 is generated dynamically in the Next90 component using practice data

const CS_ACTIONS = [
  { time: "2h ago", text: "Detected Dr. Torres referral drift. 40 days since last referral. Flagged for outreach.", type: "alert" },
  { time: "Yesterday", text: "Sent review request to 3 recent clients. 1 review received (5 stars).", type: "success" },
  { time: "2 days ago", text: "Dr. Lisa Park has been silent for 74 days. Added to re-engagement queue.", type: "alert" },
  { time: "3 days ago", text: "Weekly ranking scan complete. Position held at #3. Score improved +2 to 61.", type: "info" },
  { time: "Last week", text: "New referring relationship detected: Dr. Okafor sent 2 clients in 10 days.", type: "success" },
];

// -- Utility -----------------------------------------------------------------

function statusColor(status: "healthy" | "attention" | "critical") {
  if (status === "healthy") return { dot: "bg-emerald-500", ring: "ring-emerald-500/20", text: "text-emerald-600" };
  if (status === "attention") return { dot: "bg-amber-400", ring: "ring-amber-400/20", text: "text-amber-600" };
  return { dot: "bg-red-500", ring: "ring-red-500/20", text: "text-red-600" };
}

// -- Components --------------------------------------------------------------

function DemoHeader() {
  return (
    <header className="bg-[#F8F6F2] border-b border-stone-200/60 py-3 px-5">
      <div className="mx-auto max-w-[800px] flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#D56753] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L14 14H2L8 2Z" fill="white" opacity="0.9"/>
            </svg>
          </div>
          <span className="text-lg font-semibold tracking-tight text-[#1A1D23]">alloro</span>
        </Link>
        <span className="text-xs font-semibold uppercase tracking-widest text-[#1A1D23]/40 bg-stone-200/60 px-3 py-1 rounded-full">
          Demo
        </span>
      </div>
    </header>
  );
}

function SignalBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-5"
    >
      <div className="flex items-start gap-4">
        <div className="mt-0.5">
          <div className={`w-3 h-3 rounded-full ring-4 bg-red-500 ring-red-500/20`} />
        </div>
        <div>
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">This Week</p>
          <p className="text-sm font-semibold text-[#1A1D23]">
            Dr. Torres referred 8 clients last quarter. She hasn't referred in 40 days.
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Estimated $14,000 at risk. Alloro flagged this before it became invisible.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function InstrumentCards() {
  const PRACTICE = useDemoPractice();
  const gap = PRACTICE.competitorReviews - PRACTICE.reviews;
  const instruments = [
    {
      label: "Your Market",
      value: `#${PRACTICE.rank} of ${PRACTICE.totalCompetitors}`,
      context: `${PRACTICE.totalCompetitors} ${PRACTICE.specialty}s in ${PRACTICE.city}. Top competitor: ${PRACTICE.competitorName}.`,
      status: "attention" as const,
    },
    {
      label: "Reviews",
      value: `${PRACTICE.reviews} reviews`,
      context: `${PRACTICE.competitorName} leads by ${gap}. At 3 per week, you close it in ${Math.ceil(gap / 3)} weeks.`,
      status: "attention" as const,
    },
    {
      label: "From Google",
      value: "188 actions",
      context: "42 calls, 78 directions, 68 website clicks. Directions requests are your top conversion channel.",
      status: "healthy" as const,
    },
    {
      label: "GBP Profile",
      value: "4/5 complete",
      context: "Missing: business description. Complete profiles appear in 2x more searches.",
      status: "attention" as const,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="grid grid-cols-2 gap-3"
    >
      {instruments.map((inst) => {
        const sc = statusColor(inst.status);
        return (
          <div key={inst.label} className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2.5 h-2.5 rounded-full ring-4 ${sc.dot} ${sc.ring}`} />
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">{inst.label}</p>
            </div>
            <p className="text-lg font-semibold text-[#1A1D23]">{inst.value}</p>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{inst.context}</p>
          </div>
        );
      })}
    </motion.div>
  );
}

function CompetitorGap() {
  const PRACTICE = useDemoPractice();
  const gap = PRACTICE.competitorReviews - PRACTICE.reviews;
  const pct = Math.round((PRACTICE.reviews / PRACTICE.competitorReviews) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-5 space-y-3"
    >
      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">You vs {PRACTICE.competitorName}</p>

      {/* Visual gap bar */}
      <div className="space-y-2">
        <div className="relative w-full h-3 bg-stone-200/60 rounded-full overflow-hidden">
          <div
            className="absolute left-0 top-0 h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${Math.max(pct, 3)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-emerald-600 font-semibold">You: {PRACTICE.reviews}</span>
          <span className="text-[#D56753] font-semibold">{PRACTICE.competitorName}: {PRACTICE.competitorReviews}</span>
        </div>
      </div>

      <p className="text-sm text-[#1A1D23] font-semibold">
        {gap} reviews behind. At 3 per week, you close this in {Math.ceil(gap / 3)} weeks.
      </p>
      <p className="text-sm text-gray-500">
        Google weights review volume heavily in local pack rankings. This gap is the single largest factor in your competitive position.
      </p>
    </motion.div>
  );
}

function RankingTrajectory() {
  const p = useDemoPractice();
  const posGain = p.startRank - p.rank;
  // Generate a plausible 4-month trajectory from startRank to current rank
  const months = ["Dec", "Jan", "Feb", "Mar"];
  const history = months.map((month, i) => {
    const progress = i / (months.length - 1);
    const position = Math.round(p.startRank - posGain * progress);
    const score = Math.round(p.startScore + (p.score - p.startScore) * progress);
    return { month, position, score };
  });
  const maxPos = Math.max(...history.map(h => h.position)) + 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35 }}
      className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Ranking Trajectory</p>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
          <TrendingUp className="h-3 w-3" /> +{posGain} positions
        </span>
      </div>
      <div className="flex items-end gap-3 h-20">
        {history.map((m, i) => {
          const heightPct = ((maxPos - m.position) / maxPos) * 100;
          const isLatest = i === history.length - 1;
          return (
            <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
              <span className={`text-xs font-semibold ${isLatest ? "text-[#D56753]" : "text-[#1A1D23]/60"}`}>#{m.position}</span>
              <div
                className={`w-full rounded-lg transition-all ${isLatest ? "bg-[#D56753]" : "bg-[#D56753]/20"}`}
                style={{ height: `${Math.max(heightPct, 5)}%` }}
              />
              <span className="text-xs text-gray-400">{m.month}</span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

function ReferralNetwork() {
  const totalReferrals = REFERRING_GPS.reduce((s, g) => s + g.referrals, 0);
  const driftCount = REFERRING_GPS.filter(g => g.status === "drift").length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-5"
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-[#D56753]" />
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Referral Network</p>
        </div>
      </div>
      <div className="flex items-baseline gap-3 mb-4">
        <p className="text-2xl font-semibold text-[#1A1D23]">{totalReferrals}</p>
        <p className="text-sm text-gray-500">referrals this quarter</p>
        {driftCount > 0 && (
          <span className="ml-auto text-xs font-semibold text-red-500">{driftCount} drifting</span>
        )}
      </div>

      <div className="space-y-2">
        {REFERRING_GPS.map((gp) => (
          <div
            key={gp.name}
            className={`flex items-center justify-between rounded-xl px-4 py-3 ${
              gp.status === "drift"
                ? "bg-red-50/80 border border-red-100"
                : "bg-[#F0EDE8] border border-stone-200/40"
            }`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-[#1A1D23] truncate">{gp.name}</p>
                {gp.status === "drift" && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-100 rounded-full px-2 py-0.5">
                    <AlertTriangle className="h-2.5 w-2.5" /> DRIFT
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{gp.practice}</p>
              <span className={`text-xs font-medium mt-0.5 inline-flex items-center gap-1 ${
                gp.trend === "up" ? "text-emerald-600" : gp.trend === "down" ? "text-red-500" : "text-gray-400"
              }`}>
                {gp.trend === "up" && <TrendingUp className="h-3 w-3" />}
                {gp.trend === "down" && <TrendingDown className="h-3 w-3" />}
                {gp.trendLabel}
              </span>
            </div>
            <div className="text-right shrink-0 ml-4">
              <p className="text-lg font-semibold text-[#1A1D23]">{gp.referrals}</p>
              <p className="text-xs text-gray-400">Last: {gp.lastReferral}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function WeeklyTasks() {
  const p = useDemoPractice();
  const tasks = [
    { title: "Request 3 reviews this week", why: `${p.competitorName} has ${p.competitorReviews} reviews to your ${p.reviews}. Closing that gap is the single biggest lever for moving from #${p.rank} to #1.` },
    { title: "Respond to your last 5 reviews", why: "Businesses that respond to reviews rank higher and earn 35% more revenue. Each response signals activity to Google." },
    { title: "Update your GBP hours", why: "Incomplete business profiles rank 23% lower in local search. This fix takes 2 minutes." },
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45 }}
      className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <Zap className="h-4 w-4 text-[#D56753]" />
        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Your Next Moves</p>
      </div>
      <div className="space-y-4">
        {tasks.map((task, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-[#D56753] text-white flex items-center justify-center text-xs font-semibold mt-0.5">
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-semibold text-[#1A1D23]">{task.title}</p>
              <p className="text-xs text-gray-500 leading-relaxed mt-0.5">{task.why}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function AgentActivity() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-4 w-4 text-[#D56753]" />
        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Alloro is Working</p>
      </div>
      <div className="space-y-3">
        {CS_ACTIONS.map((a, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${
              a.type === "alert" ? "bg-red-400" : a.type === "success" ? "bg-emerald-400" : "bg-blue-400"
            }`} />
            <div>
              <p className="text-sm text-[#1A1D23]/80">{a.text}</p>
              <p className="text-xs text-gray-400 mt-0.5">{a.time}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function ProgressReport() {
  const p = useDemoPractice();
  const posGain = p.startRank - p.rank;
  const scoreGain = p.score - p.startScore;
  const reviewGain = p.reviews - Math.round(p.reviews * 0.7); // Approx 30% growth
  const midScore = Math.round(p.startScore + scoreGain * 0.6);
  const topMoves = [
    { title: `Added ${reviewGain} Google reviews`, outcome: `Moved from #${p.startRank} to #${Math.max(p.rank + 1, p.startRank - Math.floor(posGain * 0.6))} in local search`, date: "Jan" },
    { title: "Completed GBP profile", outcome: `Score jumped from ${p.startScore} to ${midScore} (+${midScore - p.startScore} points)`, date: "Feb" },
    { title: "Responded to all negative reviews", outcome: `Rating held at ${p.rating} stars instead of declining`, date: "Mar" },
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.55 }}
      className="space-y-4"
    >
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-[#D56753]" />
        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">4-Month Progress</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-4 text-center">
          <p className="text-2xl font-semibold text-emerald-600">+{posGain}</p>
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mt-1">Positions</p>
          <p className="text-xs text-gray-400">#{p.startRank} to #{p.rank}</p>
        </div>
        <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-4 text-center">
          <p className="text-2xl font-semibold text-[#1A1D23]">+{reviewGain}</p>
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mt-1">Reviews</p>
          <p className="text-xs text-gray-400">{p.reviews - reviewGain} to {p.reviews}</p>
        </div>
        <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-4 text-center">
          <p className="text-2xl font-semibold text-[#D56753]">+{scoreGain}</p>
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mt-1">Score</p>
          <p className="text-xs text-gray-400">{p.startScore} to {p.score}</p>
        </div>
      </div>

      {/* Top moves */}
      <div className="space-y-2">
        {topMoves.map((move, i) => (
          <div key={i} className="flex items-start gap-3 rounded-xl bg-[#F0EDE8] border border-stone-200/40 p-4">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-[#1A1D23]">{move.title}</p>
              <p className="text-xs text-emerald-600 font-medium">{move.outcome}</p>
              <p className="text-xs text-gray-400 mt-0.5">{move.date}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function Next90() {
  const p = useDemoPractice();
  const gap = p.competitorReviews - p.reviews;
  const actions = [
    { title: `Collect 3 Google reviews per week for ${Math.min(Math.ceil(gap / 3), 12)} weeks`, why: `At 3/week you close the gap with ${p.competitorName} by ${Math.min(gap, 36)} reviews. Combined with your higher engagement rate, that moves you from #${p.rank} to #${Math.max(p.rank - 1, 1)}.`, impact: `Projected move to #${Math.max(p.rank - 1, 1)} position` },
    { title: "Re-engage Dr. Torres, she hasn't referred in 40 days", why: "Torres sent 13 clients last quarter. At $1,750 per case, that is $22,750 at risk. A lunch meeting costs $50.", impact: "$22,750 estimated quarterly revenue at risk" },
    { title: `Add 10 new photos to GBP`, why: `${p.competitorName} has significantly more photos. Businesses with 20+ photos get 35% more website clicks from Google.`, impact: "5 to 10 point score improvement" },
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="space-y-4"
    >
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-[#D56753]" />
        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Next 90 Days</p>
      </div>
      <div className="space-y-3">
        {actions.map((action, i) => (
          <div key={i} className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-5">
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-[#D56753] text-white flex items-center justify-center text-xs font-semibold mt-0.5">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-semibold text-[#1A1D23]">{action.title}</p>
                <p className="text-xs text-gray-500 leading-relaxed mt-1">{action.why}</p>
                <p className="text-xs font-semibold text-[#D56753] mt-2">{action.impact}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// -- Main Demo Page ----------------------------------------------------------

export default function Demo() {
  const navigate = useNavigate();
  const p = useDemoPractice();
  const [autoLoginFailed, setAutoLoginFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  // Attempt auto-login via seeded demo account.
  // If the account exists, store token and redirect to the live dashboard.
  // If not seeded (404), fall through to the hardcoded demo page.
  useEffect(() => {
    fetch("/api/demo/login")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.token) {
          localStorage.setItem("auth_token", data.token);
          if (data.user?.organizationId) {
            localStorage.setItem("organizationId", String(data.user.organizationId));
          }
          if (data.user?.role) {
            localStorage.setItem("user_role", data.user.role);
          }
          navigate("/home", { replace: true });
        } else {
          setAutoLoginFailed(true);
          setLoading(false);
        }
      })
      .catch(() => {
        setAutoLoginFailed(true);
        setLoading(false);
      });
  }, [navigate]);

  // Loading spinner while attempting auto-login
  if (loading && !autoLoginFailed) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#F8F6F2]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#D56753]" />
          <span className="text-sm font-medium text-gray-500">Loading demo...</span>
        </div>
      </div>
    );
  }

  // Resolve owner name from vertical param or default
  const [searchParams] = useSearchParams();
  const verticalKey = searchParams.get("vertical")?.toLowerCase() || "";
  const ownerName = DEMO_OWNERS[verticalKey] || "Dr. Hayward";

  // Fallback: premium demo page (no seeded account)
  return (
    <div className="min-h-dvh bg-[#F8F6F2]">
      <DemoHeader />

      <div className="mx-auto max-w-[800px] px-4 sm:px-6 py-8 sm:py-12 space-y-6">

        {/* Greeting */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-semibold text-[#1A1D23] tracking-tight">
            Good morning, {ownerName}.
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Here is what Alloro found this week for {p.name}.
          </p>
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            {p.city}, {p.state}
          </p>
        </motion.div>

        {/* Signal banner */}
        <SignalBanner />

        {/* Instrument readings */}
        <InstrumentCards />

        {/* Competitive gap visualization */}
        <CompetitorGap />

        {/* Ranking trajectory */}
        <RankingTrajectory />

        {/* Referral network */}
        <ReferralNetwork />

        {/* Weekly tasks */}
        <WeeklyTasks />

        {/* Agent activity */}
        <AgentActivity />

        {/* Progress report */}
        <ProgressReport />

        {/* Next 90 days */}
        <Next90 />

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
          className="rounded-2xl bg-[#212D40] p-6 sm:p-8 text-center"
        >
          <p className="text-lg font-semibold text-white">This is Alloro running for 4 months.</p>
          <p className="text-sm text-white/60 mt-2 leading-relaxed">
            From #{p.startRank} to #{p.rank}. From {p.startScore} to {p.score}. From blind to seeing every pattern in your market.
          </p>
          <a
            href="/checkup"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#D56753] text-white text-sm font-semibold px-6 py-3 shadow-[0_4px_14px_rgba(213,103,83,0.4)] hover:brightness-110 transition-all"
          >
            Run your free Checkup
            <ArrowRight className="h-4 w-4" />
          </a>
        </motion.div>

        {/* Footer */}
        <p className="text-center text-xs text-[#1A1D23]/30 uppercase tracking-wide pt-4 pb-8">
          Demo account. {p.name}. {p.city}, {p.state}.
        </p>
      </div>
    </div>
  );
}
