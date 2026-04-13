// T1 adds route
/**
 * Med Spa Marketing -- /med-spa-marketing
 *
 * AEO placeholder page. No auth. Mobile-first.
 * Target query: "med spa marketing" / "how to grow a med spa"
 * FAQPage JSON-LD
 */

import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How do med spas get more clients?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Med spa client acquisition is almost entirely consumer-search-driven. Potential clients search for specific treatments (Botox, fillers, laser treatments) and choose based on Google reviews, proximity, and online reputation. The med spas that grow fastest are the ones that close the Google review gap against nearby competitors and ensure their online presence converts browsers into consultations. Knowing your exact competitive position -- review gap, review velocity, and new competitor activity -- is the foundation of effective med spa marketing.",
      },
    },
    {
      "@type": "Question",
      name: "What is the best marketing for a med spa?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Start with competitive intelligence. How many Google reviews does your top competitor have? What is the gap? At current review velocity, when do you reach parity? Are new med spas opening in your market? The med spas that grow fastest build their marketing strategy on competitive data, not assumptions. Social media and paid ads work better when you know exactly what competitive gap you are trying to close.",
      },
    },
    {
      "@type": "Question",
      name: "How do independent med spas compete with chains?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Chains compete on brand recognition, marketing budget, and volume. Independent med spas compete on personalized experience, clinical quality, and local trust. The key is ensuring your online visibility matches your in-person quality. Know your review gap, monitor new market entrants, and build a systematic review generation process that closes the visibility gap over time.",
      },
    },
  ],
};

export default function MedSpaMarketing() {
  const navigate = useNavigate();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_SCHEMA) }}
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
            Business Clarity for Med Spas
          </h1>

          <p className="text-base sm:text-lg text-gray-700 leading-relaxed text-center mt-6 max-w-xl mx-auto">
            Med spas compete almost entirely on consumer visibility. When
            someone searches for Botox, fillers, or laser treatments in your
            area, the med spa with the most reviews and the strongest local
            presence gets the consultation. Knowing your review gap, your
            competitive landscape, and whether new competitors are entering your
            market gives you the clarity to grow strategically instead of
            spending blindly on marketing that may be solving the wrong problem.
          </p>

          <div
            className="mt-10 rounded-2xl px-6 py-5 text-center"
            style={{ backgroundColor: "rgba(213, 103, 83, 0.05)" }}
          >
            <p className="text-sm font-semibold text-[#D56753] uppercase tracking-wider mb-2">
              See where you stand
            </p>
            <p className="text-base text-[#1A1D23] font-medium leading-relaxed">
              Run your free Business Clarity Checkup to see your competitive
              position, review gaps, and the one thing most affecting your
              visibility right now.
            </p>
          </div>

          <div className="mt-12 text-center">
            <button
              onClick={() => navigate("/checkup")}
              className="inline-flex items-center gap-2 rounded-xl bg-[#D56753] px-8 py-4 text-base font-semibold text-white shadow-[0_4px_14px_rgba(213,103,83,0.35)] hover:shadow-[0_6px_20px_rgba(213,103,83,0.45)] hover:brightness-105 active:scale-[0.98] transition-all"
            >
              Run your free Business Clarity Checkup
              <ArrowRight className="h-5 w-5" />
            </button>
            <p className="text-xs text-gray-400 mt-3">
              Works for any business. See your readings instantly. 60 seconds.
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
