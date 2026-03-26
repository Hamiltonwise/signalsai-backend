/**
 * AAE Demo Account — /demo
 *
 * Pre-seeded Valley Specialty Practice. No auth. No API calls.
 * Corey says "let me show you what it looks like fully running" and opens this.
 *
 * Practice: Valley Specialty Practice, Salt Lake City, Utah
 * Score: 61. Rank: #3 of 5 specialists.
 * All competitor names are FICTIONAL to avoid showing real practice data in a demo.
 * Identity matches conference fallback in conferenceFallback.ts.
 * Uses universal specialist language, not dental-specific.
 */

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
} from "lucide-react";
import { Link } from "react-router-dom";

// ─── Demo Data ──────────────────────────────────────────────────────

const PRACTICE = {
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

const REFERRING_GPS = [
  {
    name: "Dr. Sarah Chen",
    practice: "Chen Family Dentistry",
    referrals: 18,
    trend: "up" as const,
    trendLabel: "+3 vs last quarter",
    lastReferral: "5 days ago",
    status: "active" as const,
  },
  {
    name: "Dr. Marcus Webb",
    practice: "Webb Practice Group",
    referrals: 12,
    trend: "flat" as const,
    trendLabel: "Same as last quarter",
    lastReferral: "12 days ago",
    status: "active" as const,
  },
  {
    name: "Dr. Amanda Torres",
    practice: "Torres & Associates",
    referrals: 8,
    trend: "down" as const,
    trendLabel: "Down 40%, was 13 last quarter",
    lastReferral: "40 days ago",
    status: "drift" as const,
  },
  {
    name: "Dr. James Okafor",
    practice: "Okafor Practice Group",
    referrals: 4,
    trend: "up" as const,
    trendLabel: "New referring relationship",
    lastReferral: "8 days ago",
    status: "active" as const,
  },
  {
    name: "Dr. Lisa Park",
    practice: "Park Practice Group",
    referrals: 6,
    trend: "down" as const,
    trendLabel: "Silent for 74 days",
    lastReferral: "74 days ago",
    status: "drift" as const,
  },
];

const TASKS = [
  {
    title: "Request 3 reviews this week",
    why: "Summit Specialists has 284 reviews to your 61. Closing that gap is the single biggest lever for moving from #3 to #1 in Salt Lake City.",
    status: "active",
  },
  {
    title: "Respond to your last 5 reviews",
    why: "Practices that respond to reviews rank higher and convert more referrals from colleagues who research you before sending a client.",
    status: "active",
  },
  {
    title: "Update your GBP hours",
    why: "Incomplete business profiles rank 23% lower in local search. This fix takes 2 minutes and directly improves your position.",
    status: "active",
  },
];

const RANKING_HISTORY = [
  { month: "Dec", position: 6, score: 42 },
  { month: "Jan", position: 5, score: 48 },
  { month: "Feb", position: 4, score: 54 },
  { month: "Mar", position: 3, score: 61 },
];

const TOP_MOVES = [
  { title: "Added 12 Google reviews", outcome: "Moved from #6 to #4 in local search", date: "Jan - Feb" },
  { title: "Completed GBP profile", outcome: "Score jumped from 42 to 54 (+12 points)", date: "February" },
  { title: "Responded to all negative reviews", outcome: "Rating held at 4.6★ instead of declining", date: "March" },
];

const NEXT_90 = [
  {
    title: "Collect 3 Google reviews per week for 10 weeks",
    why: "At 3/week you close the gap with Summit Specialists by 30 reviews. Combined with your higher engagement rate, that moves you from #3 to #2.",
    impact: "Projected move to #2 position",
  },
  {
    title: "Re-engage Dr. Torres, she hasn't referred in 40 days",
    why: "Torres sent 13 clients last quarter. At $1,750 per case, that's $22,750 at risk. A lunch meeting costs $50.",
    impact: "$22,750 estimated quarterly revenue at risk",
  },
  {
    title: "Add 10 new procedure photos to GBP",
    why: "Summit has 45 photos. You have 8. Businesses with 20+ photos get 35% more website clicks from Google.",
    impact: "5-10 point score improvement",
  },
];

// ─── Signal Banner ──────────────────────────────────────────────────

function SignalBanner() {
  return (
    <div className="rounded-2xl px-6 py-5" style={{ backgroundColor: "rgba(213, 103, 83, 0.05)" }}>
      <p className="text-xs font-bold uppercase tracking-widest text-[#D56753] mb-2">
        Morning Brief
      </p>
      <p className="text-base font-medium text-[#212D40] leading-relaxed">
        Dr. Torres referred 8 clients last quarter. She hasn't referred in 40 days. Estimated <strong>$14,000</strong> at risk.
      </p>
    </div>
  );
}

// ─── Position Card ──────────────────────────────────────────────────

function DemoPositionCard() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex items-start justify-between mb-1">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Market Position</p>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
          <TrendingUp className="h-3 w-3" />+3 since Dec
        </span>
      </div>
      <div className="mt-2">
        <span className="text-5xl font-black text-[#212D40]">#{PRACTICE.rank}</span>
        <span className="text-lg text-gray-400 ml-2">of {PRACTICE.totalCompetitors}</span>
      </div>
      <p className="text-sm text-gray-500 mt-2">
        {PRACTICE.totalCompetitors} {PRACTICE.specialty}s in {PRACTICE.city}, {PRACTICE.state}
      </p>
      <div className="mt-4">
        <span className="inline-flex px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-600">
          Score: {PRACTICE.score}/100
        </span>
      </div>
    </div>
  );
}

