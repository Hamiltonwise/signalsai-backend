// T1 adds /chiropractor-marketing route
/**
 * Chiropractor Marketing -- /chiropractor-marketing
 *
 * AEO content page. No auth. Mobile-first.
 * Target query: "how to get more chiropractic patients" /
 * "chiropractic practice growth"
 * FAQPage JSON-LD targeting: "how to get chiropractic patients",
 * "chiropractic practice growth", "chiropractic marketing strategy"
 */

import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const THREE_CHANNEL =
  "Chiropractors face a competitive dynamic that most healthcare specialties do not: you compete on three channels simultaneously. Channel one is Google visibility -- when someone searches \"chiropractor near me,\" the practice with the most reviews and the strongest local presence wins. Channel two is physician referrals -- orthopedic surgeons, primary care doctors, and sports medicine physicians who route patients to you. Channel three is direct consumer search -- people researching chiropractic care for back pain, headaches, or sports injuries and choosing based on what they find online. Losing ground on any one channel costs you patients. Losing ground on all three is a compounding problem that gets harder to reverse every month.";

const SCENARIOS = [
  {
    title: "The chiro who does not know a competitor opened 0.5 miles away",
    body: "A new practice opened half a mile from yours three months ago. They launched with a marketing budget, a modern website, and an aggressive review generation strategy. They already have 180 more Google reviews than you do. When someone in your zip code searches \"chiropractor near me,\" they see the new practice first. You have not lost any existing patients. But the new patients who would have found you are finding them instead. You will notice this in six months when your new patient volume has quietly declined 25% -- and by then, the review gap will be 300.",
  },
  {
    title: "The practice that lost their top referring orthopedic surgeon",
    body: "Your highest-volume referring orthopedic surgeon sent you 10 patients a month for four years. Over the last 90 days, that dropped to two. You did not notice because your schedule still felt busy -- existing patients and other referral sources filled the gap temporarily. But that one surgeon represented $8,000 a month in new patient revenue. They started sending cases to a chiropractor who is closer to their office and returns reports faster. By the time you notice the gap, the new referral habit is set.",
  },
  {
    title: "The solo chiro competing against a franchise chain",
    body: "You have 64 Google reviews built over five years of excellent care. The franchise chain that opened in your market 18 months ago has 420 reviews across their location. Their per-location review velocity is 20 per month. Yours is 3. The clinical quality gap favors you. The visibility gap does not. When a potential patient compares the two on Google, they see the chain's review count and star rating first. Your outcomes are better. But outcomes do not show up in a Google search -- review count does.",
  },
];

