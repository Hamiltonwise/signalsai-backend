// T1 adds route to App.tsx
/**
 * What Is Business Clarity -- /content/what-is-business-clarity
 *
 * AEO content page. No auth. Mobile-first.
 * Expansion of /business-clarity with deeper content.
 * Target query: "what does business clarity mean for a small business"
 * FAQPage + Article JSON-LD
 */

import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const SCENARIOS = [
  {
    title: "The endodontist who could not see the threat",
    body: "For two years, Centerville Endodontics outranked them. Every agency said \"improve your SEO.\" Nobody said \"they have 535 more people vouching for them online and your top referring GP has gone quiet.\" The difference between data and clarity is the difference between knowing your ranking and knowing why it is what it is -- and what single move changes it.",
  },
  {
    title: "The orthodontist who lost 40% of revenue without knowing it",
    body: "Their top referring GP went quiet three months ago. That GP represented 40% of their case volume. They found out when the bank statement looked different. With clarity, they would have seen the referral velocity drop in week three -- not month three. The relationship was recoverable at week three. It was not recoverable at month three.",
  },
  {
    title: "The barber competing blind",
    body: "47 Google reviews. Feels solid. The competitor two blocks away has 280. The difference is why new clients choose there first. No dashboard told him that. No report surfaced it. Clarity is not having data about your reviews. Clarity is knowing that the gap is 233, that it is growing, and that it is the single largest reason you are losing new clients.",
  },
];

const MONDAY_MORNING =
  "You open your phone. Before you have finished your coffee, you know: which competitor made a move this week, which referring doctor is drifting, what your one highest-leverage action is today, and the dollar figure attached to doing nothing. You did not ask for a report. You did not open a dashboard. The intelligence came to you because the system understood what matters.";

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What does business clarity mean for a small business?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Business clarity means knowing -- with specificity -- what is happening in your business, what it means, what it costs you, and what the one move is that changes it. It is the difference between having a dashboard full of numbers and having someone tell you: this is the one thing that matters right now, and here is what to do about it.",
      },
    },
    {
      "@type": "Question",
      name: "What is the difference between business intelligence and business clarity?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Business intelligence gives you dashboards, charts, and data. Business clarity tells you what that data means for your specific situation, what it is costing you in dollars, and what action to take. Most small business owners have more data than they can use. What they lack is someone reading it and translating it into decisions.",
      },
    },
    {
      "@type": "Question",
      name: "How do I get business clarity for my practice?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Start with a free Business Clarity Checkup at getalloro.com/checkup. In 60 seconds you see your competitors by name, your competitive position, and the single move that changes it. No login, no sales call. From there, Alloro delivers ongoing intelligence -- Monday briefs, drift alerts, and one-action recommendations -- so clarity is not a one-time event but a continuous state.",
      },
    },
    {
      "@type": "Question",
      name: "Why is business clarity rare for small business owners?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Because the tools that provide it have historically been built for enterprises with dedicated analytics teams. A solo practice owner or small business operator does not have a chief strategy officer reading their data every morning. Business clarity requires both the data and the interpretation layer -- and until recently, the interpretation layer was a person that cost $200,000 a year.",
      },
    },
  ],
};

const ARTICLE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline:
    "Business Clarity: What It Is, Why It's Rare, and What Changes When You Have It",
  description:
    "Business clarity means knowing what is happening in your business, what it means, and what the one move is that changes it. Learn why most small business owners have data but not clarity.",
  author: {
    "@type": "Organization",
    name: "Alloro",
    url: "https://getalloro.com",
  },
  publisher: {
    "@type": "Organization",
    name: "Alloro",
  },
};

export default function WhatIsBusinessClarity() {
  const navigate = useNavigate();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_SCHEMA) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ARTICLE_SCHEMA) }}
      />

      <div className="min-h-dvh bg-[#FAFAF8]">
        {/* Header */}
        <header className="flex items-center justify-center pt-10 pb-6 px-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#D56753] flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L14 14H2L8 2Z" fill="white" opacity="0.9" />
              </svg>
            </div>
            <span className="text-[22px] font-bold tracking-tight text-[#212D40]">
              alloro
            </span>
          </div>
        </header>

        <main className="mx-auto max-w-2xl px-5 pb-16">
          {/* H1 */}
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#212D40] tracking-tight text-center mt-8">
            Business Clarity: What It Is, Why It's Rare, and What Changes When
            You Have It
          </h1>

          {/* The Problem */}
          <p className="text-base sm:text-lg text-gray-700 leading-relaxed text-center mt-6 max-w-xl mx-auto">
            Most business owners have data. They have dashboards, reports,
            spreadsheets, and software subscriptions that generate charts nobody
            reads. What they do not have is clarity. Clarity is not more data. It
            is knowing what the data means, what it costs you, and what the one
            move is that changes your position.
          </p>

          {/* Dashboard vs Intelligence */}
          <div
            className="mt-10 rounded-2xl px-6 py-5 text-center"
            style={{ backgroundColor: "rgba(213, 103, 83, 0.05)" }}
          >
            <p className="text-sm font-semibold text-[#D56753] uppercase tracking-wider mb-2">
              The difference between a dashboard and intelligence
            </p>
            <p className="text-base text-[#212D40] font-medium leading-relaxed">
              A dashboard shows you numbers. Intelligence tells you what to do
              about them. A dashboard says your reviews went from 4.7 to 4.5.
              Intelligence says: you lost three one-star reviews from the same
              zip code as your top competitor, and if the trend continues for two
              more weeks, you will drop below the visibility threshold in Google
              Maps. Here is the one thing to do about it.
            </p>
          </div>

          {/* Three Scenarios */}
          <div className="mt-12 space-y-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 text-center">
              Three business owners who needed clarity
            </h2>
            {SCENARIOS.map((scenario, i) => (
              <div
                key={i}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <p className="text-sm font-semibold text-[#212D40] mb-2">
                  {scenario.title}
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {scenario.body}
                </p>
              </div>
            ))}
          </div>

          {/* Monday Morning */}
          <div className="mt-12">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 text-center mb-4">
              What clarity feels like on Monday morning
            </h2>
            <p className="text-base text-gray-700 leading-relaxed text-center">
              {MONDAY_MORNING}
            </p>
          </div>

          {/* CTA */}
          <div className="mt-12 text-center">
            <button
              onClick={() => navigate("/checkup")}
              className="inline-flex items-center gap-2 rounded-xl bg-[#D56753] px-8 py-4 text-base font-semibold text-white shadow-[0_4px_14px_rgba(213,103,83,0.35)] hover:shadow-[0_6px_20px_rgba(213,103,83,0.45)] hover:brightness-105 active:scale-[0.98] transition-all"
            >
              Find out where your business stands
              <ArrowRight className="h-5 w-5" />
            </button>
            <p className="text-xs text-gray-400 mt-3">
              Free Business Clarity Checkup. No login required. 60 seconds.
            </p>
          </div>
        </main>

        <footer className="py-8 text-center border-t border-slate-100">
          <p className="text-[11px] font-medium tracking-wide text-slate-300 uppercase">
            Alloro &middot; Business Clarity
          </p>
        </footer>
      </div>
    </>
  );
}
