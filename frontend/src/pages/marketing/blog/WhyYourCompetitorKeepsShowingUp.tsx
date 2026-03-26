/**
 * Blog Post: Why your top competitor keeps showing up where you don't
 * Route: /blog/why-your-competitor-keeps-showing-up
 */

import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import MarketingLayout from "../../../components/marketing/MarketingLayout";

export default function WhyYourCompetitorKeepsShowingUp() {
  return (
    <MarketingLayout
      title="Why Your Top Competitor Keeps Showing Up Where You Don't"
      description="It's not luck. It's not budget. There's a pattern behind who shows up first in your market."
      ogType="article"
    >
      <article className="mx-auto max-w-2xl px-5 py-16 sm:py-24">
        <header className="mb-12">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#D56753]">
            Competitive Intelligence
          </span>
          <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold text-[#212D40] leading-tight tracking-tight">
            Why your top competitor keeps showing up where you don't
          </h1>
          <p className="mt-4 text-base text-[#212D40]/50">
            March 2026
          </p>
        </header>

        <div className="space-y-6 text-base text-[#212D40]/80 leading-relaxed">
          <p>
            You've noticed it. You search for your specialty in your city and
            the same competitor appears at the top. Again. You're not sure
            what they're doing differently. You assume it's money, or luck,
            or some agency trick you haven't figured out yet.
          </p>
          <p>
            It's none of those things. It's a pattern, and once you see it,
            you can't unsee it.
          </p>

          <h2 className="text-xl font-bold text-[#212D40] pt-4">
            The compounding advantage
          </h2>
          <p>
            Local search ranking is a compounding game. The business that
            shows up first gets more clicks. More clicks generate more
            website visits. More visits generate more calls. More calls
            generate more clients. More clients generate more reviews.
            More reviews push the ranking higher.
          </p>
          <p>
            This is not a linear advantage. It compounds. The gap between
            position #1 and position #5 is not 4 spots. It's a fundamentally
            different business trajectory over 12 months.
          </p>
          <p>
            Your competitor is not smarter than you. They got to the top of
            the cycle first, and the cycle is doing the rest.
          </p>

          <h2 className="text-xl font-bold text-[#212D40] pt-4">
            What they're actually doing differently
          </h2>
          <p>
            When Alloro analyzes hundreds of local markets, the same three
            patterns separate the top-ranked business from the rest:
          </p>
          <ol className="list-decimal pl-6 space-y-3">
            <li>
              <span className="font-semibold text-[#212D40]">Consistent review velocity.</span>{" "}
              Not a burst of reviews from a one-time campaign. A steady stream
              of 5 to 10 reviews per month, every month. This signals to
              Google that the business is active and trusted.
            </li>
            <li>
              <span className="font-semibold text-[#212D40]">Complete profile optimization.</span>{" "}
              Photos updated quarterly. Business description matching search
              intent. Services listed individually. Posts published regularly.
              These aren't glamorous. They're table stakes that most
              businesses skip.
            </li>
            <li>
              <span className="font-semibold text-[#212D40]">Review responses.</span>{" "}
              The top-ranked businesses respond to every review. Not with a
              template. With a sentence that acknowledges the specific client.
              Google tracks engagement, and responding to reviews is engagement.
            </li>
          </ol>

          <h2 className="text-xl font-bold text-[#212D40] pt-4">
            The intelligence gap
          </h2>
          <p>
            The real difference between you and your top competitor is not
            effort. It's visibility. They can see the scoreboard. You can't.
          </p>
          <p>
            When you don't know your competitor's review count, you can't
            calculate the gap. When you don't know their velocity, you can't
            project the timeline. When you can't see the trajectory, you
            can't make informed decisions about where to put your limited time.
          </p>
          <p>
            That's not a marketing problem. That's a Business Clarity problem.
          </p>
          <p>
            The businesses that win at local search are the ones that see the
            scoreboard clearly and do the simple things that compound. Every
            week. Without drama.
          </p>
        </div>

        {/* CTA */}
        <div className="mt-12 rounded-2xl bg-[#D56753]/5 border border-[#D56753]/20 p-8 text-center">
          <p className="text-base font-bold text-[#212D40] mb-2">
            See exactly who's ahead of you, and by how much
          </p>
          <p className="text-sm text-[#212D40]/50 mb-4">
            Run the free Checkup. Your competitors, by name, in 60 seconds.
          </p>
          <Link
            to="/checkup"
            className="inline-flex items-center gap-2 rounded-xl bg-[#D56753] text-white text-sm font-semibold px-6 py-3 hover:brightness-110 active:scale-[0.98] transition-all"
          >
            See my market
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Related reading */}
        <div className="mt-12">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Related reading</h3>
          <div className="space-y-3">
            <Link to="/blog/the-second-job-problem" className="block rounded-xl border border-gray-200 p-4 hover:border-[#D56753]/30 transition-colors">
              <p className="text-sm font-bold text-[#212D40]">The second job nobody warned you about</p>
              <p className="text-xs text-[#212D40]/50 mt-1">Why 34 million business owners are still waiting for freedom.</p>
            </Link>
            <Link to="/blog/google-business-profile-score" className="block rounded-xl border border-gray-200 p-4 hover:border-[#D56753]/30 transition-colors">
              <p className="text-sm font-bold text-[#212D40]">What your Google Business Profile score actually means</p>
              <p className="text-xs text-[#212D40]/50 mt-1">The one metric that determines who finds you first.</p>
            </Link>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link to="/blog" className="text-sm text-[#D56753] font-medium hover:underline">
            &larr; All posts
          </Link>
        </div>
      </article>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              { "@id": "https://getalloro.com/#organization", "@type": "Organization", "name": "Alloro" },
              {
                "@type": "Article",
                "headline": "Why Your Top Competitor Keeps Showing Up Where You Don't",
                "description": "It's not luck. It's not budget. There's a pattern behind who shows up first in your market.",
                "url": "https://getalloro.com/blog/why-your-competitor-keeps-showing-up",
                "publisher": { "@id": "https://getalloro.com/#organization" },
                "author": { "@type": "Person", "name": "Corey Wise" },
                "datePublished": "2026-03-26",
              },
            ],
          }),
        }}
      />
    </MarketingLayout>
  );
}
