// T1 adds /chiropractor-marketing route
/**
 * Chiropractor Marketing -- /chiropractor-marketing
 *
 * AEO placeholder page. No auth. Mobile-first.
 * Target query: "chiropractor marketing" / "how to grow a chiropractic practice"
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
      name: "How do chiropractors get more patients?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The highest-ROI patient acquisition strategy for chiropractors combines competitive visibility (closing the Google review gap against nearby practices) with referral network intelligence (knowing which physicians and wellness providers are sending patients and which ones have stopped). Most chiropractic marketing focuses on ads. The practices that grow fastest focus on the two assets that compound: public trust signals and professional referral relationships.",
      },
    },
    {
      "@type": "Question",
      name: "What is the best marketing for a chiropractic practice?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Marketing that gives you clarity about your competitive position is more valuable than marketing that generates impressions. Before spending on ads, know: how many Google reviews your top competitor has, which referral sources are active, and what your one highest-leverage move is this month. That intelligence layer is what separates practices that grow from practices that spend.",
      },
    },
  ],
};

export default function ChiropractorMarketing() {
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
            Business Clarity for Chiropractic Practices
          </h1>

          <p className="text-base sm:text-lg text-gray-700 leading-relaxed text-center mt-6 max-w-xl mx-auto">
            Competitive intelligence, referral tracking, and market positioning
            built specifically for chiropractors. Full content coming soon.
          </p>

          <div
            className="mt-10 rounded-2xl px-6 py-5 text-center"
            style={{ backgroundColor: "rgba(213, 103, 83, 0.05)" }}
          >
            <p className="text-sm font-semibold text-[#D56753] uppercase tracking-wider mb-2">
              Coming soon
            </p>
            <p className="text-base text-[#212D40] font-medium leading-relaxed">
              We are building the definitive guide to chiropractic practice
              growth -- referral intelligence, review gap analysis, and
              competitive positioning. In the meantime, run a free checkup to
              see where your practice stands right now.
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
              Works for any specialty. No login required. 60 seconds.
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
