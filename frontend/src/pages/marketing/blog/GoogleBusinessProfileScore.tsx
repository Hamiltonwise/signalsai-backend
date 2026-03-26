/**
 * Blog Post: What your Google Business Profile score actually means
 * Route: /blog/google-business-profile-score
 */

import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import MarketingLayout from "../../../components/marketing/MarketingLayout";

export default function GoogleBusinessProfileScore() {
  return (
    <MarketingLayout
      title="What Your Google Business Profile Score Actually Means"
      description="Your GBP score is the first thing a potential client sees. What drives it, what breaks it, and the one thing you can do this week."
      ogType="article"
    >
      <article className="mx-auto max-w-2xl px-5 py-16 sm:py-24">
        <header className="mb-12">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#D56753]">
            Local Search
          </span>
          <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold text-[#212D40] leading-tight tracking-tight">
            What your Google Business Profile score actually means
          </h1>
          <p className="mt-4 text-base text-[#212D40]/50">
            March 2026
          </p>
        </header>

        <div className="space-y-6 text-base text-[#212D40]/80 leading-relaxed">
          <p>
            When a potential client searches for your specialty in your city,
            Google decides who shows up first. That decision is not random. It
            follows a pattern, and your Google Business Profile is the single
            biggest factor in that pattern.
          </p>
          <p>
            Most business owners know they have a GBP. Very few understand what
            it's actually doing for them, or to them.
          </p>

          <h2 className="text-xl font-bold text-[#212D40] pt-4">
            What Google is actually measuring
          </h2>
          <p>
            Google's local ranking algorithm weighs three primary signals:
          </p>
          <ol className="list-decimal pl-6 space-y-3">
            <li>
              <span className="font-semibold text-[#212D40]">Relevance.</span>{" "}
              How well your profile matches what someone searched for. This
              is driven by your business category, your description, and the
              words people use in their reviews about you.
            </li>
            <li>
              <span className="font-semibold text-[#212D40]">Distance.</span>{" "}
              How close your practice is to the searcher. You can't change
              this, but you can influence how far Google is willing to stretch
              your visibility radius.
            </li>
            <li>
              <span className="font-semibold text-[#212D40]">Prominence.</span>{" "}
              How well-known your business is online. This is where reviews,
              review velocity, ratings, photos, and engagement all compound.
            </li>
          </ol>
          <p>
            Of these three, prominence is the one you control most. And the
            single highest-leverage component of prominence is review volume
            and velocity.
          </p>

          <h2 className="text-xl font-bold text-[#212D40] pt-4">
            The review velocity gap
          </h2>
          <p>
            Review velocity is the number of reviews you receive per month.
            Not your total count. Not your star rating. The pace at which new
            reviews are accumulating.
          </p>
          <p>
            Here's why it matters: if your competitor has 280 reviews and you
            have 47, the gap looks insurmountable. But if they're adding 2
            reviews per month and you start adding 8, Google notices the
            trajectory. Velocity signals momentum, and Google rewards momentum.
          </p>
          <p>
            Most practice owners don't know their velocity. They don't know
            their competitor's velocity. They don't know the gap, the timeline
            to close it, or what closing it would mean for their ranking
            position.
          </p>
          <p>
            That's not a marketing problem. That's a clarity problem.
          </p>

          <h2 className="text-xl font-bold text-[#212D40] pt-4">
            The one thing you can do this week
          </h2>
          <p>
            Send a review request to your last 10 clients. Not a mass email.
            A personal text message. "It was great seeing you last week.
            Would you mind leaving a quick review? Here's the link."
          </p>
          <p>
            That takes 8 minutes. If even half of them respond, you just
            changed your review velocity for the month. Do that every week
            for 90 days and your GBP score will reflect it.
          </p>
          <p>
            The business owners who win at local search are not the ones with
            the biggest budgets. They are the ones who understand the math and
            do the simple things consistently.
          </p>
        </div>

        {/* CTA */}
        <div className="mt-12 rounded-2xl bg-[#D56753]/5 border border-[#D56753]/20 p-8 text-center">
          <p className="text-base font-bold text-[#212D40] mb-2">
            What's your review velocity vs. your top competitor?
          </p>
          <p className="text-sm text-[#212D40]/50 mb-4">
            Run the free Checkup. See the numbers side by side.
          </p>
          <Link
            to="/checkup"
            className="inline-flex items-center gap-2 rounded-xl bg-[#D56753] text-white text-sm font-semibold px-6 py-3 hover:brightness-110 active:scale-[0.98] transition-all"
          >
            See my market
            <ArrowRight className="w-4 h-4" />
          </Link>
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
                "headline": "What Your Google Business Profile Score Actually Means",
                "description": "Your GBP score is the first thing a potential client sees. What drives it, what breaks it, and the one thing you can do this week.",
                "url": "https://getalloro.com/blog/google-business-profile-score",
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
