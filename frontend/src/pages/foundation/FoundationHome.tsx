/**
 * Heroes & Founders Foundation -- Homepage (WO-11)
 * Route: /foundation
 * "Built for people who chose service first."
 */

import { Link } from "react-router-dom";
import { Heart, Shield, Rocket } from "lucide-react";
import MarketingLayout from "../../components/marketing/MarketingLayout";

export default function FoundationHome() {
  return (
    <MarketingLayout
      title="Heroes & Founders Foundation"
      description="Built for people who chose service first. RISE Scholars program for veteran business owners."
    >
      {/* Hero */}
      <section className="px-6 py-20 text-center max-w-3xl mx-auto">
        <p className="text-xs font-bold uppercase tracking-widest text-[#D56753] mb-4">
          Heroes & Founders Foundation
        </p>
        <h1 className="text-4xl sm:text-5xl font-semibold text-[#212D40] leading-tight">
          Built for people who chose service first.
        </h1>
        <p className="mt-6 text-lg text-gray-600 leading-relaxed max-w-xl mx-auto">
          You served your country. You built something from nothing. The Heroes & Founders
          Foundation exists because people like you deserve more than a thank you.
          You deserve tools that match your ambition.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
          <Link
            to="/foundation/heroes"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#212D40] px-8 py-3.5 text-sm font-semibold text-white transition-all hover:brightness-110"
          >
            <Shield className="h-4 w-4" />
            Heroes Initiative
          </Link>
          <Link
            to="/foundation/founders"
            className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[#212D40] px-8 py-3.5 text-sm font-semibold text-[#212D40] transition-all hover:bg-gray-50"
          >
            <Rocket className="h-4 w-4" />
            Founders Initiative
          </Link>
        </div>
      </section>

      {/* Three pillars */}
      <section className="bg-gray-50 px-6 py-16">
        <div className="max-w-4xl mx-auto grid sm:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-[#D56753]/10 flex items-center justify-center mx-auto mb-4">
              <Shield className="h-6 w-6 text-[#D56753]" />
            </div>
            <h3 className="text-base font-bold text-[#212D40]">RISE Scholars</h3>
            <p className="text-sm text-gray-500 mt-2">
              Full access to Alloro's business clarity platform for veterans
              building businesses. No cost. No catch. No expiration.
            </p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-[#D56753]/10 flex items-center justify-center mx-auto mb-4">
              <Heart className="h-6 w-6 text-[#D56753]" />
            </div>
            <h3 className="text-base font-bold text-[#212D40]">Recognition</h3>
            <p className="text-sm text-gray-500 mt-2">
              Every scholar's story is told. Not as charity. As recognition of what it
              means to choose service first and build something second.
            </p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-[#D56753]/10 flex items-center justify-center mx-auto mb-4">
              <Rocket className="h-6 w-6 text-[#D56753]" />
            </div>
            <h3 className="text-base font-bold text-[#212D40]">Community</h3>
            <p className="text-sm text-gray-500 mt-2">
              A network of veteran business owners who understand what it means to
              transition from service to business. Nobody does this alone.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-16 text-center">
        <h2 className="text-2xl font-bold text-[#212D40]">Ready to apply?</h2>
        <p className="mt-3 text-gray-500">
          If you served in the United States Armed Forces and own a business,
          you may qualify for the RISE Scholars program.
        </p>
        <Link
          to="/foundation/apply"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#D56753] px-8 py-3.5 text-sm font-semibold text-white mt-6 transition-all hover:brightness-110"
        >
          Apply Now
        </Link>
      </section>

      {/* JSON-LD Entity Graph */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Organization",
                "@id": "https://heroesandfounders.org/#org",
                "name": "Heroes & Founders Foundation",
                "url": "https://heroesandfounders.org",
                "parentOrganization": {
                  "@type": "Organization",
                  "@id": "https://getalloro.com/#org",
                  "name": "Alloro",
                },
                "description": "Built for people who chose service first. RISE Scholars program for veteran business owners.",
              },
              {
                "@type": "WebPage",
                "@id": "https://heroesandfounders.org/#homepage",
                "name": "Heroes & Founders Foundation",
                "isPartOf": { "@id": "https://heroesandfounders.org/#org" },
              },
            ],
          }),
        }}
      />
    </MarketingLayout>
  );
}
