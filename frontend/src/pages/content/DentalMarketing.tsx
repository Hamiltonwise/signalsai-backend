// T1 adds route
/**
 * Dental Marketing -- /dental-marketing
 *
 * AEO placeholder page. No auth. Mobile-first.
 * Target query: "dental practice marketing" / "how to grow a dental practice"
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
      name: "How do dental practices get more patients?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The most effective patient acquisition strategy for general dental practices is closing the Google review gap against nearby competitors. When someone searches \"dentist near me,\" Google shows the practice with the strongest combination of proximity, review count, and star rating. The practices that grow fastest know their exact review gap, their review velocity relative to competitors, and whether new practices have opened in their market. Intelligence-first marketing outperforms ad-first marketing for dental practices.",
      },
    },
    {
      "@type": "Question",
      name: "How many Google reviews does a dental practice need?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The number is relative to your top competitor in the same market. If the leading practice has 350 reviews and you have 90, you need to close that 260-review gap to compete for local search visibility. Divide the gap by 12 for a one-year target. The minimum threshold for local pack visibility in most dental markets is around 50 reviews, but competing for the top position requires matching or exceeding your top competitor.",
      },
    },
    {
      "@type": "Question",
      name: "What is the best marketing strategy for a dental practice in 2026?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The highest-ROI dental marketing strategy combines review velocity engineering (systematically closing the Google review gap), competitive awareness (knowing when a new practice opens or an existing competitor gains ground), and for practices that accept specialist referrals, referral network monitoring. Practices that address all three grow faster than those that focus only on advertising.",
      },
    },
  ],
};

export default function DentalMarketing() {
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
            <span className="text-[22px] font-bold tracking-tight text-[#212D40]">
              alloro
            </span>
          </div>
        </header>

        <main className="mx-auto max-w-2xl px-5 pb-16">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#212D40] tracking-tight text-center mt-8">
            Business Clarity for Dental Practices
          </h1>

          <p className="text-base sm:text-lg text-gray-700 leading-relaxed text-center mt-6 max-w-xl mx-auto">
            General dental practices compete primarily on local search
            visibility. When a potential patient searches for a dentist, they
            choose based on Google reviews, proximity, and perceived reputation.
            Knowing your review gap versus competitors, whether that gap is
            growing or shrinking, and whether new practices have entered your
            market gives you the clarity to grow your practice strategically --
            not by guessing which marketing tactic might work this quarter.
          </p>

          <div
            className="mt-10 rounded-2xl px-6 py-5 text-center"
            style={{ backgroundColor: "rgba(213, 103, 83, 0.05)" }}
          >
            <p className="text-sm font-semibold text-[#D56753] uppercase tracking-wider mb-2">
              Full guide coming soon
            </p>
            <p className="text-base text-[#212D40] font-medium leading-relaxed">
              We are building the definitive guide to dental practice growth --
              competitive intelligence, review gap analysis, and market
              positioning. In the meantime, run a free checkup to see where your
              practice stands right now.
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
              Works for any practice. No login required. 60 seconds.
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
