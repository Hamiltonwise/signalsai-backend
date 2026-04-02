/**
 * SharedResults -- /checkup/shared/:shareId
 *
 * Public page that renders a shared Checkup result card.
 * Shows market data only (no practice name). Prompts visitor
 * to run their own Checkup. Viral loop.
 */

import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Loader2, BarChart3, Users, Star } from "lucide-react";

interface SharedCard {
  score: number;
  city: string;
  specialty: string;
  rank: number;
  totalCompetitors: number;
  topCompetitorName: string | null;
}

export default function SharedResults() {
  const { shareId } = useParams<{ shareId: string }>();
  const [card, setCard] = useState<SharedCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!shareId) return;
    fetch(`/api/checkup/shared/${shareId}`)
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
  }, [shareId]);

  return (
    <div className="min-h-dvh bg-[#F7F8FA] flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-center pt-10 pb-6 px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#D56753] flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L14 14H2L8 2Z" fill="white" opacity="0.9" />
            </svg>
          </div>
          <span className="text-[22px] font-bold tracking-tight text-[#1A1D23]">
            alloro
          </span>
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center px-5 pb-10">
        {loading && (
          <div className="flex flex-col items-center gap-3 mt-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#D56753]" />
            <p className="text-sm text-gray-400">Loading market data...</p>
          </div>
        )}

        {error && (
          <div className="max-w-md text-center mt-20">
            <h1 className="text-2xl font-bold text-[#1A1D23] mb-4">
              This link has expired
            </h1>
            <p className="text-base text-[#1A1D23]/60 mb-8">
              Run your own free Checkup to see your market.
            </p>
            <Link
              to="/checkup"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#D56753] text-white text-base font-semibold px-8 py-4 hover:brightness-110 transition-all"
            >
              Run your free Checkup
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {card && (
          <div className="max-w-md w-full mt-8">
            {/* Context — competitive framing */}
            <p className="text-center text-base font-semibold text-[#1A1D23] mb-1">
              A colleague scored {card.score}. Where do you rank?
            </p>
            <p className="text-center text-sm text-[#1A1D23]/50 mb-6">
              {card.specialty} in {card.city}
            </p>

            {/* Score card */}
            <div className="rounded-2xl border-2 border-[#212D40]/10 bg-white overflow-hidden shadow-sm">
              <div className="h-1.5 bg-[#D56753]" />
              <div className="p-6">
                {/* Score ring — large and prominent */}
                <div className="flex justify-center mb-3">
                  <div className="w-36 h-36 rounded-full flex items-center justify-center relative">
                    <div
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: `conic-gradient(${card.score >= 75 ? "#10b981" : card.score >= 40 ? "#f59e0b" : "#D56753"} ${card.score * 3.6}deg, #f1f5f9 0deg)`,
                        mask: "radial-gradient(farthest-side, transparent calc(100% - 6px), #000 calc(100% - 6px))",
                        WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 6px), #000 calc(100% - 6px))",
                      }}
                    />
                    <div className="flex flex-col items-center">
                      <span className="text-4xl font-semibold text-[#1A1D23]">{card.score}</span>
                      <span className="text-xs font-semibold text-[#1A1D23]/50">/ 100</span>
                    </div>
                  </div>
                </div>

                {/* Score tier message */}
                <p className={`text-sm text-center font-medium mb-5 ${
                  card.score >= 75 ? "text-emerald-600" : card.score >= 40 ? "text-amber-600" : "text-[#D56753]"
                }`}>
                  {card.score >= 75
                    ? "Strong foundation."
                    : card.score >= 40
                      ? "Room to grow, and we know exactly where."
                      : "There's a clear path forward."}
                </p>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="text-center">
                    <BarChart3 className="w-4 h-4 text-[#D56753] mx-auto mb-1" />
                    <p className="text-lg font-bold text-[#1A1D23]">#{card.rank}</p>
                    <p className="text-xs text-[#1A1D23]/50 uppercase">Rank</p>
                  </div>
                  <div className="text-center">
                    <Users className="w-4 h-4 text-[#D56753] mx-auto mb-1" />
                    <p className="text-lg font-bold text-[#1A1D23]">{card.totalCompetitors}</p>
                    <p className="text-xs text-[#1A1D23]/50 uppercase">Competitors</p>
                  </div>
                  <div className="text-center">
                    <Star className="w-4 h-4 text-[#D56753] mx-auto mb-1" />
                    <p className="text-lg font-bold text-[#1A1D23]">{card.score}</p>
                    <p className="text-xs text-[#1A1D23]/50 uppercase">Score</p>
                  </div>
                </div>

                {card.topCompetitorName && (
                  <p className="text-sm text-[#1A1D23]/60 text-center mb-6 leading-relaxed">
                    The top competitor in this market is{" "}
                    <span className="font-semibold text-[#1A1D23]">{card.topCompetitorName}</span>.
                  </p>
                )}

                {/* CTA */}
                <div className="border-t border-gray-100 pt-6">
                  <Link
                    to="/checkup"
                    className="flex items-center justify-center gap-2 w-full rounded-xl bg-[#D56753] text-white text-base font-semibold px-6 py-4 shadow-[0_4px_20px_rgba(213,103,83,0.4)] hover:brightness-110 active:scale-[0.98] transition-all"
                  >
                    Check your score
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <p className="text-center text-xs text-[#1A1D23]/40 mt-3">
                    Free. 60 seconds. No one sees your results but you.
                  </p>

                  {/* Competitive nudge */}
                  <p className="text-center text-sm font-bold text-[#1A1D23] mt-4">
                    Can you beat {card.score}?
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="py-8 text-center border-t border-slate-100">
        <p className="text-xs font-medium tracking-wide text-slate-300 uppercase">
          Alloro &middot; Business Clarity
        </p>
      </footer>
    </div>
  );
}
