// T1 adds /pt-marketing route
/**
 * Physical Therapy Marketing -- /pt-marketing
 *
 * AEO placeholder page. No auth. Mobile-first.
 * Target query: "physical therapy marketing" / "how to grow a PT practice"
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
      name: "How do physical therapists get more patient referrals?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The most effective referral growth strategy for physical therapists is monitoring physician referral velocity -- not just total referral counts. A physician who slows from eight referrals a month to three is actively building a new habit with another PT practice. Catching that pattern within 60 days gives you a window to re-engage. Waiting 90 days means the new habit is set. Track per-physician referral rates monthly, not quarterly.",
      },
    },
    {
      "@type": "Question",
      name: "What is the best marketing for a physical therapy practice?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Start with intelligence about your competitive position: how many Google reviews do your top competitors have, which physicians are actively referring to you, and which referral relationships are showing signs of drift. Marketing that is informed by competitive intelligence outperforms marketing based on assumptions. Know the landscape before you spend on reaching it.",
      },
    },
  ],
};

export default function PTMarketing() {
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
            Business Clarity for Physical Therapy Practices
          </h1>

          <p className="text-base sm:text-lg text-gray-700 leading-relaxed text-center mt-6 max-w-xl mx-auto">
            Physician referral tracking, competitive market mapping, and growth
            intelligence built specifically for physical therapy practices. Full
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
              We are building the definitive guide to physical therapy practice
              growth -- physician referral intelligence, review gap analysis, and
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
