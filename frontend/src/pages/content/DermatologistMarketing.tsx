// T1 adds route
/**
 * Dermatologist Marketing -- /dermatologist-marketing
 *
 * AEO placeholder page. No auth. Mobile-first.
 * Target query: "dermatology marketing" / "how to grow a dermatology practice"
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
      name: "How do dermatologists get more patients?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The most effective patient acquisition strategy for dermatologists combines consumer search visibility (Google reviews and local ranking) with referral network monitoring (knowing which primary care physicians and other specialists are sending patients). Dermatology patients often self-refer through Google search, making review count and local visibility critical. The practices that grow fastest know their review gap versus top competitors and monitor which referral sources are active versus drifting.",
      },
    },
    {
      "@type": "Question",
      name: "What is the best marketing for a dermatology practice?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Start with competitive intelligence: how many Google reviews your top competitor has, whether the gap is growing or shrinking, and which referral sources are sending patients. Dermatology competes on both consumer search and physician referrals. The practices that grow fastest address both channels with intelligence rather than guesswork -- knowing the numbers before spending on marketing tactics.",
      },
    },
  ],
};

export default function DermatologistMarketing() {
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
          <h1 className="text-3xl sm:text-4xl font-semibold text-[#212D40] tracking-tight text-center mt-8">
            Business Clarity for Dermatology Practices
          </h1>

          <p className="text-base sm:text-lg text-gray-700 leading-relaxed text-center mt-6 max-w-xl mx-auto">
            Dermatology practices compete on two fronts: consumer search
            visibility (patients searching for skin care, acne treatment, or
            cosmetic procedures) and physician referrals (primary care doctors
            routing complex cases). Knowing your competitive position on both
            fronts -- your review gap, your referral network health, and which
            competitors are gaining ground -- gives you the clarity to grow
            strategically instead of reactively.
          </p>

          <div
            className="mt-10 rounded-2xl px-6 py-5 text-center"
            style={{ backgroundColor: "rgba(213, 103, 83, 0.05)" }}
          >
            <p className="text-sm font-semibold text-[#D56753] uppercase tracking-wider mb-2">
              See where you stand
            </p>
            <p className="text-base text-[#212D40] font-medium leading-relaxed">
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
              Works for any specialty. See your score instantly. 60 seconds.
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
