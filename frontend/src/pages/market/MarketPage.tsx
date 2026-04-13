/**
 * MarketPage -- Programmatic City Pages
 *
 * Route: /market/:specialty/:city
 * Example: /market/endodontist/bend-or
 *
 * SEO-optimized page showing market data for a specialty in a city.
 * Each page is a conversion funnel entry point.
 */

import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Loader2, Star, Users, TrendingUp, MapPin, ArrowRight } from "lucide-react";
import { Helmet } from "react-helmet-async";

interface MarketData {
  specialtyName: string;
  cityName: string;
  state: string;
  stateAbbr: string;
  marketScore: number | null;
  competitorCount: number;
  averageRating: number;
  averageReviews: number;
  lat: number | null;
  lng: number | null;
  competitors: Array<{
    name: string;
    rating: number;
    reviewCount: number;
    address: string;
  }>;
}

export default function MarketPage() {
  const { specialty, city } = useParams<{ specialty: string; city: string }>();
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!specialty || !city) return;

    async function fetchMarket() {
      try {
        const res = await fetch(`/api/market/${specialty}/${city}`);
        if (!res.ok) {
          setError(true);
          return;
        }
        const json = await res.json();
        if (json.success && json.data) {
          setData(json.data);
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    fetchMarket();
  }, [specialty, city]);

  // Format slug for display: "bend-or" -> "Bend, OR"
  const formatCity = (slug: string) => {
    const parts = slug.split("-");
    const stateCode = parts.pop()?.toUpperCase() || "";
    const cityName = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
    return `${cityName}, ${stateCode}`;
  };

  const formatSpecialty = (slug: string) => {
    return slug
      .split("-")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ");
  };

  const displayCity = data?.cityName
    ? `${data.cityName}, ${data.stateAbbr}`
    : city
      ? formatCity(city)
      : "";
  const displaySpecialty = data?.specialtyName || (specialty ? formatSpecialty(specialty) : "");

  const pageTitle = `${displaySpecialty} in ${displayCity} | Market Intelligence | Alloro`;
  const metaDescription = `See how ${displaySpecialty.toLowerCase()} practices in ${displayCity} compare. Average rating, review counts, and competitive landscape. Run your free Business Health Checkup.`;

  // JSON-LD Schema
  const schemaMarkup = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: `${displaySpecialty} practices in ${displayCity}`,
    description: metaDescription,
    areaServed: {
      "@type": "City",
      name: data?.cityName || (city ? formatCity(city).split(",")[0] : ""),
      ...(data?.lat && data?.lng
        ? {
            geo: {
              "@type": "GeoCoordinates",
              latitude: data.lat,
              longitude: data.lng,
            },
          }
        : {}),
    },
    aggregateRating: data?.averageRating
      ? {
          "@type": "AggregateRating",
          ratingValue: data.averageRating,
          reviewCount: data.averageReviews * (data.competitorCount || 1),
        }
      : undefined,
  };

  if (loading) {
    return (
      <>
        <Helmet>
          <title>{pageTitle}</title>
          <meta name="description" content={metaDescription} />
        </Helmet>
        <div className="flex min-h-screen items-center justify-center bg-white">
          <Loader2 className="h-8 w-8 animate-spin text-[#D56753]" />
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <Helmet>
          <title>{pageTitle}</title>
          <meta name="description" content={metaDescription} />
        </Helmet>
        <div className="min-h-screen bg-white">
          <div className="mx-auto max-w-3xl px-4 py-24 text-center">
            <h1 className="mb-4 text-3xl font-semibold text-[#1A1D23]">
              {displaySpecialty} in {displayCity}
            </h1>
            <p className="mb-8 text-lg text-gray-500">
              We are gathering market data for this location.
              Run your free Business Health Checkup to see how you compare.
            </p>
            <Link
              to="/checkup"
              className="inline-flex items-center gap-2 rounded-xl bg-[#D56753] px-8 py-4 text-base font-semibold text-white hover:brightness-105 transition-all"
            >
              Run your free Checkup
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={metaDescription} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`https://getalloro.com/market/${specialty}/${city}`} />
        <script type="application/ld+json">
          {JSON.stringify(schemaMarkup)}
        </script>
      </Helmet>

      <div className="min-h-screen bg-white">
        {/* Hero */}
        <section className="border-b border-gray-100 bg-gradient-to-b from-[#212D40] to-[#1a2433] py-20">
          <div className="mx-auto max-w-4xl px-4 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5">
              <MapPin className="h-4 w-4 text-[#D56753]" />
              <span className="text-sm font-medium text-white/80">
                Market Intelligence
              </span>
            </div>
            <h1 className="mb-4 text-4xl font-semibold text-white md:text-5xl">
              {displaySpecialty} in {displayCity}
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-white/60">
              Live competitive landscape data for {displaySpecialty.toLowerCase()} practices
              in {data.cityName || displayCity}.
            </p>
          </div>
        </section>

        {/* Stats Grid */}
        <section className="border-b border-gray-100 py-12">
          <div className="mx-auto grid max-w-4xl grid-cols-2 gap-6 px-4 md:grid-cols-4">
            <StatCard
              icon={<Users className="h-5 w-5 text-[#D56753]" />}
              label="Competitors"
              value={String(data.competitorCount)}
            />
            <StatCard
              icon={<Star className="h-5 w-5 text-[#D56753]" />}
              label="Avg Rating"
              value={data.averageRating > 0 ? `${data.averageRating}/5` : "N/A"}
            />
            <StatCard
              icon={<TrendingUp className="h-5 w-5 text-[#D56753]" />}
              label="Avg Reviews"
              value={data.averageReviews > 0 ? String(data.averageReviews) : "N/A"}
            />
            {data.marketScore != null && (
              <StatCard
                icon={<MapPin className="h-5 w-5 text-[#D56753]" />}
                label="Market Score"
                value={`${data.marketScore}/100`}
              />
            )}
          </div>
        </section>

        {/* Competitors Table */}
        {data.competitors.length > 0 && (
          <section className="py-12">
            <div className="mx-auto max-w-4xl px-4">
              <h2 className="mb-6 text-xl font-semibold text-[#1A1D23]">
                Top {displaySpecialty} Practices in {displayCity}
              </h2>
              <div className="overflow-hidden rounded-xl border border-gray-200">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Practice
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Rating
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Reviews
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.competitors.map((comp, i) => (
                      <tr
                        key={i}
                        className="border-b border-gray-50 last:border-0"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-[#1A1D23]">
                            {comp.name}
                          </p>
                          {comp.address && (
                            <p className="text-xs text-gray-400">
                              {comp.address}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold text-[#1A1D23]">
                            {comp.rating > 0 ? comp.rating.toFixed(1) : "N/A"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {comp.reviewCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="border-t border-gray-100 bg-[#212D40] py-20">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <h2 className="mb-4 text-3xl font-semibold text-white">
              See where you stand
            </h2>
            <p className="mb-8 text-lg text-white/60">
              Run your free Business Health Checkup and get a personalized
              competitive analysis for your practice in {displayCity}.
            </p>
            <Link
              to="/checkup"
              className="inline-flex items-center gap-2 rounded-xl bg-[#D56753] px-8 py-4 text-base font-semibold text-white hover:brightness-105 transition-all"
            >
              Run your free Business Clarity Checkup
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </section>
      </div>
    </>
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
    <div className="rounded-xl border border-gray-200 p-5 text-center">
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50">
        {icon}
      </div>
      <p className="text-2xl font-semibold text-[#1A1D23]">{value}</p>
      <p className="text-xs font-medium text-gray-500">{label}</p>
    </div>
  );
}
