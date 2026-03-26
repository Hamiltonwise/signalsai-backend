/**
 * HomePage -- /
 *
 * The front door. 55 seconds. One question: Can I trust this?
 * The first sentence either earns trust or the visitor is gone.
 */

import { useState, useCallback } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, Search, MapPin, Loader2 } from "lucide-react";
import { getPriorityItem } from "../../hooks/useLocalStorage";
import MarketingLayout from "../../components/marketing/MarketingLayout";

export default function HomePage() {
  // Authenticated users go straight to dashboard
  const isAuthenticated = !!getPriorityItem("auth_token") || !!getPriorityItem("token");
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <MarketingLayout
      title="Alloro - Business Clarity Platform"
      description="Business intelligence that runs while you work. Every Monday morning, in plain English."
    >
      {/* Hero */}
      <section className="px-5 py-20 sm:py-28" style={{ backgroundColor: "rgba(213, 103, 83, 0.04)" }}>
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-[32px] sm:text-[48px] font-extrabold text-[#212D40] leading-tight tracking-tight">
            Your business has been trying to tell you something.
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-[#212D40]/60 leading-relaxed max-w-lg mx-auto">
            Alloro translates it. Every Monday morning. In plain English.
          </p>
          <Link
            to="/checkup"
            className="mt-8 w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-xl bg-[#D56753] text-white text-base font-semibold px-8 py-4 shadow-[0_4px_20px_rgba(213,103,83,0.4)] hover:shadow-[0_6px_28px_rgba(213,103,83,0.5)] hover:brightness-110 active:scale-[0.98] transition-all"
          >
            See what it's saying about yours
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* The Wound */}
      <section className="px-5 py-16 sm:py-20 bg-white">
        <div className="max-w-xl mx-auto space-y-8">
          <p className="text-base text-[#212D40]/80 leading-relaxed">
            You trained for years to be excellent at what you do.
            Dentistry. Law. Medicine. Physical therapy. You got good
            at it. Then you opened a business, or inherited one,
            and discovered there's an entire second job that nobody
            trained you for.
          </p>
          <p className="text-base text-[#212D40]/80 leading-relaxed">
            The business speaks a language you were never taught.
            Referral patterns. Ranking position. Review velocity.
            Competitor moves you find out about after the fact.
            Most owners pay people to figure it out. Most of those
            people don't.
          </p>
          <p className="text-base text-[#212D40]/80 leading-relaxed">
            Alloro translates the language your business is already
            speaking, and delivers the translation to your inbox
            every Monday morning before you see your first client.
          </p>
        </div>
      </section>

      {/* What Alloro Does */}
      <section className="px-5 py-16 sm:py-20">
        <p className="text-center text-[24px] sm:text-[32px] font-extrabold text-[#212D40] tracking-tight max-w-2xl mx-auto">
          Business intelligence that runs while you work.
        </p>
      </section>

      {/* Market Teaser */}
      <MarketTeaser />

      {/* Three Proof Points */}
      <section className="px-5 py-16 sm:py-20 bg-white">
        <div className="max-w-4xl mx-auto grid sm:grid-cols-3 gap-6">
          <ProofCard
            number="55 seconds"
            text="The average person spends 55 seconds on a website deciding if you're worth calling. Alloro tells you exactly what they're seeing, and what your top competitor did last week."
          />
          <ProofCard
            number="$1,800"
            text="The average annual value of a single referring relationship. Alloro monitors every one of yours and alerts you the moment one starts to drift."
          />
          <ProofCard
            number="Monday 7am"
            text="Your Business Clarity Brief arrives every Monday morning. One score. One finding. One action. Nothing more."
          />
        </div>
      </section>

      {/* Monday Email Preview */}
      <section className="px-5 py-16 sm:py-20">
        <div className="max-w-xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold text-[#212D40] text-center mb-8">
            What it looks like
          </h2>
          <div className="rounded-2xl border border-[#212D40]/20 bg-white overflow-hidden shadow-sm">
            <div className="h-1 bg-[#D56753]" />
            <div className="p-6">
              <p className="text-xs text-gray-400 mb-1">Subject:</p>
              <p className="text-sm font-bold text-[#212D40] mb-4">
                Dr. Kargoli, Centerville gained 12 reviews this month. You gained 3.
              </p>
              <div className="space-y-3">
                <p className="text-sm text-[#212D40]/80 leading-relaxed">
                  Your closest competitor is now 89 reviews ahead of you.
                  At your current review velocity, that gap closes in 14 months.
                </p>
                <p className="text-sm text-[#212D40]/40 leading-relaxed blur-[3px] select-none">
                  One referring GP who sent you 8 cases last year has sent zero
                  in the last 90 days. The dollar figure attached to that
                  relationship is $14,400.
                </p>
                <p className="text-sm text-[#212D40]/40 leading-relaxed blur-[3px] select-none">
                  Your ranking for "endodontist Sterling" dropped from position
                  3 to position 5 this month. Here's what changed.
                </p>
              </div>
              <div className="mt-6 text-center">
                <Link
                  to="/checkup"
                  className="inline-flex items-center justify-center rounded-lg bg-[#D56753] text-white text-sm font-semibold px-6 py-3 hover:brightness-110 active:scale-[0.98] transition-all"
                >
                  See your real numbers
                </Link>
                <p className="mt-3 text-xs text-gray-400">
                  Free. 60 seconds. No account required.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Foundation Strip */}
      <section className="bg-[#212D40] px-5 py-6">
        <p className="max-w-2xl mx-auto text-center text-sm text-white/80 leading-relaxed">
          10% of every Alloro subscription funds Heroes &amp; Founders
          Foundation, supporting veterans and public servants who built
          something.{" "}
          <Link to="/foundation" className="text-white underline hover:text-[#D56753] transition-colors">
            Learn more &rarr;
          </Link>
        </p>
      </section>

      {/* Final CTA */}
      <section className="bg-[#D56753] px-5 py-16 sm:py-20">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-xl sm:text-2xl font-bold text-white leading-relaxed">
            34 million people started businesses to get their life back.
            Most are still waiting.
          </p>
          <Link
            to="/checkup"
            className="mt-8 inline-flex items-center justify-center rounded-xl bg-white text-[#212D40] text-base font-semibold px-8 py-4 hover:bg-gray-50 active:scale-[0.98] transition-all"
          >
            Run your free Business Clarity Checkup
          </Link>
        </div>
      </section>

      {/* Page schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@id": "https://getalloro.com/#organization",
                "@type": "Organization",
                "name": "Alloro",
                "url": "https://getalloro.com",
                "description": "Business Clarity platform for local service professionals",
                "logo": "https://getalloro.com/logo.png",
              },
              {
                "@type": "WebSite",
                "@id": "https://getalloro.com/#website",
                "url": "https://getalloro.com",
                "name": "Alloro - Business Clarity Platform",
                "publisher": { "@id": "https://getalloro.com/#organization" },
              },
            ],
          }),
        }}
      />
    </MarketingLayout>
  );
}

function ProofCard({ number, text }: { number: string; text: string }) {
  return (
    <div className="rounded-2xl border border-[#212D40]/15 bg-white p-6">
      <p className="text-2xl font-black text-[#212D40] mb-3">{number}</p>
      <p className="text-sm text-[#212D40]/70 leading-relaxed">{text}</p>
    </div>
  );
}

interface PlaceSuggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
}

function MarketTeaser() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ name: string; city: string; competitors: number; rank: number; avgRating: number } | null>(null);
  const [error, setError] = useState(false);

  const debounceRef = useState<ReturnType<typeof setTimeout> | null>(null);

  const searchPlaces = useCallback((input: string) => {
    if (debounceRef[0]) clearTimeout(debounceRef[0]);
    if (input.length < 3) {
      setSuggestions([]);
      return;
    }
    debounceRef[0] = setTimeout(async () => {
      try {
        const res = await fetch("/api/places/autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input }),
        });
        const data = await res.json();
        if (data.success && data.suggestions) {
          setSuggestions(data.suggestions.slice(0, 5));
        }
      } catch {
        setSuggestions([]);
      }
    }, 300);
  }, [debounceRef]);

  const selectPlace = async (place: PlaceSuggestion) => {
    setSuggestions([]);
    setQuery(place.mainText);
    setLoading(true);
    setError(false);
    try {
      // Get place details
      const detailRes = await fetch(`/api/places/${place.placeId}`);
      const detail = await detailRes.json();
      if (!detail.success) throw new Error("No details");

      const p = detail.place;
      // Run checkup analyze
      const analyzeRes = await fetch("/api/checkup/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: p.name,
          city: p.city,
          state: p.state,
          category: p.category || "",
          types: p.types || [],
          rating: p.rating || null,
          reviewCount: p.reviewCount || 0,
          placeId: place.placeId,
          location: p.location,
        }),
      });
      const analysis = await analyzeRes.json();
      if (analysis.success && analysis.market) {
        setResult({
          name: p.name,
          city: p.city,
          competitors: analysis.market.totalCompetitors,
          rank: analysis.market.rank,
          avgRating: analysis.market.avgRating,
        });
      } else {
        throw new Error("No market data");
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="px-5 py-16 sm:py-20 bg-white border-t border-gray-100">
      <div className="max-w-md mx-auto">
        <h2 className="text-xl sm:text-2xl font-bold text-[#212D40] text-center mb-2">
          See where you stand
        </h2>
        <p className="text-sm text-[#212D40]/50 text-center mb-6">
          Enter your business name. 10 seconds. No account.
        </p>

        {!result ? (
          <div className="relative">
            <div className="flex items-center gap-2 border-2 border-[#212D40]/15 rounded-xl bg-[#FAFAF8] px-4 py-3 focus-within:border-[#D56753] transition-colors">
              {loading ? (
                <Loader2 className="w-4 h-4 text-[#D56753] animate-spin shrink-0" />
              ) : (
                <Search className="w-4 h-4 text-[#212D40]/30 shrink-0" />
              )}
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  searchPlaces(e.target.value);
                  setError(false);
                }}
                placeholder="Search your practice or business..."
                className="flex-1 bg-transparent text-sm text-[#212D40] placeholder:text-[#212D40]/30 outline-none"
                disabled={loading}
              />
            </div>

            {/* Autocomplete dropdown */}
            {suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-10">
                {suggestions.map((s) => (
                  <button
                    key={s.placeId}
                    type="button"
                    onClick={() => selectPlace(s)}
                    className="w-full text-left px-4 py-3 hover:bg-[#FAFAF8] transition-colors border-b border-gray-50 last:border-0"
                  >
                    <p className="text-sm font-medium text-[#212D40]">{s.mainText}</p>
                    <p className="text-xs text-[#212D40]/50 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3" />
                      {s.secondaryText}
                    </p>
                  </button>
                ))}
              </div>
            )}

            {error && (
              <p className="mt-3 text-xs text-center text-red-500">
                Could not scan that market. Try another search.
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-[#D56753]/20 bg-[#D56753]/5 p-6 text-center">
            <p className="text-xs font-bold uppercase tracking-wider text-[#D56753] mb-3">
              Your market snapshot
            </p>
            <p className="text-sm font-medium text-[#212D40] mb-4">
              {result.name} in {result.city}
            </p>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div>
                <p className="text-2xl font-black text-[#212D40]">{result.competitors}</p>
                <p className="text-[10px] text-[#212D40]/50 uppercase tracking-wider">Competitors</p>
              </div>
              <div>
                <p className="text-2xl font-black text-[#212D40]">#{result.rank}</p>
                <p className="text-[10px] text-[#212D40]/50 uppercase tracking-wider">Your Rank</p>
              </div>
              <div>
                <p className="text-2xl font-black text-[#212D40]">{result.avgRating.toFixed(1)}</p>
                <p className="text-[10px] text-[#212D40]/50 uppercase tracking-wider">Avg Rating</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate("/checkup")}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#D56753] text-white text-sm font-semibold px-6 py-3 hover:brightness-110 active:scale-[0.98] transition-all"
            >
              See the full report
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => { setResult(null); setQuery(""); }}
              className="mt-2 text-xs text-[#212D40]/40 hover:text-[#212D40]/60 transition-colors"
            >
              Try another business
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
