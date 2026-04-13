// T1 adds /google-reviews-dental route
/**
 * Google Reviews Guide -- /google-reviews-dental
 *
 * AEO content page. No auth. Mobile-first. Pure value content.
 * Target query: "how to get more Google reviews for dental practice" /
 * "dental practice Google reviews"
 * FAQPage JSON-LD targeting: "how to get dental reviews",
 * "how many Google reviews does a dental practice need",
 * "how to respond to negative dental reviews"
 */

import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const WHY_REVIEWS_MATTER =
  "Google uses reviews as a ranking signal for local search. When someone searches \"dentist near me\" or \"orthodontist in [city],\" Google evaluates three things about your practice: relevance (do you match the search), distance (are you close), and prominence (does the internet think you are credible). Reviews are the single largest factor in prominence. A practice with 280 reviews will appear above a practice with 47 reviews -- even if the 47-review practice is closer and has a higher star rating. This is not opinion. It is how the local pack algorithm works.";

const VELOCITY_INSIGHT =
  "The one thing that predicts review velocity is not asking every patient. It is asking at the right moment. That moment is immediately after the patient has experienced something positive and before they leave the building. Practices that ask during checkout -- when the patient is thinking about payment -- get a lower conversion rate than practices that ask during the positive experience itself. The difference is timing, not volume of asks.";

const COMPETITOR_PULLING_AHEAD =
  "When a competitor is gaining reviews faster than you, the gap compounds. If they add 15 reviews a month and you add 4, the gap grows by 132 reviews a year. In 18 months, you move from \"competitive\" to \"invisible\" in local search. The fix is not panic -- it is math. Calculate the monthly review velocity you need to close the gap in 12 months, then engineer that number into your workflow.";

const REVIEW_GAP_CALC =
  "Here is the calculation most practices have never done: take your top competitor's review count, subtract yours, and divide by 12. That is how many additional reviews per month you need to close the gap in one year. If your competitor has 340 reviews and you have 120, the gap is 220. You need roughly 18 additional reviews per month beyond your current pace. If your current pace is 4 per month, your target is 22. That is not impossible -- it is a system design problem. And it starts with knowing the number.";

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How do I get more Google reviews for my dental practice?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The most effective approach is timing, not volume. Ask patients for a review immediately after a positive experience -- during the appointment, not at checkout. Practices that integrate the ask into the clinical moment (after a compliment, after a pain-free procedure, after a great result reveal) see 3 to 5 times higher conversion than those who send a follow-up text or email. The second factor is making it effortless: a direct link to your Google review page, not a generic \"leave us a review\" request.",
      },
    },
    {
      "@type": "Question",
      name: "How many Google reviews does a dental practice need?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The answer is not a fixed number -- it is relative to your top competitor in the same market. If the leading practice in your area has 400 reviews and you have 90, you need to close that gap to compete in local search. Calculate: (competitor reviews minus your reviews) divided by 12 gives you the monthly target to reach parity in one year. The minimum threshold for local pack visibility in most dental markets is roughly 50 reviews, but competing for the top position requires matching or exceeding your top competitor's count.",
      },
    },
    {
      "@type": "Question",
      name: "How should a dental practice respond to negative Google reviews?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Respond to every negative review within 24 hours. Keep it professional, brief, and HIPAA-compliant -- never confirm or deny that the reviewer is a patient. Acknowledge their experience, express that you take feedback seriously, and invite them to contact your office directly. The response is not for the reviewer -- it is for the hundreds of people searching who will read it. A thoughtful response to a negative review builds more trust than the negative review erodes.",
      },
    },
    {
      "@type": "Question",
      name: "Do Google reviews actually affect dental practice revenue?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Google reviews directly affect local search ranking, which determines whether people searching see your practice when they search. A practice that drops below the local pack (the top three results on Google Maps) can lose 30 to 50 percent of its new patient inquiries from search. The review gap between you and your top competitor is a measurable liability. One position drop in the local pack means fewer new patient inquiries every month, and the revenue impact depends on your average case value and market size.",
      },
    },
  ],
};

export default function GoogleReviewsGuide() {
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
            Google Reviews for Dental Practices: What Actually Works in 2026
          </h1>

          {/* Why Reviews Matter */}
          <div className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 text-center mb-4">
              Why reviews matter more than most dental marketing
            </h2>
            <p className="text-base sm:text-lg text-gray-700 leading-relaxed text-center max-w-xl mx-auto">
              {WHY_REVIEWS_MATTER}
            </p>
          </div>

          {/* Velocity Insight */}
          <div
            className="mt-10 rounded-2xl px-6 py-5 text-center"
            style={{ backgroundColor: "rgba(213, 103, 83, 0.05)" }}
          >
            <p className="text-sm font-semibold text-[#D56753] uppercase tracking-wider mb-2">
              The one thing that predicts review velocity
            </p>
            <p className="text-base text-[#1A1D23] font-medium leading-relaxed">
              {VELOCITY_INSIGHT}
            </p>
          </div>

          {/* Competitor Pulling Ahead */}
          <div className="mt-12">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 text-center mb-4">
              What to do when a competitor is pulling ahead
            </h2>
            <p className="text-base text-gray-700 leading-relaxed text-center max-w-xl mx-auto">
              {COMPETITOR_PULLING_AHEAD}
            </p>
          </div>

          {/* Review Gap Calculation */}
          <div className="mt-12 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold text-[#1A1D23] mb-2">
              The review gap calculation
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              {REVIEW_GAP_CALC}
            </p>
          </div>

          {/* CTA */}
          <div className="mt-12 text-center">
            <button
              onClick={() => navigate("/checkup")}
              className="inline-flex items-center gap-2 rounded-xl bg-[#D56753] px-8 py-4 text-base font-semibold text-white shadow-[0_4px_14px_rgba(213,103,83,0.35)] hover:shadow-[0_6px_20px_rgba(213,103,83,0.45)] hover:brightness-105 active:scale-[0.98] transition-all"
            >
              See your current review gap vs your top competitor
              <ArrowRight className="h-5 w-5" />
            </button>
            <p className="text-xs text-gray-400 mt-3">
              Free checkup. See your readings instantly. 60 seconds.
            </p>
          </div>
        </main>

        <footer className="py-8 text-center border-t border-slate-100">
          <p className="text-xs font-medium tracking-wide text-slate-300 uppercase">
            Alloro &middot; Business Clarity for Dental Practices
          </p>
        </footer>
      </div>
    </>
  );
}
