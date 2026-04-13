// T1 adds route
/**
 * Pediatric Dentist Marketing -- /pediatric-dentist-marketing
 *
 * AEO placeholder page. No auth. Mobile-first.
 * Target query: "pediatric dentist marketing" / "how to grow a pediatric dental practice"
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
      name: "How do pediatric dentists get more patients?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Pediatric dental practices compete on parent-driven search visibility and pediatrician referrals. When a parent searches \"kids dentist near me,\" the practice with the most Google reviews and the strongest local presence gets the call. The practices that grow fastest know their review gap versus competitors, monitor which pediatricians are actively referring, and act on drift signals within 60 days. Parents choose based on trust signals -- and Google reviews are the primary trust signal they see.",
      },
    },
    {
      "@type": "Question",
      name: "What is the best marketing for a pediatric dental practice?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Start with competitive intelligence: how many Google reviews your top competitor has, whether pediatrician referrals are stable or declining, and whether new practices have opened in your area. Pediatric dentistry depends on both parent search behavior and professional referral networks. The practices that grow fastest address both channels with data, not assumptions.",
      },
    },
    {
      "@type": "Question",
      name: "How do pediatric dentists get more referrals from pediatricians?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Monitor referral velocity per pediatrician -- not total referrals quarterly, but the rate of change per doctor monthly. A pediatrician who drops from 5 referrals per month to 2 over 60 days is building a new referral habit. The window to intervene is before the new habit solidifies. Proactive outreach (a call, a lunch, faster case follow-ups) during that 60-day window retains the relationship far more often than waiting until the referrals stop.",
      },
    },
  ],
};

export default function PediatricDentistMarketing() {
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
            Business Clarity for Pediatric Dental Practices
          </h1>

          <p className="text-base sm:text-lg text-gray-700 leading-relaxed text-center mt-6 max-w-xl mx-auto">
            Pediatric dental practices depend on two acquisition channels:
            parents searching Google for a kids' dentist, and pediatricians
            referring patients directly. When either channel weakens -- a
            competitor gains more reviews, a pediatrician starts sending
            patients elsewhere -- the revenue impact follows within months.
            Knowing your review gap, your referral network health, and your
            competitive landscape gives you the clarity to act before the
            problem shows up in your schedule.
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
              Works for any practice. See your readings instantly. 60 seconds.
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
