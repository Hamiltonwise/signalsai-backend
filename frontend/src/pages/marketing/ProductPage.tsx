/**
 * ProductPage -- /product
 *
 * "What Business Clarity actually looks like."
 * Checkup, Monday Email, PatientPath, Agent System, Pricing.
 * Locked copy from Website Architecture spec.
 */

import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import MarketingLayout from "../../components/marketing/MarketingLayout";

export default function ProductPage() {
  return (
    <MarketingLayout
      title="How Alloro Works"
      description="Enter your business name. 60 seconds later, see your competitive position. Monday morning, get the one action that matters."
    >
      {/* Headline */}
      <section className="px-5 py-16 sm:py-24 bg-white">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#212D40] text-center tracking-tight max-w-lg mx-auto">
          What Business Clarity actually looks like.
        </h1>
      </section>

      {/* Section 1: The Checkup */}
      <section className="px-5 py-16 sm:py-20" style={{ backgroundColor: "rgba(213, 103, 83, 0.04)" }}>
        <div className="max-w-xl mx-auto space-y-5">
          <p className="text-xs font-bold uppercase tracking-widest text-[#D56753]">The Checkup</p>
          <p className="text-base text-[#212D40]/80 leading-relaxed">
            Enter your business name.
            60 seconds later, Alloro tells you something specific and true
            about your business that you didn't know.
          </p>
          <p className="text-base text-[#212D40]/80 leading-relaxed">
            Free. No account required. No pitch afterward.
            Just the truth.
          </p>
          <Link
            to="/checkup"
            className="inline-flex items-center gap-2 rounded-xl bg-[#D56753] text-white text-sm font-semibold px-6 py-3 hover:brightness-110 active:scale-[0.98] transition-all"
          >
            Run your free Checkup <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Section 2: The Monday Email */}
      <section className="px-5 py-16 sm:py-20 bg-white">
        <div className="max-w-xl mx-auto space-y-5">
          <p className="text-xs font-bold uppercase tracking-widest text-[#D56753]">The Monday Email</p>
          {/* Mock email */}
          <div className="rounded-2xl border border-[#212D40]/15 bg-white overflow-hidden shadow-sm">
            <div className="h-1 bg-[#D56753]" />
            <div className="p-6 space-y-3">
              <p className="text-xs text-gray-400">Subject:</p>
              <p className="text-sm font-bold text-[#212D40]">
                Your #2 referral source went quiet this week.
              </p>
              <p className="text-sm text-[#212D40]/70 leading-relaxed">
                Dr. Patel at Riverside Family sent you 6 cases in Q4.
                Zero in the last 45 days. Estimated $9,000/year at risk.
              </p>
              <p className="text-sm text-[#212D40]/40 blur-[3px] select-none leading-relaxed">
                Your ranking for the primary search query in your market
                moved from position 3 to position 5. Here is what changed.
              </p>
            </div>
          </div>
          <div className="space-y-3 text-base text-[#212D40]/80 leading-relaxed">
            <p>
              Not a dashboard you check.
              Not a report you read.
            </p>
            <p>
              An interrupt that matters, once a week,
              when you have the mental space to act on it.
            </p>
          </div>
        </div>
      </section>

      {/* Section 3: Your Website */}
      <section className="px-5 py-16 sm:py-20" style={{ backgroundColor: "rgba(213, 103, 83, 0.04)" }}>
        <div className="max-w-xl mx-auto space-y-5">
          <p className="text-xs font-bold uppercase tracking-widest text-[#D56753]">Your Website</p>
          <p className="text-base text-[#212D40]/80 leading-relaxed">
            The intelligence layer makes you findable.
            Your Alloro website makes sure the person who finds you
            knows exactly why they should choose you.
          </p>
          <p className="text-base text-[#212D40]/80 leading-relaxed">
            Built in under an hour.
            Updated automatically as your business evolves.
          </p>
        </div>
      </section>

      {/* Section 4: The Agent System */}
      <section className="px-5 py-16 sm:py-20 bg-white">
        <div className="max-w-xl mx-auto space-y-5">
          <p className="text-xs font-bold uppercase tracking-widest text-[#D56753]">The Agent System</p>
          <p className="text-base text-[#212D40]/80 leading-relaxed">
            Alloro doesn't wait for you to notice something.
            47 AI agents watch your business around the clock.
          </p>
          <p className="text-base text-[#212D40]/80 leading-relaxed">
            When something changes, the right alert fires.
            When a referral pattern shifts, the Monday email catches it.
            When a competitor moves, you know before your next customer walks in.
          </p>
          <p className="text-base font-semibold text-[#212D40]">
            The business runs. You do what you do best.
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section className="bg-[#212D40] px-5 py-16 sm:py-20">
        <div className="max-w-xl mx-auto text-center text-white space-y-6">
          <p className="text-2xl font-bold">One plan. $2,000/month.</p>
          <p className="text-base text-white/60 leading-relaxed">
            Everything included. No contracts. No setup fees.
          </p>
          <div className="space-y-2 text-sm text-white/50">
            <p>First-year businesses: $400/month. The Founders Fund.</p>
            <p>Veterans and first responders: Free. Always. Heroes Program.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <Link
              to="/checkup"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#D56753] text-white text-sm font-semibold px-6 py-3 hover:brightness-110 active:scale-[0.98] transition-all"
            >
              See Where You Rank <ArrowRight className="w-4 h-4" />
            </Link>
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
              { "@id": "https://getalloro.com/#organization", "@type": "Organization", name: "Alloro", url: "https://getalloro.com" },
              { "@type": "WebPage", "@id": "https://getalloro.com/product", url: "https://getalloro.com/product", name: "How Alloro Works", isPartOf: { "@id": "https://getalloro.com/#website" } },
            ],
          }),
        }}
      />
    </MarketingLayout>
  );
}
