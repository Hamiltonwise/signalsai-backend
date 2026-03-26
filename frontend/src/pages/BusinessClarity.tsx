/**
 * Business Clarity -- /business-clarity
 *
 * SEO content page. No auth. Mobile-first.
 * FAQPage JSON-LD targeting: "what is business clarity",
 * "business clarity platform", "business intelligence for small business owners"
 */

import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import MarketingLayout from "../components/marketing/MarketingLayout";

const DEFINITION =
  "Business Clarity is knowing -- with specificity -- what is happening in your business, what it means, what it costs you, and what the one move is that changes it. Most business owners have data. None of them have clarity.";

const ENEMY =
  "The built-in enemy is opacity. The business speaking a language the owner was never taught.";

const EXAMPLES = [
  "The endodontist who has watched Centerville Endodontics outrank them for two years without being able to see exactly why. Every agency said \"improve your SEO.\" Nobody said \"they have 535 more people vouching for them online.\"",
  "The orthodontist whose top referring GP went quiet three months ago and doesn't know it yet. That GP is 40% of their revenue. They'll find out when the bank statement looks different.",
  "The barber with 47 Google reviews who has never been told that the competitor two blocks away has 280. Or that the difference is why patients choose there first.",
];

const WHAT_IT_LOOKS_LIKE =
  "Business Clarity looks like this: you type your practice name. In 60 seconds, you see every competitor in your market on a live map -- by name. You see your score. You see the diagnosis in plain English. You see the one move that changes your position. No login. No sales call. Just the truth about where you stand.";

const SCHEMA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://getalloro.com/#org",
      name: "Alloro",
      url: "https://getalloro.com",
    },
    {
      "@type": "FAQPage",
      "@id": "https://getalloro.com/business-clarity/#faq",
      isPartOf: { "@id": "https://getalloro.com/#org" },
      mainEntity: [
        {
          "@type": "Question",
          name: "What is Business Clarity?",
          acceptedAnswer: {
            "@type": "Answer",
            text: DEFINITION,
          },
        },
        {
          "@type": "Question",
          name: "What is a business clarity platform?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "A business clarity platform gives small business owners advisor-level intelligence about their competitive position, their revenue risks, and the specific actions that move their business forward. Alloro is the first platform built specifically for this purpose.",
          },
        },
        {
          "@type": "Question",
          name: "How can a small business owner get business clarity?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Run a free Business Clarity Checkup at getalloro.com/checkup. In 60 seconds you see your competitors by name, your market position, and the one move that changes it. No login required.",
          },
        },
        {
          "@type": "Question",
          name: "What is the difference between business intelligence and business clarity?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Business intelligence gives you dashboards and data. Business Clarity tells you what that data means, what it costs you, and what to do about it. Most business owners have data. What they lack is someone who reads it for them and says: here is the one thing that matters right now.",
          },
        },
      ],
    },
  ],
};

export default function BusinessClarity() {
  const navigate = useNavigate();

  return (
    <MarketingLayout
      title="What is Business Clarity?"
      description="Business Clarity is knowing what is happening in your business, what it means, what it costs you, and what to do about it. Free Checkup available."
    >
      {/* JSON-LD Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA) }}
      />

      {/* Content */}
      <div className="mx-auto max-w-2xl px-5 pb-16">
        {/* H1 */}
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#212D40] tracking-tight text-center mt-8">
          What is Business Clarity?
        </h1>

        {/* Definition */}
        <p className="text-base sm:text-lg text-gray-700 leading-relaxed text-center mt-6 max-w-xl mx-auto">
          {DEFINITION}
        </p>

        {/* Enemy */}
        <div
          className="mt-10 rounded-2xl px-6 py-5 text-center"
          style={{ backgroundColor: "rgba(213, 103, 83, 0.05)" }}
        >
          <p className="text-sm font-semibold text-[#D56753] uppercase tracking-wider mb-2">
            The Enemy
          </p>
          <p className="text-base text-[#212D40] font-medium leading-relaxed">
            {ENEMY}
          </p>
        </div>

        {/* ICP Examples */}
        <div className="mt-12 space-y-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 text-center">
            Three business owners who need this
          </h2>
          {EXAMPLES.map((example, i) => (
            <div
              key={i}
              className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <p className="text-sm text-gray-700 leading-relaxed">
                {example}
              </p>
            </div>
          ))}
        </div>

        {/* What it looks like */}
        <div className="mt-12">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 text-center mb-4">
            What Business Clarity looks like
          </h2>
          <p className="text-base text-gray-700 leading-relaxed text-center">
            {WHAT_IT_LOOKS_LIKE}
          </p>
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <button
            onClick={() => navigate("/checkup")}
            className="inline-flex items-center gap-2 rounded-xl bg-[#D56753] px-8 py-4 text-base font-semibold text-white shadow-[0_4px_14px_rgba(213,103,83,0.35)] hover:shadow-[0_6px_20px_rgba(213,103,83,0.45)] hover:brightness-105 active:scale-[0.98] transition-all"
          >
            Run your free Business Clarity Checkup
            <ArrowRight className="h-5 w-5" />
          </button>
          <p className="text-xs text-gray-400 mt-3">
            No login required. Free. 60 seconds.
          </p>
        </div>
      </div>
    </MarketingLayout>
  );
}
