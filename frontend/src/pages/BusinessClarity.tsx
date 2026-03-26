/**
 * Business Clarity -- /business-clarity
 *
 * SEO content page. No auth. Mobile-first.
 * FAQPage JSON-LD targeting: "what is business clarity",
 * "business clarity platform", "business intelligence for small business owners"
 */

import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import MarketingLayout from "../components/marketing/MarketingLayout";
import BlogEmailCapture from "../components/marketing/BlogEmailCapture";

const DEFINITION =
  "Business Clarity is knowing, with specificity, what is happening in your business, what it means, what it costs you, and what the one move is that changes it. Most business owners have data. None of them have clarity.";

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

      {/* Hero */}
      <section className="px-5 py-16 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#212D40] tracking-tight">
            What is Business Clarity?
          </h1>
          <p className="text-base sm:text-lg text-[#212D40]/70 leading-relaxed mt-6 max-w-xl mx-auto">
            {DEFINITION}
          </p>
        </div>
      </section>

      {/* The Enemy */}
      <section className="px-5 py-12 sm:py-16 bg-white">
        <div className="max-w-xl mx-auto">
          <div
            className="rounded-2xl px-6 py-5 text-center"
            style={{ backgroundColor: "rgba(213, 103, 83, 0.05)" }}
          >
            <p className="text-sm font-semibold text-[#D56753] uppercase tracking-wider mb-2">
              The Enemy
            </p>
            <p className="text-base text-[#212D40] font-medium leading-relaxed">
              The built-in enemy is opacity. The business speaking a language the owner was never taught.
            </p>
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="px-5 py-10" style={{ backgroundColor: "rgba(213, 103, 83, 0.04)" }}>
        <div className="max-w-xl mx-auto text-center">
          <blockquote className="text-lg font-medium text-[#212D40] leading-relaxed italic">
            "Can I trust this person? That's the only question on the site in 55 seconds."
          </blockquote>
          <p className="mt-3 text-sm text-[#212D40]/50">
            Dr. Kargoli, 1 Endodontics
          </p>
        </div>
      </section>

      {/* Three business owners */}
      <section className="px-5 py-16 sm:py-20 bg-white">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 text-center mb-8">
            Three business owners who need this
          </h2>
          <div className="space-y-6">
            <ExampleCard>
              The specialist who watched a competitor outrank them for two years
              without being able to see exactly why. Every agency said "improve your SEO."
              Nobody said "they have 535 more people vouching for them online."
            </ExampleCard>
            <ExampleCard>
              The practice owner whose top referring source went quiet three months
              ago and doesn't know it yet. That source is 40% of their revenue.
              They'll find out when the bank statement looks different.
            </ExampleCard>
            <ExampleCard>
              The business with 47 Google reviews who has never been told that
              the competitor two blocks away has 280. Or that the difference is
              why clients choose there first.
            </ExampleCard>
          </div>
        </div>
      </section>

      {/* What it looks like */}
      <section className="px-5 py-16 sm:py-20">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-xl sm:text-2xl font-bold text-[#212D40] mb-6">
            What Business Clarity looks like
          </h2>
          <p className="text-base text-[#212D40]/70 leading-relaxed">
            You type your business name. In 60 seconds, you see every
            competitor in your market by name. You see your score. You see
            the diagnosis in plain English. You see the one move that changes
            your position. No login. No sales call. Just the truth about
            where you stand.
          </p>
        </div>
      </section>

      {/* Monday Brief preview */}
      <section className="px-5 py-12 sm:py-16 bg-white">
        <div className="max-w-xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold text-[#212D40] text-center mb-8">
            What arrives Monday morning
          </h2>
          <div className="rounded-2xl border border-[#212D40]/20 bg-[#FAFAF8] overflow-hidden shadow-sm">
            <div className="h-1 bg-[#D56753]" />
            <div className="p-6 space-y-4">
              <div className="border-l-2 border-[#D56753] pl-4">
                <p className="text-sm text-[#212D40]/80 leading-relaxed">
                  Your closest competitor gained 11 reviews last week. You gained 0.
                  At this pace, they close the gap to rank #1 in your market within 8 weeks.
                </p>
              </div>
              <div className="border-l-2 border-[#212D40]/20 pl-4">
                <p className="text-sm text-[#212D40]/60 leading-relaxed">
                  Your top referring source hasn't sent a case in 34 days.
                  This is the longest gap in 14 months. Worth a call this week.
                </p>
              </div>
              <div className="rounded-xl bg-[#D56753]/5 border border-[#D56753]/20 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-[#D56753] mb-1">
                  This week
                </p>
                <p className="text-sm text-[#212D40]/80">
                  Request reviews from 10 recent clients. Takes 8 minutes.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Email capture */}
      <section className="px-5 py-12 sm:py-16">
        <div className="max-w-md mx-auto">
          <BlogEmailCapture />
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#D56753] px-5 py-12 sm:py-16">
        <div className="max-w-md mx-auto text-center">
          <p className="text-lg font-bold text-white mb-4">
            See what your business is saying right now.
          </p>
          <Link
            to="/checkup"
            className="inline-flex items-center gap-2 rounded-xl bg-white text-[#212D40] text-base font-semibold px-8 py-4 hover:bg-gray-50 active:scale-[0.98] transition-all"
          >
            Run your free Business Clarity Checkup
            <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="text-xs text-white/50 mt-3">
            No login required. Free. 60 seconds.
          </p>
        </div>
      </section>
    </MarketingLayout>
  );
}

function ExampleCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-[#FAFAF8] p-6">
      <p className="text-sm text-[#212D40]/70 leading-relaxed">{children}</p>
    </div>
  );
}
