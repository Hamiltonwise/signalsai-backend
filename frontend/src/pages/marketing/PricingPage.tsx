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
      description="$2,000/month per location. Your Monday Brief, professional website, revenue intelligence, and competitive tracking. No contracts."
    >
      {/* Hero */}
      <section className="px-5 py-16 sm:py-24">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#212D40] tracking-tight">
            Everything Alloro does. One price.
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
                  title="Your Alloro website, built in one hour."
                  desc="A professional, conversion-optimized web presence built from your real market data and Google reviews. Live within one hour of signup."
                />
                <IncludeItem
                  title="Revenue source intelligence."
                  desc="Connect your business data and Alloro monitors every relationship that drives revenue. When one starts to drift, you know first, with the dollar figure attached."
                />
                <IncludeItem
                  title="Competitive intelligence."
                  desc="Weekly competitive position tracking across local search, reviews, and online visibility. Your score. Their score. What changed."
                />
                <IncludeItem
                  title="The full Business Clarity layer."
                  desc="Connect your data and Alloro puts a dollar figure on every finding. What's working, what's slipping, and what to do about it this week."
                />
              </div>
            </div>
          </div>

          {/* Split the check */}
          <div className="mt-8 rounded-xl border-2 border-[#212D40]/10 bg-[#212D40]/[0.02] p-6 text-center">
            <p className="text-sm font-bold text-[#212D40] mb-1">
              Rise Together. Split month one.
            </p>
            <p className="text-xs text-[#212D40]/50 leading-relaxed">
              Know a colleague who should see their market? When they join,
              you both pay $1,000 for month one instead of $2,000.
              Not a discount. A shared investment. We all rise together.
            </p>
          </div>

          {/* Foundation line */}
          <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 text-center">
            <p className="text-sm text-[#212D40]/70 leading-relaxed">
              10% of every subscription funds{" "}
              <Link to="/foundation" className="text-[#D56753] font-semibold hover:underline">
                Heroes & Founders Foundation
              </Link>
              . Veterans and first-year business owners get access
              at no cost or reduced cost. The people who served first
              deserve the intelligence everyone else pays for.
            </p>
          </div>

          {/* CTA */}
          <div className="mt-10 text-center">
            <Link
              to="/checkup"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-xl bg-[#D56753] text-white text-base font-semibold px-8 py-4 shadow-[0_4px_20px_rgba(213,103,83,0.4)] hover:brightness-110 active:scale-[0.98] transition-all"
            >
              See my numbers first
              <ArrowRight className="w-4 h-4" />
            </Link>
            <p className="mt-3 text-xs text-gray-400">
              See where you rank. Free. 60 seconds. Then decide.
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
                "description": "Business Clarity platform for local service professionals.",
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
              {
                "@type": "FAQPage",
                "mainEntity": [
                  { "@type": "Question", "name": "How much does Alloro cost?", "acceptedAnswer": { "@type": "Answer", "text": "Alloro costs $2,000 per location per month. No contracts, cancel anytime." } },
                  { "@type": "Question", "name": "Is there a free trial?", "acceptedAnswer": { "@type": "Answer", "text": "The free market scan takes in 60 seconds with no credit card. Subscription starts when you want weekly Monday briefings." } },
                  { "@type": "Question", "name": "What is included in the subscription?", "acceptedAnswer": { "@type": "Answer", "text": "Your weekly Monday Brief with one finding and one action, a professional website built by AI, revenue source intelligence with drift alerts, competitive position tracking, and the Business Clarity layer that gets more specific as you connect more data." } },
                  { "@type": "Question", "name": "Can I cancel anytime?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. No contracts, no cancellation fees. Your data stays yours." } },
                ],
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