// ─── Ranking History Sparkline ──────────────────────────────────────

function RankingSparkline() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">Ranking Trajectory</p>
      <div className="flex items-end gap-3 h-24">
        {RANKING_HISTORY.map((m) => {
          const heightPct = ((7 - m.position) / 6) * 100;
          return (
            <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] font-bold text-[#212D40]">#{m.position}</span>
              <div className="w-full rounded-t-lg bg-[#D56753]/10 relative" style={{ height: `${heightPct}%` }}>
                <div className="absolute inset-0 rounded-t-lg bg-[#D56753]" style={{ opacity: m.position <= 3 ? 1 : 0.4 }} />
              </div>
              <span className="text-[10px] text-gray-400">{m.month}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Competitor Gap ─────────────────────────────────────────────────

function DemoCompetitorGap() {
  const gap = PRACTICE.competitorReviews - PRACTICE.reviews;
  return (
    <div className="rounded-2xl px-5 py-4" style={{ backgroundColor: "rgba(213, 103, 83, 0.05)" }}>
      <p className="text-xs font-bold uppercase tracking-wider text-[#D56753] mb-2">Top Competitor</p>
      <p className="text-base font-semibold text-[#212D40] leading-relaxed">
        <strong>{PRACTICE.competitorName}</strong> holds #1 with a {PRACTICE.competitorRating}-star rating and {gap} more reviews than you.
      </p>
      <p className="text-xs text-[#D56753] font-medium mt-2">
        {gap} reviews to close. At 3/week, that's {Math.ceil(gap / 3)} weeks.
      </p>
    </div>
  );
}

// ─── Referral Network ───────────────────────────────────────────────

function ReferralNetwork() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-[#D56753]" />
          <p className="text-xs font-bold uppercase tracking-wider text-[#D56753]">Referral Network</p>
        </div>
        <span className="text-xs text-gray-400">{REFERRING_GPS.reduce((s, g) => s + g.referrals, 0)} referrals this quarter</span>
      </div>
      <div className="space-y-3">
        {REFERRING_GPS.map((gp) => (
          <div
            key={gp.name}
            className={`flex items-center justify-between rounded-xl px-4 py-3 ${
              gp.status === "drift" ? "bg-red-50 border border-red-100" : "bg-gray-50"
            }`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-[#212D40] truncate">{gp.name}</p>
                {gp.status === "drift" && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-100 rounded-full px-2 py-0.5">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    DRIFT
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500">{gp.practice}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[11px] font-medium ${
                  gp.trend === "up" ? "text-emerald-600" : gp.trend === "down" ? "text-red-500" : "text-gray-400"
                }`}>
                  {gp.trend === "up" && <TrendingUp className="h-3 w-3 inline mr-0.5" />}
                  {gp.trend === "down" && <TrendingDown className="h-3 w-3 inline mr-0.5" />}
                  {gp.trendLabel}
                </span>
              </div>
            </div>
            <div className="text-right shrink-0 ml-4">
              <p className="text-lg font-black text-[#212D40]">{gp.referrals}</p>
              <p className="text-[10px] text-gray-400">referrals</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Last: {gp.lastReferral}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tasks with Why ─────────────────────────────────────────────────

function DemoTasks() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="h-5 w-5 text-[#D56753]" />
        <p className="text-xs font-bold uppercase tracking-wider text-[#D56753]">This Week's Tasks</p>
      </div>
      <div className="space-y-4">
        {TASKS.map((task, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-[#D56753] text-white flex items-center justify-center text-xs font-bold mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm font-bold text-[#212D40]">{task.title}</p>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed ml-9">{task.why}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Progress Report Mini ───────────────────────────────────────────

function DemoProgressReport() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Calendar className="h-5 w-5 text-[#D56753]" />
        <p className="text-xs font-bold uppercase tracking-wider text-[#D56753]">365-Day Progress</p>
      </div>

      {/* Hero stat */}
      <div className="bg-[#212D40] rounded-2xl p-6 text-center text-white">
        <p className="text-5xl font-black">47</p>
        <p className="text-sm font-medium text-white/70 mt-1">Alloro tasks completed this year</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
          <p className="text-xl font-black text-emerald-600">+3</p>
          <p className="text-[10px] font-bold text-gray-400 uppercase mt-1">Positions</p>
          <p className="text-[10px] text-gray-400">#6 → #3</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
          <p className="text-xl font-black text-[#212D40]">+19</p>
          <p className="text-[10px] font-bold text-gray-400 uppercase mt-1">Reviews</p>
          <p className="text-[10px] text-gray-400">42 → 61</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
          <p className="text-xl font-black text-[#D56753]">+19</p>
          <p className="text-[10px] font-bold text-gray-400 uppercase mt-1">Score</p>
          <p className="text-[10px] text-gray-400">42 → 61</p>
        </div>
      </div>

      {/* Top moves */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Top Moves</p>
        {TOP_MOVES.map((move, i) => (
          <div key={i} className="flex items-start gap-3 bg-white border border-gray-200 rounded-xl p-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-[#212D40]">{move.title}</p>
              <p className="text-xs text-emerald-600 font-medium">{move.outcome}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{move.date}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Next 90 Days ───────────────────────────────────────────────────

function DemoNext90() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Target className="h-5 w-5 text-[#D56753]" />
        <p className="text-xs font-bold uppercase tracking-wider text-[#D56753]">Next 90 Days</p>
      </div>
      <div className="space-y-3">
        {NEXT_90.map((action, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-[#D56753] text-white flex items-center justify-center text-xs font-bold mt-0.5">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-bold text-[#212D40]">{action.title}</p>
                <p className="text-xs text-gray-500 leading-relaxed mt-1.5">{action.why}</p>
                <p className="text-xs font-semibold text-[#D56753] mt-2">{action.impact}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CS Agent Activity ──────────────────────────────────────────────

function DemoCSAgent() {
  const actions = [
    { time: "2h ago", text: "Detected Dr. Torres referral drift. 40 days since last referral. Flagged for outreach.", type: "alert" },
    { time: "Yesterday", text: "Sent review request to 3 recent clients. 1 review received (5★).", type: "success" },
    { time: "2 days ago", text: "Dr. Lisa Park has been silent for 74 days. Added to re-engagement queue.", type: "alert" },
    { time: "3 days ago", text: "Weekly ranking scan complete. Position held at #3. Score improved +2 to 61.", type: "info" },
    { time: "Last week", text: "New referring relationship detected: Dr. James Okafor sent 2 clients in 10 days.", type: "success" },
  ];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-5 w-5 text-[#D56753]" />
        <p className="text-xs font-bold uppercase tracking-wider text-[#D56753]">CS Agent Activity</p>
      </div>
      <div className="space-y-3">
        {actions.map((a, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${
              a.type === "alert" ? "bg-red-400" : a.type === "success" ? "bg-emerald-400" : "bg-blue-400"
            }`} />
            <div>
              <p className="text-sm text-gray-700">{a.text}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{a.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Demo Page ─────────────────────────────────────────────────

export default function Demo() {
  return (
    <div className="min-h-dvh bg-[#FAFAF8]">
      {/* Header */}
      <header className="bg-[#212D40] text-white py-4 px-5">
        <div className="mx-auto max-w-2xl flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#D56753] flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L14 14H2L8 2Z" fill="white" opacity="0.9"/>
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight">alloro</span>
          </Link>
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 bg-white/10 px-3 py-1 rounded-full">
            Demo
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        {/* Greeting */}
        <div>
          <h1 className="text-2xl font-extrabold text-[#212D40]">
            Good morning, Dr. Hayward.
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Here's what Alloro found this week for {PRACTICE.name}.
          </p>
          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            {PRACTICE.city}, {PRACTICE.state}
          </p>
        </div>

        {/* Signal */}
        <SignalBanner />

        {/* Position + Trajectory */}
        <DemoPositionCard />
        <RankingSparkline />

        {/* Competitor */}
        <DemoCompetitorGap />

        {/* Referral Network */}
        <ReferralNetwork />

        {/* Tasks */}
        <DemoTasks />

        {/* CS Agent */}
        <DemoCSAgent />

        {/* Progress Report */}
        <DemoProgressReport />

        {/* Next 90 Days */}
        <DemoNext90 />

        {/* CTA */}
        <div className="rounded-2xl bg-[#212D40] p-6 text-center text-white">
          <p className="text-lg font-bold">This is Alloro running for 4 months.</p>
          <p className="text-sm text-white/70 mt-2">
            From #6 to #3. From 42 reviews to 61. From blind to seeing every referral pattern in your market.
          </p>
          <a
            href="/checkup"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#D56753] text-white text-sm font-semibold px-6 py-3 shadow-[0_4px_14px_rgba(213,103,83,0.4)] hover:brightness-110 transition-all"
          >
            Run your free Checkup
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-gray-300 uppercase tracking-wide pt-4">
          Demo account &middot; Valley Specialty Practice &middot; Salt Lake City, UT
        </p>
      </div>
    </div>
  );
}
