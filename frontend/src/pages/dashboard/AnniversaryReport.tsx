/**
 * Anniversary Report -- U-NEW-5
 *
 * A beautiful, shareable page showing the org's journey on Alloro.
 * "Started: #7. Today: #3." with key stats, milestones, and revenue protected.
 *
 * If account < 90 days, shows an encouraging "check back" message.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Share2, Printer, TrendingUp, Star, Trophy, DollarSign, Clock, ChevronRight } from "lucide-react";

interface AnniversaryData {
  tooEarly: boolean;
  daysActive?: number;
  daysUntilReport?: number;
  monthsActive: number;
  createdAt: string;
  orgName?: string;
  ranking?: {
    startPosition: number | null;
    currentPosition: number | null;
    positionDelta: number | null;
  };
  reviews?: {
    baseline: number | null;
    current: number | null;
    gained: number | null;
  };
  milestones?: { title: string; achievedAt: string }[];
  milestonesCount?: number;
  revenueProtected?: {
    fromReviews: number;
    fromPosition: number;
    total: number;
  };
  topMoments?: { title: string; date: string; detail: string }[];
  snapshotCount?: number;
}

export default function AnniversaryReport() {
  const navigate = useNavigate();
  const [data, setData] = useState<AnniversaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch("/api/user/anniversary-report", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setData(res.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-[#D56753]" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-gray-500">Unable to load your anniversary report.</p>
        <button
          onClick={() => navigate("/home")}
          className="mt-4 text-sm font-medium text-[#D56753] hover:underline"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  // Too early state
  if (data.tooEarly) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <button
          onClick={() => navigate("/home")}
          className="mb-8 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 print:hidden"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </button>
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
            <Clock className="h-8 w-8 text-amber-500" />
          </div>
          <h1 className="text-2xl font-bold text-[#212D40]">
            Your Anniversary Report Builds Over Time
          </h1>
          <p className="mt-3 text-gray-600">
            You have been on Alloro for {data.daysActive} day{data.daysActive !== 1 ? "s" : ""}.
            Check back at your 90-day mark for a full report on your journey.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-gray-50 px-4 py-2 text-sm text-gray-500">
            <Clock className="h-4 w-4" />
            {data.daysUntilReport} days until your first report
          </div>
        </div>
      </div>
    );
  }

  const { ranking, reviews, revenueProtected, topMoments, milestones } = data;
  const startDate = new Date(data.createdAt).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Navigation */}
      <div className="mb-8 flex items-center justify-between print:hidden">
        <button
          onClick={() => navigate("/home")}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </button>
        <div className="flex gap-2">
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <Share2 className="h-4 w-4" />
            {copied ? "Copied!" : "Share with a colleague"}
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
        </div>
      </div>

      {/* Hero header */}
      <div className="mb-10 rounded-2xl bg-gradient-to-br from-[#212D40] to-[#2a3a52] p-8 text-white shadow-lg">
        <p className="text-sm font-medium uppercase tracking-wider text-white/60">
          Anniversary Report
        </p>
        <h1 className="mt-2 text-3xl font-bold">{data.orgName}</h1>
        <p className="mt-1 text-white/70">
          {data.monthsActive} month{data.monthsActive !== 1 ? "s" : ""} on Alloro, since {startDate}
        </p>

        {/* Big rank statement */}
        {ranking?.startPosition && ranking?.currentPosition && (
          <div className="mt-8 text-center">
            <p className="text-lg text-white/60">Your market position</p>
            <div className="mt-2 flex items-center justify-center gap-4">
              <div>
                <p className="text-sm text-white/50">Started</p>
                <p className="text-5xl font-bold">#{ranking.startPosition}</p>
              </div>
              <ChevronRight className="h-8 w-8 text-[#D56753]" />
              <div>
                <p className="text-sm text-white/50">Today</p>
                <p className="text-5xl font-bold text-[#D56753]">#{ranking.currentPosition}</p>
              </div>
            </div>
            {ranking.positionDelta != null && ranking.positionDelta > 0 && (
              <p className="mt-3 text-sm text-emerald-400">
                Up {ranking.positionDelta} position{ranking.positionDelta > 1 ? "s" : ""}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Key stats grid */}
      <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          icon={<TrendingUp className="h-5 w-5 text-emerald-500" />}
          label="Positions gained"
          value={
            ranking?.positionDelta != null && ranking.positionDelta > 0
              ? `+${ranking.positionDelta}`
              : "---"
          }
        />
        <StatCard
          icon={<Star className="h-5 w-5 text-amber-500" />}
          label="Reviews added"
          value={
            reviews?.gained != null && reviews.gained > 0
              ? `+${reviews.gained}`
              : "---"
          }
        />
        <StatCard
          icon={<DollarSign className="h-5 w-5 text-[#D56753]" />}
          label="Revenue protected"
          value={
            revenueProtected?.total
              ? `$${revenueProtected.total.toLocaleString()}`
              : "---"
          }
        />
        <StatCard
          icon={<Trophy className="h-5 w-5 text-purple-500" />}
          label="Milestones"
          value={String(data.milestonesCount ?? 0)}
        />
      </div>

      {/* Top moments timeline */}
      {topMoments && topMoments.length > 0 && (
        <div className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-[#212D40]">Key Moments</h2>
          <div className="space-y-4">
            {topMoments.map((moment, i) => (
              <div
                key={i}
                className="flex gap-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#D56753]/10 text-sm font-bold text-[#D56753]">
                  {i + 1}
                </div>
                <div>
                  <p className="font-semibold text-[#212D40]">{moment.title}</p>
                  <p className="mt-0.5 text-sm text-gray-500">{moment.detail}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    {new Date(moment.date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Milestones list */}
      {milestones && milestones.length > 0 && (
        <div className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-[#212D40]">Milestones Achieved</h2>
          <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
            {milestones.map((m, i) => (
              <div
                key={i}
                className={`flex items-center justify-between px-5 py-3 ${
                  i < milestones.length - 1 ? "border-b border-gray-50" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="text-sm font-medium text-[#212D40]">{m.title}</span>
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(m.achievedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Revenue breakdown */}
      {revenueProtected && revenueProtected.total > 0 && (
        <div className="mb-10 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-[#212D40]">
            Revenue Protected: ${revenueProtected.total.toLocaleString()}
          </h2>
          <p className="text-sm text-gray-500">Estimated annual revenue impact from your improved visibility.</p>
          <div className="mt-4 space-y-2">
            {revenueProtected.fromReviews > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">From review growth</span>
                <span className="font-medium text-[#212D40]">
                  ${revenueProtected.fromReviews.toLocaleString()}
                </span>
              </div>
            )}
            {revenueProtected.fromPosition > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">From ranking improvement</span>
                <span className="font-medium text-[#212D40]">
                  ${revenueProtected.fromPosition.toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center text-xs text-gray-400 print:mt-8">
        <p>Generated by Alloro on {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
      </div>

      {/* Print-optimized CSS */}
      <style>{`
        @media print {
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
          .print\\:mt-8 { margin-top: 2rem; }
        }
      `}</style>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-2">{icon}</div>
      <p className="text-2xl font-bold text-[#212D40]">{value}</p>
      <p className="mt-0.5 text-xs text-gray-500">{label}</p>
    </div>
  );
}
