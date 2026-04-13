// T1 adds /about to App.tsx
/**
 * About -- /about
 *
 * Conviction statement page. No auth. Mobile-first.
 * Not a team bio. A statement of why Alloro exists.
 */

import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const ARTICLE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Alloro is built on one idea.",
  description:
    "Every local business owner deserves to know what is actually happening in their market. Not a monthly report. The specific, true, actionable thing they did not know.",
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

export default function About() {
  const navigate = useNavigate();

  return (
    <>
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
            Alloro is built on one idea.
          </h1>

          <p className="text-lg sm:text-xl text-[#1A1D23] font-medium leading-relaxed text-center mt-6 max-w-xl mx-auto">
            Every local business owner deserves to know what is actually
            happening in their market. Not a monthly report. Not a dashboard
            full of numbers. The specific, true, actionable thing they did not
            know -- every Monday morning.
          </p>

          {/* Why the problem exists */}
          <div className="mt-14 space-y-10">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 text-center mb-4">
                Why the problem exists
              </h2>
              <p className="text-base text-gray-700 leading-relaxed text-center">
                You trained for years in something you love. Dentistry,
                chiropractic, optometry, veterinary medicine, law, physical
                therapy -- the craft that made you want to build a business in
                the first place. Nobody in that training taught you how to read a
                competitive market. Nobody taught you that the referring doctor
                who went quiet two months ago is sending cases to someone else.
                Nobody taught you that the competitor with 400 more Google
                reviews is the reason your phone rings less, not your clinical
                quality. The information exists. It has always existed. But it
                was locked inside systems built for enterprises with dedicated
                analytics teams -- not for a business owner who spends their day
                doing the work.
              </p>
            </div>

            {/* What Alloro does differently */}
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 text-center mb-4">
                What Alloro does differently
              </h2>
              <p className="text-base text-gray-700 leading-relaxed text-center">
                Alloro does not give you more data. You already have more data
                than you can use. Alloro reads the data for you and tells you
                what it means. The biological reality is that a human brain
                cannot hold a competitive market model, a referral velocity
                trend, a review gap trajectory, and a revenue risk calculation in
                working memory simultaneously. It was never designed to. The
                economic reality is that the person who could do this for you -- a
                chief strategy officer who reads your market every morning and
                says "here is the one thing that matters today" -- costs $200,000
                a year. Alloro is that person. For every business owner. At a
                price that makes it obvious.
              </p>
            </div>

            {/* Who built it */}
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 text-center mb-4">
                Who built it
              </h2>
              <p className="text-base text-gray-700 leading-relaxed text-center">
                Alloro was built by Corey Siegel. He has worked in the dental
                specialist space since 2020 -- building software, watching
                practices struggle with the same invisible problems, and
                realizing that no product on the market actually solved the core
                issue. Every tool gave doctors more data. None of them gave
                doctors clarity. He built Alloro because he lived the problem:
                watching smart, hardworking business owners make decisions
                without the information that would have changed those decisions.
                The unfair advantage is not technology. It is knowing exactly
                what these business owners need to hear, because he has spent
                years listening to what they do not know.
              </p>
            </div>
          </div>

          {/* CTA */}
          <div
            className="mt-14 rounded-2xl px-6 py-8 text-center"
            style={{ backgroundColor: "rgba(213, 103, 83, 0.05)" }}
          >
            <p className="text-base font-medium text-[#1A1D23]">
              The best way to understand Alloro is to run a Checkup.
            </p>
            <button
              onClick={() => navigate("/checkup")}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#D56753] px-8 py-4 text-base font-semibold text-white shadow-[0_4px_14px_rgba(213,103,83,0.35)] hover:shadow-[0_6px_20px_rgba(213,103,83,0.45)] hover:brightness-105 active:scale-[0.98] transition-all"
            >
              Run your free Checkup
              <ArrowRight className="h-5 w-5" />
            </button>
            <p className="text-xs text-gray-400 mt-3">
              No login. No sales call. 60 seconds.
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
