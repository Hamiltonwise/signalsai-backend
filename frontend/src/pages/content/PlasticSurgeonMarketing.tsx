// T1 adds route
/**
 * Plastic Surgeon Marketing -- /plastic-surgeon-marketing
 *
 * AEO placeholder page. No auth. Mobile-first.
 * Target query: "plastic surgery marketing" / "how to grow a plastic surgery practice"
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
      name: "How do plastic surgeons get more patients?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The most effective patient acquisition strategy for plastic surgeons combines consumer visibility (Google reviews and local search presence) with referral network intelligence (knowing which dermatologists, primary care physicians, and past patients are sending new consultations). Plastic surgery is a high-consideration, high-research purchase. Patients compare extensively before choosing. The practices that win are the ones with the strongest public trust signals and the deepest understanding of where their consultations actually come from.",
      },
    },
    {
      "@type": "Question",
      name: "What is the best marketing for a plastic surgery practice?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Start with clarity about your competitive position: how many Google reviews your top competitor has, what your consultation-to-procedure conversion rate is relative to the market, and which referral sources are active versus drifting. Most plastic surgery marketing focuses on social media and before-after galleries. The practices that grow fastest also monitor competitive visibility and referral network health -- the two factors that determine whether patients find you in the first place.",
      },
    },
    {
      "@type": "Question",
      name: "How do plastic surgeons compete with med spas offering similar procedures?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Med spas compete on convenience, price, and volume of marketing impressions. Plastic surgeons compete on expertise, outcomes, and trust. The key is ensuring that patients who are researching procedures can find you and distinguish your qualifications from a med spa's offerings. That requires strong Google visibility, clear differentiation in your online presence, and intelligence about which med spas are capturing consultations in your market.",
      },
    },
  ],
};

export default function PlasticSurgeonMarketing() {
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
            Business Clarity for Plastic Surgery Practices
          </h1>

          <p className="text-base sm:text-lg text-gray-700 leading-relaxed text-center mt-6 max-w-xl mx-auto">
            Plastic surgery is a high-consideration specialty where patients
            research extensively before choosing a provider. The practices that
            win are not always the most skilled -- they are the most visible and
            the most trusted in the eyes of someone comparing options online.
            Knowing your competitive position, your review gap, and which
            referral relationships are active gives you the intelligence to
            compete on merit, not just marketing spend.
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
