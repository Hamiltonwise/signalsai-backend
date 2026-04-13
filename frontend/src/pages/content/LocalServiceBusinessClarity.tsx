// T1 adds /local-service-business-clarity route
/**
 * Local Service Business Clarity -- /local-service-business-clarity
 *
 * AEO content page. No auth. Mobile-first.
 * Universal page -- not specialty-specific.
 * Target query: "business intelligence for small business" /
 * "how to know if your small business is falling behind"
 * FAQPage + Article JSON-LD
 */

import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const CORE_ARGUMENT =
  "The problem is not that you are not working hard enough. You already work harder than anyone who has never owned a business can understand. The problem is that you are working without knowing what the numbers say. There is a gap between how hard you work and how clearly you see your competitive position -- and that gap is where revenue disappears. Not because you failed. Because you could not see the threat until it had already done the damage.";

const SCENARIOS = [
  {
    title: "The HVAC company that does not know who is winning the search",
    body: "You have 78 Google reviews. The competitor two zip codes over has 580. When a homeowner searches \"HVAC repair near me\" on a Saturday morning with a broken furnace, they see the competitor first. You have been in business longer. Your technicians are better trained. Your customer satisfaction is higher. But the homeowner does not know any of that -- they know the review count and the star rating. At your current review velocity of 3 per month versus their 12 per month, the gap grows by 108 reviews per year. In two years, you are not just behind -- you are off the map.",
  },
  {
    title: "The law firm whose top referral source quietly shifted",
    body: "Your highest-volume referral source, a financial advisor who sent you eight clients a year, stopped referring six months ago. You did not notice because the total client count only dipped slightly. Other sources filled part of the gap. But multiply those eight missing clients by your average case value to see the annual impact. The financial advisor started recommending a firm that is closer to their office and sends a thank-you note after every referral. Nobody told you. Nobody had to. The relationship ended without a conversation.",
  },
  {
    title: "The physical therapist who has been told to \"improve your SEO\" three times",
    body: "Three different agencies have told you to \"improve your SEO.\" None of them told you that the competitor 1.2 miles away has 340 Google reviews to your 67. None of them told you that the review gap -- not your website, not your keywords, not your blog content -- is the single reason you are not showing up in the local pack. They sold you work on the wrong problem because they never diagnosed the right one. The answer was not \"improve your SEO.\" The answer was: \"close the review gap by 273 reviews and you will show up.\"",
  },
];

const WHAT_CHANGES =
  "When you have clarity, you stop guessing. You know your review gap number. You know which referral relationships are active and which are drifting. You know when a new competitor enters your market. You know the dollar value of the threat -- not an abstract concern, but a specific number you can act on. Monday morning goes from \"I hope this week is better\" to \"I know exactly what to do and why it matters.\" That shift -- from hope to knowledge -- is what Business Clarity delivers.";

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How do I know if my small business is falling behind competitors?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The clearest indicators are: your Google review count and velocity relative to your top competitor, your new customer or client acquisition trend over the last 90 days, and whether any of your referral sources have gone quiet. If your competitor has significantly more reviews and is gaining them faster, if your new customer volume is declining while retention holds, or if a referral relationship has dropped by 30% or more over 60 days -- you are falling behind. The problem is that most small business owners do not measure these things until the revenue impact is already visible.",
      },
    },
    {
      "@type": "Question",
      name: "What is business intelligence for small businesses?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Business intelligence for small businesses means having the same competitive awareness that large companies pay strategy teams to provide: who your competitors are, how they compare to you on the metrics that matter (reviews, visibility, reputation), which revenue relationships are at risk, and what the one highest-leverage action is this week. For local service businesses, this translates to knowing your review gap, your referral network health, and your competitive market position in real time -- not quarterly.",
      },
    },
    {
      "@type": "Question",
      name: "Why is my small business not growing even though I work hard?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Working hard is necessary but not sufficient. Growth stalls when the competitive landscape changes and the business owner does not see it: a new competitor opened nearby, a key referral source shifted elsewhere, or the Google review gap widened to the point where new customers find someone else first. The problem is not effort -- it is visibility. You cannot outwork a problem you cannot see.",
      },
    },
    {
      "@type": "Question",
      name: "How can a local service business compete with larger competitors?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Larger competitors compete on scale: more locations, more marketing budget, more reviews. Local service businesses compete on intelligence and responsiveness. Know your exact competitive position -- review gap, referral network health, market entrants -- and act on changes faster than a large competitor can. You cannot outspend them. You can out-know them and out-respond them, but only if you have the intelligence layer that tells you what is happening before it shows up in revenue.",
      },
    },
  ],
};

