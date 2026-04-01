/**
 * Competitor Comparison Page -- /compare
 *
 * Shareable public page. No auth required.
 * Two columns: Your practice vs competitor.
 * URL: /compare?practice=[placeId]&competitor=[placeId]
 *
 * Uses GET /api/checkup/compare?p1=[id]&p2=[id]
 * // T2 registers GET /api/checkup/compare
 */

import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, Star, MessageSquare, MapPin, Trophy, Loader2 } from "lucide-react";
import MarketingLayout from "../components/marketing/MarketingLayout";

// ─── Types ──────────────────────────────────────────────────────────

interface PracticeData {
  name: string;
  placeId: string;
  city: string;
  rating: number;
  reviewCount: number;
  rank: number | null;
  totalInMarket: number | null;
  category: string;
}

interface CompareResponse {
  success: boolean;
  practice: PracticeData;
  competitor: PracticeData;
  market: string;
}

// ─── Component ──────────────────────────────────────────────────────

export default function Compare() {
  const [searchParams] = useSearchParams();
  const practiceId = searchParams.get("practice") || "";
  const competitorId = searchParams.get("competitor") || "";

  const [data, setData] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!practiceId || !competitorId) {
      setLoading(false);
      setError(true);
      return;
    }

    fetch(
      `/api/checkup/compare?p1=${encodeURIComponent(practiceId)}&p2=${encodeURIComponent(competitorId)}`
    )
      .then((res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.json();
      })
      .then((json: CompareResponse) => {
        if (json.success) {
          setData(json);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [practiceId, competitorId]);

  // ─── Loading ──────────────────────────────────────────────────

  if (loading) {
    return (
      <MarketingLayout title="Comparing..." description="Loading competitor comparison.">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-[#D56753] animate-spin" />
        </div>
      </MarketingLayout>
    );
  }

  // ─── Empty / Error State ──────────────────────────────────────

  if (error || !data) {
    return (
      <MarketingLayout title="Comparison" description="Competitive comparison between two businesses.">
        <div className="max-w-lg mx-auto px-5 py-16 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-slate-100 mb-5">
            <MapPin className="w-7 h-7 text-slate-400" />
          </div>
          <h2 className="text-xl font-extrabold text-[#212D40]">
            Comparison not available
          </h2>
          <p className="mt-3 text-sm text-slate-500 leading-relaxed">
            We need two valid business IDs to build this comparison.
            Run a Checkup first to find competitors in your market.
          </p>
          <a
            href="/checkup"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#D56753] text-white text-sm font-semibold px-6 py-3 shadow-[0_4px_14px_rgba(213,103,83,0.35)] hover:brightness-105 transition-all"
          >
            Run a free Checkup
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </MarketingLayout>
    );
  }

  const { practice: p, competitor: c, market } = data;
  const reviewDelta = p.reviewCount - c.reviewCount;
  const ratingDelta = +(p.rating - c.rating).toFixed(1);

  return (
    <MarketingLayout title={`${p.name} vs ${c.name}`} description={`Competitive comparison in ${market}`}>

      <div className="max-w-2xl mx-auto px-5 py-10 space-y-8">
        {/* Title */}
        <div className="text-center">
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#212D40] tracking-tight leading-tight">
            {p.name} vs {c.name}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Competitive comparison in {market}
          </p>
        </div>

        {/* Comparison Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Headers */}
          <div className="rounded-xl bg-[#212D40] p-4 text-center">
            <p className="text-xs font-bold uppercase tracking-wider text-white/50 mb-1">
              Your business
            </p>
            <p className="text-sm font-bold text-white truncate">{p.name}</p>
          </div>
          <div className="rounded-xl bg-slate-100 p-4 text-center">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
              Competitor
            </p>
            <p className="text-sm font-bold text-[#212D40] truncate">{c.name}</p>
          </div>

          {/* Reviews */}
          <MetricCell
            icon={MessageSquare}
            label="Reviews"
            value={String(p.reviewCount)}
            highlight={p.reviewCount >= c.reviewCount}
          />
          <MetricCell
            icon={MessageSquare}
            label="Reviews"
            value={String(c.reviewCount)}
            highlight={c.reviewCount > p.reviewCount}
          />

          {/* Rating */}
          <MetricCell
            icon={Star}
            label="Rating"
            value={`${p.rating.toFixed(1)}`}
            highlight={p.rating >= c.rating}
          />
          <MetricCell
            icon={Star}
            label="Rating"
            value={`${c.rating.toFixed(1)}`}
            highlight={c.rating > p.rating}
          />

          {/* Rank */}
          {p.rank !== null && c.rank !== null && (
            <>
              <MetricCell
                icon={Trophy}
                label="Position"
                value={`#${p.rank}`}
                highlight={p.rank <= (c.rank ?? Infinity)}
              />
              <MetricCell
                icon={Trophy}
                label="Position"
                value={`#${c.rank}`}
                highlight={(c.rank ?? Infinity) < p.rank}
              />
            </>
          )}

          {/* Category */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Category
            </p>
            <p className="text-xs text-[#212D40] font-medium">{p.category || "--"}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Category
            </p>
            <p className="text-xs text-[#212D40] font-medium">{c.category || "--"}</p>
          </div>
        </div>

        {/* Delta Summary */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-[#D56753] mb-3">
            The gap
          </p>
          <div className="space-y-2">
            <p className="text-sm text-[#212D40]/80 leading-relaxed">
              {reviewDelta > 0
                ? `You have ${reviewDelta} more reviews than ${c.name}.`
                : reviewDelta < 0
                  ? `${c.name} has ${Math.abs(reviewDelta)} more reviews than you.`
                  : `You and ${c.name} have the same number of reviews.`}
            </p>
            <p className="text-sm text-[#212D40]/80 leading-relaxed">
              {ratingDelta > 0
                ? `Your rating is ${ratingDelta} stars higher.`
                : ratingDelta < 0
                  ? `Their rating is ${Math.abs(ratingDelta)} stars higher.`
                  : "Ratings are tied."}
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <a
            href="/checkup"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-xl bg-[#D56753] text-white text-base font-semibold px-8 py-4 shadow-[0_4px_20px_rgba(213,103,83,0.4)] hover:shadow-[0_6px_28px_rgba(213,103,83,0.5)] hover:brightness-110 active:scale-[0.98] transition-all"
          >
            Run a full Business Clarity Checkup
            <ArrowRight className="w-4 h-4" />
          </a>
          <p className="mt-3 text-xs text-slate-400">
            Free. 60 seconds. See your score instantly.
          </p>
        </div>

      </div>
    </MarketingLayout>
  );
}

// ─── Metric Cell ────────────────────────────────────────────────────

function MetricCell({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  highlight: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 text-center ${
        highlight
          ? "border-[#D56753]/30 bg-[#D56753]/[0.03]"
          : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-center gap-1.5 mb-1">
        <Icon className={`w-3.5 h-3.5 ${highlight ? "text-[#D56753]" : "text-slate-400"}`} />
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {label}
        </p>
      </div>
      <p
        className={`text-2xl font-black ${
          highlight ? "text-[#D56753]" : "text-[#212D40]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

// T1 adds /compare route to App.tsx
