/**
 * AboutPage -- /about
 *
 * Corey's story. Not a bio page. The story.
 * Locked copy from Website Architecture spec.
 */

import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import MarketingLayout from "../../components/marketing/MarketingLayout";

export default function AboutPage() {
  return (
    <MarketingLayout
      title="About Corey Wise"
      description="USAF veteran. 100% service-connected disability. A decade inside specialty service businesses. Alloro is the tool he wished existed."
    >
      <section className="px-5 py-16 sm:py-24 bg-white">
        <div className="max-w-xl mx-auto space-y-6 text-base text-[#212D40]/80 leading-relaxed">
          <p>
            Corey Wise served in the United States Air Force.
            He carries a 100% service-connected disability rating.
          </p>
          <p>
            For a decade, he worked inside specialty service businesses,
            watching brilliant people lose businesses they'd spent their careers building.
            Not because they weren't talented.
            Because they couldn't see what was happening until it was too late.
          </p>
          <p>
            For years before Alloro existed, he taught webinars for veteran entrepreneurs.
            For free. Before there was anything to sell.
          </p>
          <p className="font-semibold text-[#212D40] text-lg">
            Alloro is not an idea he had.
            It is the tool he spent a decade wishing someone would build.
          </p>
          <p>He built it.</p>
          <p>
            The Heroes & Founders Foundation is not a marketing program.
            It is the formalization of work that was already being done.
          </p>
          <p>
            Alloro is built on Claude, Anthropic's AI model,
            because Anthropic refused a Department of Defense surveillance contract
            to protect user data. Alloro made the same choice.
            You build with the companies whose values match yours.
          </p>

          <div className="border-t border-gray-200 pt-6 space-y-2">
            <p className="text-[#212D40]/60">He lives in Bend, Oregon.</p>
            <p className="text-[#212D40]/60">He competes in USPSA.</p>
            <p className="text-[#212D40]/60">He bakes sourdough for his daughter Sophie.</p>
            <p className="text-[#212D40]/60">He drives air-cooled Porsches.</p>
            <p className="text-[#212D40]/60">He fly fishes.</p>
          </div>

          <p>
            He is building Alloro because the butterfly effect is real.
          </p>
          <p className="text-[#212D40]/60">
            The business owner who opens Monday morning with clarity
            pays for the coffee of the person behind them in the drive-thru.
            That person smiles at the checkout teller.
            The teller takes that home.
          </p>
          <p className="text-[#212D40]/60">Six degrees.</p>
          <p className="font-semibold text-[#212D40]">
            The freedom Alloro gives back doesn't stop with the owner.
            It never did.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 pt-6">
            <Link
              to="/checkup"
              className="inline-flex items-center gap-2 rounded-xl bg-[#D56753] text-white text-sm font-semibold px-6 py-3 hover:brightness-110 active:scale-[0.98] transition-all"
            >
              Run Your Free Checkup <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/foundation"
              className="inline-flex items-center gap-2 rounded-xl border-2 border-[#212D40]/15 text-[#212D40] text-sm font-semibold px-6 py-3 hover:border-[#212D40]/30 transition-colors"
            >
              Learn about Heroes & Founders <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              { "@id": "https://getalloro.com/#organization", "@type": "Organization", name: "Alloro", url: "https://getalloro.com" },
              {
                "@type": "Person",
                "@id": "https://getalloro.com/about#corey",
                name: "Corey Wise",
                jobTitle: "Founder & CEO",
                worksFor: { "@id": "https://getalloro.com/#organization" },
                description: "USAF veteran. A decade inside specialty service businesses. Built Alloro because the butterfly effect is real.",
                url: "https://getalloro.com/about",
              },
              { "@type": "WebPage", "@id": "https://getalloro.com/about", url: "https://getalloro.com/about", name: "About Corey Wise", isPartOf: { "@id": "https://getalloro.com/#website" } },
            ],
          }),
        }}
      />
    </MarketingLayout>
  );
}
