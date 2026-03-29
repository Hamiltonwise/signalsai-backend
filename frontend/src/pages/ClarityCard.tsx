/**
 * ClarityCard -- /clarity/:id
 *
 * Public, no-auth page. Screenshot-worthy Business Clarity Score card
 * designed for LinkedIn posts, text messages, and social sharing.
 * Shows score ring, city, specialty, rank. No business name.
 * "Powered by Alloro" footer + CTA to /checkup.
 */

import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Loader2, BarChart3, Users, TrendingUp } from "lucide-react";

interface ScoreCard {
  score: number;
  rank: number;
  city: string;
  specialty: string;
  totalCompetitors: number;
}

function tierColor(score: number): string {
  if (score >= 75) return "#10b981";
  if (score >= 40) return "#f59e0b";
  return "#D56753";
}

function tierMessage(score: number): string {
  if (score >= 75) return "Strong foundation.";
  if (score >= 40) return "Room to grow, and we know exactly where.";
  return "There's a clear path forward.";
}

function tierTextClass(score: number): string {
  if (score >= 75) return "text-emerald-600";
  if (score >= 40) return "text-amber-600";
  return "text-[#D56753]";
}

export default function ClarityCard() {
  const { id } = useParams<{ id: string }>();
  const [card, setCard] = useState<ScoreCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/clarity-card/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.card) {
          setCard(data.card);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#FAFAF8] to-[#F0EFEB] flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-center pt-10 pb-4 px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#D56753] flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L14 14H2L8 2Z" fill="white" opacity="0.9" />
            </svg>
          </div>
          <span className="text-[22px] font-bold tracking-tight text-[#212D40]">
            alloro
          </span>
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-5 pb-10">
        {loading && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#D56753]" />
            <p className="text-sm text-gray-400">Loading score card...</p>
          </div>
        )}

        {error && (
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-bold text-[#212D40] mb-4">
              Score card not available
            </h1>
            <p className="text-base text-[#212D40]/60 mb-8">
              Run your own free Checkup to see where you stand.
            </p>
            <Link
              to="/checkup"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#D56753] text-white text-base font-semibold px-8 py-4 hover:brightness-110 transition-all"
            >
              Check YOUR score
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {card && (
          <div className="max-w-sm w-full">
            {/* Headline */}
            <p className="text-center text-sm font-medium text-[#212D40]/50 mb-1 uppercase tracking-wider">
              Business Clarity Score
            </p>
            <p className="text-center text-base text-[#212D40]/70 mb-6">
              {card.specialty} in {card.city}
            </p>

            {/* The Card -- screenshot-worthy */}
            <div className="rounded-3xl border border-[#212D40]/10 bg-white overflow-hidden shadow-lg shadow-black/5">
              {/* Color bar */}
              <div className="h-1.5" style={{ background: tierColor(card.score) }} />

              <div className="px-8 pt-8 pb-6">
                {/* Large score ring */}
                <div className="flex justify-center mb-4">
                  <div className="w-44 h-44 rounded-full flex items-center justify-center relative">
                    <div
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: `conic-gradient(${tierColor(card.score)} ${card.score * 3.6}deg, #f1f5f9 0deg)`,
                        mask: "radial-gradient(farthest-side, transparent calc(100% - 8px), #000 calc(100% - 8px))",
                        WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 8px), #000 calc(100% - 8px))",
                      }}
                    />
                    <div className="flex flex-col items-center">
                      <span className="text-5xl font-black text-[#212D40] tabular-nums">
                        {card.score}
                      </span>
                      <span className="text-xs font-semibold text-[#212D40]/40 mt-0.5">
                        / 100
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tier message */}
                <p className={`text-sm text-center font-semibold mb-6 ${tierTextClass(card.score)}`}>
                  {tierMessage(card.score)}
                </p>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div className="text-center bg-[#FAFAF8] rounded-xl py-3 px-2">
                    <TrendingUp className="w-4 h-4 text-[#D56753] mx-auto mb-1.5" />
                    <p className="text-lg font-bold text-[#212D40]">#{card.rank}</p>
                    <p className="text-[10px] text-[#212D40]/50 uppercase font-medium">Rank</p>
                  </div>
                  <div className="text-center bg-[#FAFAF8] rounded-xl py-3 px-2">
                    <Users className="w-4 h-4 text-[#D56753] mx-auto mb-1.5" />
                    <p className="text-lg font-bold text-[#212D40]">{card.totalCompetitors}</p>
                    <p className="text-[10px] text-[#212D40]/50 uppercase font-medium">In Market</p>
                  </div>
                  <div className="text-center bg-[#FAFAF8] rounded-xl py-3 px-2">
                    <BarChart3 className="w-4 h-4 text-[#D56753] mx-auto mb-1.5" />
                    <p className="text-lg font-bold text-[#212D40]">{card.score}</p>
                    <p className="text-[10px] text-[#212D40]/50 uppercase font-medium">Score</p>
                  </div>
                </div>

                {/* CTA */}
                <Link
                  to="/checkup"
                  className="flex items-center justify-center gap-2 w-full rounded-xl bg-[#D56753] text-white text-base font-semibold px-6 py-4 shadow-[0_4px_20px_rgba(213,103,83,0.4)] hover:brightness-110 active:scale-[0.98] transition-all"
                >
                  Check YOUR score
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <p className="text-center text-xs text-[#212D40]/40 mt-3">
                  Free. 60 seconds. No one sees your results but you.
                </p>
              </div>

              {/* Powered by footer */}
              <div className="border-t border-[#212D40]/5 py-4 px-8 bg-[#FAFAF8]">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-[11px] text-[#212D40]/30 font-medium">Powered by</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded bg-[#D56753] flex items-center justify-center">
                      <svg width="8" height="8" viewBox="0 0 16 16" fill="none">
                        <path d="M8 2L14 14H2L8 2Z" fill="white" opacity="0.9" />
                      </svg>
                    </div>
                    <span className="text-[12px] font-bold tracking-tight text-[#212D40]/50">
                      alloro
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="py-6 text-center">
        <p className="text-[11px] font-medium tracking-wide text-slate-300 uppercase">
          Business Clarity
        </p>
      </footer>
    </div>
  );
}
