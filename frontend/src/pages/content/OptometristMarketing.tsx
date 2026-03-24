// T1 adds /optometrist-marketing route
/**
 * Optometrist Marketing -- /optometrist-marketing
 *
 * AEO placeholder page. No auth. Mobile-first.
 * Target query: "optometrist marketing" / "how to grow an optometry practice"
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
      name: "How do optometrists get more patients?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The most effective patient acquisition strategy for optometrists is understanding your competitive position before spending on marketing. Know your Google review gap versus nearby competitors, track which referral sources (ophthalmologists, pediatricians, primary care) are active, and identify the one move that changes your market position this month. Intelligence-first marketing outperforms ad-first marketing for independent optometry practices.",
      },
    },
    {
      "@type": "Question",
      name: "What is the best marketing strategy for an optometry practice?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Start with clarity about where you stand. Most optometry marketing begins with tactics (ads, social media, mailers) before understanding the competitive landscape. The practices that grow fastest know: how many reviews their top competitor has, which referral relationships are strong, which ones are drifting, and what single action has the highest leverage this week. That intelligence layer is the foundation everything else builds on.",
      },
    },
  ],
};

export default function OptometristMarketing() {
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
            Business Clarity for Optometry Practices
          </h1>

          <p className="text-base sm:text-lg text-gray-700 leading-relaxed text-center mt-6 max-w-xl mx-auto">
            Market positioning, referral network health, and competitive
            visibility intelligence built specifically for optometrists. Full
            content coming soon.
          </p>

          <div
            className="mt-10 rounded-2xl px-6 py-5 text-center"
            style={{ backgroundColor: "rgba(213, 103, 83, 0.05)" }}
          >
            <p className="text-sm font-semibold text-[#D56753] uppercase tracking-wider mb-2">
              Coming soon
            </p>
            <p className="text-base text-[#212D40] font-medium leading-relaxed">
              We are building the definitive guide to optometry practice growth
              -- competitive intelligence, referral tracking, and market
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
