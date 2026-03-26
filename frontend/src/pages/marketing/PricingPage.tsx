/**
 * PricingPage -- /pricing
 *
 * One product. One price. No contracts.
 * Blast radius: Red (pricing). Content matches approved spec only.
 */

import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import MarketingLayout from "../../components/marketing/MarketingLayout";

export default function PricingPage() {
  return (
    <MarketingLayout
      title="Pricing"
      description="Simple pricing. Real value. One product. One price. No contracts."
    >
      {/* Hero */}
      <section className="px-5 py-16 sm:py-24">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#212D40] tracking-tight">
            Simple pricing. Real value.
          </h1>
          <p className="mt-4 text-base sm:text-lg text-[#212D40]/60">
            One product. One price. No contracts.
          </p>
        </div>
      </section>

      {/* Pricing Card */}
      <section className="px-5 pb-16 sm:pb-20">
        <div className="max-w-lg mx-auto">
          <div className="rounded-2xl border-2 border-[#212D40]/15 bg-white overflow-hidden shadow-sm">
            <div className="h-1.5 bg-[#D56753]" />
            <div className="p-8">
              {/* Price */}
              <div className="text-center mb-8">
                <span className="text-5xl sm:text-6xl font-black text-[#212D40]">
                  $2,000
                </span>
                <span className="text-lg text-slate-400 ml-2">/ month</span>
                <p className="mt-2 text-sm text-slate-500">
                  Per location. Cancel anytime.
                </p>
              </div>

              {/* What's included */}
              <div className="space-y-6">
                <IncludeItem
                  title="Your Business Clarity Brief every Monday morning."
                  desc="Alloro scans your market every week and delivers one finding, one action, and one score. In plain English. Before you see your first client."
                />
                <IncludeItem
                  title="Your PatientPath presence layer."
                  desc="A professional, conversion-optimized web presence built from your real market data. Live within one hour of signup."
                />
                <IncludeItem
                  title="GP referral intelligence."
                  desc="When you connect your practice data, Alloro monitors every referring relationship and alerts you when one starts to drift, with the dollar figure attached."
                />
                <IncludeItem
                  title="Competitive intelligence."
                  desc="Weekly competitive position tracking across local search, reviews, and online visibility. Your score. Their score. What changed."
                />
                <IncludeItem
                  title="The Business Clarity Layer."
                  desc="The more data Alloro has, the more specific the intelligence gets. Every stage of connection makes Monday morning more valuable."
                />
              </div>
            </div>
          </div>

          {/* Foundation line */}
          <p className="mt-6 text-center text-sm text-[#212D40]/50 leading-relaxed max-w-md mx-auto">
            10% of every Alloro subscription goes directly to
            Heroes &amp; Founders Foundation. When you subscribe,
            you support a veteran or public servant who built
            something too.
          </p>

          {/* Founding partners */}
          <div className="mt-8 rounded-xl border border-gray-200 bg-white p-5 text-center">
            <p className="text-sm text-[#212D40]/70 leading-relaxed">
              First-year practitioners and veteran-owned businesses
              may qualify for subsidized access through Heroes &amp;
              Founders Foundation.{" "}
              <Link to="/foundation" className="text-[#D56753] font-semibold hover:underline">
                Learn more &rarr;
              </Link>
            </p>
          </div>

          {/* CTA */}
          <div className="mt-10 text-center">
            <Link
              to="/checkup"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-xl bg-[#D56753] text-white text-base font-semibold px-8 py-4 shadow-[0_4px_20px_rgba(213,103,83,0.4)] hover:brightness-110 active:scale-[0.98] transition-all"
            >
              Start with the free Checkup
              <ArrowRight className="w-4 h-4" />
            </Link>
            <p className="mt-3 text-xs text-gray-400">
              No credit card. No commitment. 60 seconds.
            </p>
          </div>
        </div>
      </section>

      {/* Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              { "@id": "https://getalloro.com/#organization", "@type": "Organization", "name": "Alloro", "url": "https://getalloro.com" },
              {
                "@type": "Product",
                "name": "Alloro Business Clarity",
                "description": "Business intelligence platform for local service professionals.",
                "url": "https://getalloro.com/pricing",
                "brand": { "@id": "https://getalloro.com/#organization" },
                "offers": {
                  "@type": "Offer",
                  "price": "2000",
                  "priceCurrency": "USD",
                  "priceSpecification": {
                    "@type": "UnitPriceSpecification",
                    "price": "2000",
                    "priceCurrency": "USD",
                    "billingDuration": "P1M",
                    "unitText": "per location per month",
                  },
                },
              },
            ],
          }),
        }}
      />
    </MarketingLayout>
  );
}

function IncludeItem({ title, desc }: { title: string; desc: string }) {
  return (
    <div>
      <p className="text-sm font-bold text-[#212D40] mb-1">{title}</p>
      <p className="text-sm text-[#212D40]/60 leading-relaxed">{desc}</p>
    </div>
  );
}