const ARTICLE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline:
    "The Information Gap That Kills Local Service Businesses (And How to Close It)",
  description:
    "The problem is not working hard enough. It is working without knowing what the numbers say. Learn how local service businesses lose revenue to competitors they cannot see.",
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

export default function LocalServiceBusinessClarity() {
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
        <header className="flex items-center justify-center pt-10 pb-6 px-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#D56753] flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L14 14H2L8 2Z" fill="white" opacity="0.9" />
              </svg>
            </div>
            <span className="text-[22px] font-semibold tracking-tight text-[#1A1D23]">
              alloro
            </span>
          </div>
        </header>

        <main className="mx-auto max-w-2xl px-5 pb-16">
          <h1 className="text-3xl sm:text-4xl font-semibold text-[#1A1D23] tracking-tight text-center mt-8">
            The Information Gap That Kills Local Service Businesses (And How to
            Close It)
          </h1>

          {/* Core Argument */}
          <p className="text-base sm:text-lg text-gray-700 leading-relaxed text-center mt-6 max-w-xl mx-auto">
            {CORE_ARGUMENT}
          </p>

          {/* Three ICP Scenarios */}
          <div className="mt-12 space-y-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 text-center">
              Three business owners who discovered the gap too late
            </h2>
            {SCENARIOS.map((scenario, i) => (
              <div
                key={i}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <p className="text-sm font-semibold text-[#1A1D23] mb-2">
                  {scenario.title}
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {scenario.body}
                </p>
              </div>
            ))}
          </div>

          {/* What Changes */}
          <div className="mt-12">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 text-center mb-4">
              What changes when the gap closes
            </h2>
            <p className="text-base text-gray-700 leading-relaxed text-center">
              {WHAT_CHANGES}
            </p>
          </div>

          {/* The Pattern */}
          <div
            className="mt-10 rounded-2xl px-6 py-5 text-center"
            style={{ backgroundColor: "rgba(213, 103, 83, 0.05)" }}
          >
            <p className="text-sm font-semibold text-[#D56753] uppercase tracking-wider mb-2">
              The pattern every local business owner should know
            </p>
            <p className="text-base text-[#1A1D23] font-medium leading-relaxed">
              Competitive threats become visible in revenue 90 to 180 days after
              they become visible in data. The business owner who monitors the
              data acts in month one. The business owner who waits for revenue to
              change acts in month six. By month six, the competitor has a
              six-month head start. That is the information gap. It is the
              difference between a business that adapts and a business that
              reacts.
            </p>
          </div>

          {/* CTA */}
          <div className="mt-12 text-center">
            <button
              onClick={() => navigate("/checkup")}
              className="inline-flex items-center gap-2 rounded-xl bg-[#D56753] px-8 py-4 text-base font-semibold text-white shadow-[0_4px_14px_rgba(213,103,83,0.35)] hover:shadow-[0_6px_20px_rgba(213,103,83,0.45)] hover:brightness-105 active:scale-[0.98] transition-all"
            >
              See where your business stands right now
              <ArrowRight className="h-5 w-5" />
            </button>
            <p className="text-xs text-gray-400 mt-3">
              Free checkup. Works for any local business. No login. 60 seconds.
            </p>
          </div>
        </main>

        <footer className="py-8 text-center border-t border-slate-100">
          <p className="text-xs font-medium tracking-wide text-slate-300 uppercase">
            Alloro &middot; Business Clarity
          </p>
        </footer>
      </div>
    </>
  );
}
