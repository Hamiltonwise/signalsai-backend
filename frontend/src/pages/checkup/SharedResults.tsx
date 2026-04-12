/**
 * SharedResults -- /checkup/shared/:shareId
 *
 * Public page that renders a shared Checkup result card.
 * Shows market data only (no practice name, no score).
 * Prompts visitor to run their own Checkup. Viral loop.
 */

import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Loader2, Users, ExternalLink } from "lucide-react";

interface SharedCard {
  score: number; // Still passed from backend, not displayed
  city: string;
  specialty: string;
  rank: number;
  totalCompetitors: number;
  topCompetitorName: string | null;
}

export default function SharedResults() {
  const { shareId } = useParams<{ shareId: string }>();
  const [card, setCard] = useState<SharedCard | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!shareId) return;
    fetch(`/api/checkup/shared/${shareId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.card) {
          setCard(data.card);
          if (data.card.referralCode) setReferralCode(data.card.referralCode);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [shareId]);

  return (
    <div className="min-h-dvh bg-[#F8F6F2] flex flex-col">
      <header className="flex items-center justify-center pt-10 pb-6 px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#D56753] flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L14 14H2L8 2Z" fill="white" opacity="0.9" />
            </svg>
          </div>
          <span className="text-[22px] font-semibold tracking-tight text-[#1A1D23]">
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
            <h1 className="text-2xl font-semibold text-[#1A1D23] mb-4">
              This link has expired
            </h1>
            <p className="text-base text-gray-500 mb-8">
              Run your own free Checkup to see how you compare in your market.
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
            <p className="text-center text-base font-semibold text-[#1A1D23] mb-1">
              A colleague just checked their market. Have you?
            </p>
            <p className="text-center text-sm text-gray-500 mb-6">
              {card.specialty} in {card.city}
            </p>

            <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 overflow-hidden">
              <div className="h-1.5 bg-[#D56753]" />
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-[#D56753]" />
                  <div>
                    <p className="text-lg font-semibold text-[#1A1D23]">
                      {card.totalCompetitors} competitors
                    </p>
                    <p className="text-sm text-gray-500">
                      in the {card.city} {card.specialty.toLowerCase()} market
                    </p>
                  </div>
                </div>

                {card.topCompetitorName && (
                  <div className="rounded-xl bg-[#F8F6F2] p-4">
                    <p className="text-sm text-gray-500">Top competitor in this market:</p>
                    <p className="text-base font-semibold text-[#1A1D23] mt-0.5">
                      {card.topCompetitorName}
                    </p>
                    <a
                      href={`https://www.google.com/search?q=${encodeURIComponent(card.topCompetitorName)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[#D56753] font-semibold mt-1.5 hover:underline"
                    >
                      Verify on Google <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                <div className="border-t border-stone-200/60 pt-4">
                  <Link
                    to={referralCode ? `/checkup?ref=${referralCode}` : "/checkup"}
                    className="flex items-center justify-center gap-2 w-full rounded-xl bg-[#D56753] text-white text-base font-semibold px-6 py-4 shadow-[0_4px_20px_rgba(213,103,83,0.4)] hover:brightness-110 active:scale-[0.98] transition-all"
                  >
                    See how you compare
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <p className="text-center text-xs text-gray-400 mt-3">
                    Free. 60 seconds. No one sees your results but you.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="py-8 text-center border-t border-stone-100">
        <p className="text-xs font-semibold tracking-wide text-gray-300 uppercase">
          Alloro
        </p>
      </footer>
    </div>
  );
}
