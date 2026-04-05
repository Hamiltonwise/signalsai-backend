/**
 * ClarityCard -- /clarity/:id
 *
 * Public, no-auth page. Screenshot-worthy share card
 * designed for LinkedIn posts, text messages, and social sharing.
 * Shows market context and competitor info. No composite score.
 * No business name (privacy). "Powered by Alloro" footer + CTA.
 */

import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Loader2, Users, ExternalLink } from "lucide-react";

interface ShareCard {
  score: number; // Still passed from backend, not displayed
  rank: number;
  city: string;
  specialty: string;
  totalCompetitors: number;
  topCompetitorName?: string | null;
  reviewCount?: number | null;
  competitorReviewCount?: number | null;
}

export default function ClarityCard() {
  const { id } = useParams<{ id: string }>();
  const [card, setCard] = useState<ShareCard | null>(null);
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
    <div className="min-h-dvh bg-[#F8F6F2] flex flex-col">
      <header className="flex items-center justify-center pt-10 pb-4 px-4">
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

      <main className="flex-1 flex flex-col items-center justify-center px-5 pb-10">
        {loading && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#D56753]" />
            <p className="text-sm text-gray-400">Loading...</p>
          </div>
        )}

        {error && (
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-semibold text-[#1A1D23] mb-4">
              This link has expired
            </h1>
            <p className="text-base text-gray-500 mb-8">
              Run your own free Google Health Check to see how you compare.
            </p>
            <Link
              to="/checkup"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#D56753] text-white text-base font-semibold px-8 py-4 hover:brightness-110 transition-all"
            >
              Run your free checkup
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {card && (
          <div className="max-w-sm w-full">
            <p className="text-center text-sm font-semibold text-[#1A1D23]/50 mb-1 uppercase tracking-wider">
              Google Health Check
            </p>
            <p className="text-center text-base text-gray-500 mb-6">
              {card.specialty} in {card.city}
            </p>

            <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 overflow-hidden">
              <div className="h-1.5 bg-[#D56753]" />

              <div className="p-6 space-y-4">
                {/* Market context */}
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

                {/* Competitor comparison */}
                {card.topCompetitorName && (
                  <div className="rounded-xl bg-[#F8F6F2] p-4">
                    <p className="text-sm text-gray-500">Top competitor:</p>
                    <p className="text-base font-semibold text-[#1A1D23] mt-0.5">
                      {card.topCompetitorName}
                    </p>
                    {card.competitorReviewCount != null && (
                      <p className="text-sm text-gray-400 mt-1">
                        {card.competitorReviewCount} reviews
                      </p>
                    )}
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

                {/* CTA */}
                <div className="border-t border-stone-200/60 pt-4">
                  <Link
                    to="/checkup"
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

              <div className="border-t border-stone-200/40 py-3 px-6 bg-stone-50/50">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xs text-gray-300 font-medium">Powered by</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded bg-[#D56753] flex items-center justify-center">
                      <svg width="8" height="8" viewBox="0 0 16 16" fill="none">
                        <path d="M8 2L14 14H2L8 2Z" fill="white" opacity="0.9" />
                      </svg>
                    </div>
                    <span className="text-xs font-semibold tracking-tight text-gray-400">
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
        <p className="text-xs font-semibold tracking-wide text-gray-300 uppercase">
          Alloro
        </p>
      </footer>
    </div>
  );
}
