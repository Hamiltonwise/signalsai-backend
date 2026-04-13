/**
 * Dynamic programmatic SEO page for /[specialty]-[city]-[state] routes.
 * Fetches page data from the API and renders with real competitor data,
 * schema markup, and Open Graph tags.
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowRight, MapPin, Star, Users, TrendingUp } from "lucide-react";
import MarketingHeader from "../components/marketing/MarketingHeader";
import MarketingFooter from "../components/marketing/MarketingFooter";

interface ContentSection {
  type: "hero" | "market_overview" | "competitors" | "faq" | "cta";
  heading: string;
  body: string;
}

interface Competitor {
  name: string;
  rating: number;
  reviewCount: number;
  address: string;
}

interface PageData {
  title: string;
  metaDescription: string;
  contentSections: ContentSection[];
  spokeLinksHtml: string;
  competitors: Competitor[];
  schemaMarkup: Record<string, unknown>;
  openGraph: {
    title: string;
    description: string;
    url: string;
    type: string;
    siteName: string;
    image: string;
  };
  specialtySlug: string;
  citySlug: string;
  cityName: string;
  stateAbbr: string;
  competitorCount: number;
  lastUpdated: string;
  canonical: string;
}

export default function ProgrammaticPage() {
  const { pageSlug } = useParams<{ pageSlug: string }>();
  const navigate = useNavigate();
  const [page, setPage] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!pageSlug) return;

    fetch(`/api/seo/pages/${pageSlug}`)
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((data) => {
        setPage(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [pageSlug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading market data...</div>
      </div>
    );
  }

  if (error || !page) {
    return null; // Let React Router's catch-all handle 404
  }

  const heroSection = page.contentSections?.find((s) => s.type === "hero");
  const marketSection = page.contentSections?.find((s) => s.type === "market_overview");
  const competitorSection = page.contentSections?.find((s) => s.type === "competitors");
  const faqSection = page.contentSections?.find((s) => s.type === "faq");
  const ctaSection = page.contentSections?.find((s) => s.type === "cta");

  let faqItems: { question: string; answer: string }[] = [];
  if (faqSection) {
    try {
      faqItems = JSON.parse(faqSection.body);
    } catch {
      faqItems = [];
    }
  }

  // Set document head for SEO
  useEffect(() => {
    if (!page) return;
    document.title = page.title;

    const setMeta = (property: string, content: string) => {
      let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("property", property);
        document.head.appendChild(el);
      }
      el.content = content;
    };

    const setNameMeta = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      el.content = content;
    };

    setNameMeta("description", page.metaDescription);
    setMeta("og:title", page.openGraph.title);
    setMeta("og:description", page.openGraph.description);
    setMeta("og:url", page.openGraph.url);
    setMeta("og:type", page.openGraph.type);
    setMeta("og:site_name", page.openGraph.siteName);
    if (page.openGraph.image) {
      setMeta("og:image", page.openGraph.image);
    }

    // Canonical link
    if (page.canonical) {
      let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement("link");
        link.rel = "canonical";
        document.head.appendChild(link);
      }
      link.href = page.canonical;
    }

    // JSON-LD schema
    if (page.schemaMarkup) {
      let script = document.querySelector("#programmatic-schema") as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement("script");
        script.id = "programmatic-schema";
        script.type = "application/ld+json";
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(page.schemaMarkup);
    }

    return () => {
      const schema = document.querySelector("#programmatic-schema");
      if (schema) schema.remove();
      const canonical = document.querySelector('link[rel="canonical"]');
      if (canonical) canonical.remove();
    };
  }, [page]);

  return (
    <>
      <div className="min-h-screen bg-white flex flex-col">
        <MarketingHeader />
        {/* Hero */}
        <section className="bg-[#212D40] text-white py-16 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-2 text-[#D56753] text-sm font-medium mb-4">
              <MapPin className="w-4 h-4" />
              <span>{page.cityName}, {page.stateAbbr}</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-semibold mb-6">
              {heroSection?.heading || page.title}
            </h1>
            <p className="text-lg text-gray-300 leading-relaxed max-w-3xl">
              {heroSection?.body}
            </p>
            <div className="flex gap-6 mt-8">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-[#D56753]" />
                <span className="text-sm">{page.competitorCount} practices tracked</span>
              </div>
              {page.lastUpdated && (
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-[#D56753]" />
                  <span className="text-sm">
                    Updated {new Date(page.lastUpdated).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Market Overview */}
        {marketSection && (
          <section className="py-12 px-4 bg-gray-50">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-semibold text-[#1A1D23] mb-4">
                {marketSection.heading}
              </h2>
              <p className="text-gray-700 leading-relaxed">
                {marketSection.body}
              </p>
            </div>
          </section>
        )}

        {/* Competitors Table */}
        {page.competitors && page.competitors.length > 0 && (
          <section className="py-12 px-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-semibold text-[#1A1D23] mb-6">
                {competitorSection?.heading || `Top Practices in ${page.cityName}`}
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Practice</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Rating</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Reviews</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 hidden md:table-cell">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.competitors.slice(0, 10).map((comp, i) => (
                      <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium text-[#1A1D23]">{comp.name}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1">
                            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                            <span>{comp.rating.toFixed(1)}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-gray-600">{comp.reviewCount}</td>
                        <td className="py-3 px-4 text-gray-500 text-sm hidden md:table-cell">{comp.address}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* FAQ */}
        {faqItems.length > 0 && (
          <section className="py-12 px-4 bg-gray-50">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-semibold text-[#1A1D23] mb-6">
                Frequently Asked Questions
              </h2>
              <div className="space-y-4">
                {faqItems.map((faq, i) => (
                  <details key={i} className="bg-white rounded-lg border border-gray-200 p-4">
                    <summary className="font-medium text-[#1A1D23] cursor-pointer">
                      {faq.question}
                    </summary>
                    <p className="mt-3 text-gray-600 leading-relaxed">
                      {faq.answer}
                    </p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="py-16 px-4 bg-[#D56753] text-white">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-semibold mb-4">
              {ctaSection?.heading || `See Where You Stand in ${page.cityName}`}
            </h2>
            <p className="text-lg opacity-90 mb-8 max-w-2xl mx-auto">
              {ctaSection?.body || `Run your free Referral Base Checkup to see how your practice compares to the ${page.competitorCount} competitors in ${page.cityName}, ${page.stateAbbr}.`}
            </p>
            <button
              onClick={() => navigate("/checkup")}
              className="inline-flex items-center gap-2 bg-white text-[#D56753] px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              Run Free Checkup <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </section>

        {/* Internal Links (Spoke) */}
        {page.spokeLinksHtml && (
          <section className="py-8 px-4 bg-gray-100">
            <div
              className="max-w-4xl mx-auto flex flex-wrap gap-4 justify-center"
              dangerouslySetInnerHTML={{ __html: page.spokeLinksHtml }}
            />
          </section>
        )}

        {/* Cross-links to marketing site */}
        <section className="py-8 px-4 border-t border-gray-100">
          <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <Link to="/how-it-works" className="text-xs text-gray-500 hover:text-[#D56753] transition-colors">How it works</Link>
            <Link to="/who-its-for" className="text-xs text-gray-500 hover:text-[#D56753] transition-colors">Who it's for</Link>
            <Link to="/pricing" className="text-xs text-gray-500 hover:text-[#D56753] transition-colors">Pricing</Link>
            <Link to="/blog" className="text-xs text-gray-500 hover:text-[#D56753] transition-colors">Blog</Link>
            <Link to="/story" className="text-xs text-gray-500 hover:text-[#D56753] transition-colors">Our story</Link>
          </div>
        </section>

        <MarketingFooter />
      </div>
    </>
  );
}