const SIGNALS = [
  {
    title: "Review velocity gap is widening",
    body: "If your top competitor is gaining reviews faster than you, the gap compounds monthly. A competitor adding 15 reviews per month while you add 3 means the gap grows by 144 reviews per year. Track the velocity, not just the count. The count tells you where you are. The velocity tells you where you are headed.",
  },
  {
    title: "Physician referral volume is declining per source",
    body: "A 30% decline in monthly patient volume from any single referring physician over 60 days is a relationship in motion. The physician found someone closer, faster, or more communicative. The window to intervene is 60 days. After 90, the new referral habit is established.",
  },
  {
    title: "New market entrant is spending aggressively",
    body: "A new practice or franchise location opened in your market radius and is running paid ads, generating reviews rapidly, and building a Google presence from scratch. Their first 90 days of marketing spend will determine whether they capture your market share permanently. You need to know they exist before their strategy is fully deployed.",
  },
];

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How do I get more chiropractic patients?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The most effective patient acquisition strategy for chiropractors addresses three channels: Google visibility (closing the review gap against nearby competitors), physician referrals (monitoring which doctors are sending patients and which ones have slowed), and direct consumer search (ensuring your online presence answers the questions potential patients are actually asking). Most chiropractic marketing focuses only on ads. The practices that grow fastest focus on the three assets that compound: reviews, referral relationships, and content authority.",
      },
    },
    {
      "@type": "Question",
      name: "Why is my chiropractic practice not growing?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The most common reason a chiropractic practice plateaus is invisible competitive erosion. A new competitor opened nearby, a referring physician shifted cases elsewhere, or the Google review gap widened -- and the practice owner did not see it because none of these changes showed up in a report. Growth stalls not because you stopped doing good work, but because the competitive landscape changed without you knowing.",
      },
    },
    {
      "@type": "Question",
      name: "How do chiropractors compete with franchise chains?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Franchise chains compete on volume: more locations, more marketing spend, more Google reviews per location. Independent chiropractors compete on intelligence: knowing exactly which competitors are gaining ground, which referral sources are drifting, and what the one highest-leverage move is this week. You cannot outspend a franchise. You can out-know them -- if you have an intelligence layer that reads your market in real time.",
      },
    },
    {
      "@type": "Question",
      name: "What is the best marketing strategy for chiropractors in 2026?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The highest-ROI chiropractic marketing strategy in 2026 combines three things: review velocity engineering (systematically closing the Google review gap), referral intelligence (monitoring and protecting physician referral relationships before they drift), and competitive awareness (knowing when a new entrant or existing competitor changes the landscape). Practices that address all three channels grow faster than those that focus only on advertising.",
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
            Why Chiropractic Practices Lose Patients to Competitors (And How to
            See It Before It Happens)
          </h1>

          {/* Three-Channel Problem */}
          <p className="text-base sm:text-lg text-gray-700 leading-relaxed text-center mt-6 max-w-xl mx-auto">
            {THREE_CHANNEL}
          </p>

          {/* Three ICP Scenarios */}
          <div className="mt-12 space-y-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 text-center">
              Three chiropractors who needed to see this sooner
            </h2>
            {SCENARIOS.map((scenario, i) => (
              <div
                key={i}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <p className="text-sm font-semibold text-[#212D40] mb-2">
                  {scenario.title}
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {scenario.body}
                </p>
              </div>
            ))}
          </div>

          {/* Three Signals */}
          <div className="mt-12 space-y-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 text-center">
              Three signals to watch across all three channels
            </h2>
            {SIGNALS.map((signal, i) => (
              <div
                key={i}
                className="rounded-2xl px-6 py-5"
                style={{ backgroundColor: "rgba(213, 103, 83, 0.05)" }}
              >
                <p className="text-sm font-semibold text-[#D56753] mb-2">
                  {signal.title}
                </p>
                <p className="text-sm text-[#212D40] leading-relaxed">
                  {signal.body}
                </p>
              </div>
            ))}
          </div>

          {/* What To Do */}
          <div className="mt-12">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 text-center mb-4">
              What to do when you see the signal
            </h2>
            <p className="text-base text-gray-700 leading-relaxed text-center">
              Do not guess which channel is the problem. Measure all three. Know
              your review gap number, know which referring physicians are active
              versus drifting, and know whether a new competitor has entered your
              market. The cost of that intelligence is trivial compared to the
              cost of discovering the problem six months late. One lost referring
              physician at 10 patients per month is $96,000 a year. One widening
              review gap is every new patient who chose the competitor instead of
              you. The math is not abstract -- it is your revenue.
            </p>
          </div>

          {/* CTA */}
          <div className="mt-12 text-center">
            <button
              onClick={() => navigate("/checkup")}
              className="inline-flex items-center gap-2 rounded-xl bg-[#D56753] px-8 py-4 text-base font-semibold text-white shadow-[0_4px_14px_rgba(213,103,83,0.35)] hover:shadow-[0_6px_20px_rgba(213,103,83,0.45)] hover:brightness-105 active:scale-[0.98] transition-all"
            >
              See where your practice stands right now
              <ArrowRight className="h-5 w-5" />
            </button>
            <p className="text-xs text-gray-400 mt-3">
              Free checkup. See your score instantly. 60 seconds.
            </p>
          </div>
        </main>

        <footer className="py-8 text-center border-t border-slate-100">
          <p className="text-[11px] font-medium tracking-wide text-slate-300 uppercase">
            Alloro &middot; Business Clarity for Chiropractors
          </p>
        </footer>
      </div>
    </>
  );
}
