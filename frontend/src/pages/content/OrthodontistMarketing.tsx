// T1 adds /orthodontist-marketing route
/**
 * Orthodontist Marketing -- /orthodontist-marketing
 *
 * AEO content page. No auth. Mobile-first.
 * Target query: "how to get more orthodontic referrals" /
 * "orthodontic practice growth"
 * FAQPage JSON-LD
 */

import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const SCENARIOS = [
  {
    title: "The ortho whose top pediatric dentist went quiet",
    body: "Your highest-volume referring pediatric dentist sent eight cases a month for three years. Over the last 90 days, that dropped to two. You did not notice because your total case count only dipped slightly -- other GPs filled part of the gap. But that one pediatric dentist represented $14,000 a month in production. By the time the bank statement catches up, the relationship is already rebuilt with your competitor down the road.",
  },
  {
    title: "The practice that does not know a new Invisalign provider opened nearby",
    body: "A corporate-backed clear aligner competitor opened two miles away with a $3,500 price point and a marketing budget you cannot match. Your GP referrals for aligner cases dropped 40% in 60 days. You are still running the same Facebook ads. The problem is not your marketing -- it is that your competitive landscape changed and nobody told you.",
  },
  {
    title: "The solo ortho competing against a DSO with 10x the review count",
    body: "You have 89 Google reviews. The DSO three blocks away has 940. When a parent searches \"orthodontist near me,\" Google shows the practice with social proof first. Your clinical outcomes are better. Your patient experience is better. But the algorithm does not measure chairside manner -- it measures volume of public trust signals. And right now, you are invisible.",
  },
];

const DUAL_THREAT =
  "Orthodontists face a competitive dynamic that endodontists and oral surgeons do not: you compete on two fronts simultaneously. Front one is GP referrals -- pediatric dentists and general practitioners who route cases to you. Front two is direct consumer visibility -- parents searching Google for \"orthodontist near me\" and choosing based on reviews, proximity, and perceived reputation. Losing ground on either front costs you cases. Losing ground on both is an existential problem that compounds monthly.";

const SIGNALS = [
  {
    title: "GP referral velocity decline",
    body: "A 30% drop in monthly case volume from any single referring doctor over 60 days is not a slow month. It is a relationship that is moving. The pediatric dentist found someone closer, faster, or friendlier to work with. The window to intervene is before the new habit is set.",
  },
  {
    title: "Review gap acceleration",
    body: "Your competitor is gaining reviews faster than you are. The gap was 50 three months ago. Now it is 120. At this rate, you lose the local pack position in six months. The fix is not \"get more reviews\" -- it is understanding exactly how many you need per month to close the gap and engineering the ask into your workflow.",
  },
  {
    title: "New market entrant you have not seen yet",
    body: "A new practice, a DSO expansion, or a clear aligner startup opened within your market radius. They are advertising aggressively. Your referral sources are being contacted. You will find out in 90 days when the revenue shifts -- or you can find out now.",
  },
];

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How do I get more orthodontic referrals?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The most effective way to grow orthodontic referrals is not outbound marketing -- it is protecting and expanding the referring relationships you already have. Monitor referral velocity from each GP and pediatric dentist individually. A practice that sees a 30% drop from a single referrer within 60 days and responds with targeted outreach retains that relationship far more often than one that waits until the cases stop entirely. Growth comes from retention first, then expansion.",
      },
    },
    {
      "@type": "Question",
      name: "Why are my orthodontic referrals declining?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Orthodontic referral declines typically stem from one of three causes: a referring doctor has found a closer or more responsive specialist, a new competitor has entered your market and is actively building GP relationships, or the referring doctor's patient demographics have shifted. The common thread is that the change happened 60 to 90 days before it showed up in your revenue. Practices that monitor referral velocity per doctor catch these shifts early enough to respond.",
      },
    },
    {
      "@type": "Question",
      name: "How do orthodontists compete with DSOs?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "DSOs compete on volume: more locations, more marketing spend, more Google reviews. Solo and small-group orthodontists compete on intelligence: knowing exactly which GPs are drifting, which competitors are gaining ground, and what the one highest-leverage move is this week. You cannot outspend a DSO. You can out-know them -- if you have the right intelligence layer reading your market for you.",
      },
    },
    {
      "@type": "Question",
      name: "What is the best marketing strategy for orthodontists in 2026?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The highest-ROI orthodontic marketing strategy combines two things: referral intelligence (monitoring and protecting your GP relationships before they drift) and competitive visibility (closing the Google review gap and maintaining local search presence). Most orthodontic marketing focuses only on ads and social media. The practices that grow fastest focus on the two assets that compound: trusted referral relationships and accumulated public social proof.",
      },
    },
  ],
};

export default function OrthodontistMarketing() {
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
            Why Orthodontists Lose GP Referrals (And How to See It Coming)
          </h1>

          {/* Dual Threat */}
          <p className="text-base sm:text-lg text-gray-700 leading-relaxed text-center mt-6 max-w-xl mx-auto">
            {DUAL_THREAT}
          </p>

          {/* Three ICP Scenarios */}
          <div className="mt-12 space-y-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 text-center">
              Three orthodontists who needed to see this sooner
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
              Three signals to watch
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

          {/* CTA */}
          <div className="mt-12 text-center">
            <button
              onClick={() => navigate("/checkup")}
              className="inline-flex items-center gap-2 rounded-xl bg-[#D56753] px-8 py-4 text-base font-semibold text-white shadow-[0_4px_14px_rgba(213,103,83,0.35)] hover:shadow-[0_6px_20px_rgba(213,103,83,0.45)] hover:brightness-105 active:scale-[0.98] transition-all"
            >
              See which of your GPs is drifting right now
              <ArrowRight className="h-5 w-5" />
            </button>
            <p className="text-xs text-gray-400 mt-3">
              Free referral checkup. No login required. 60 seconds.
            </p>
          </div>
        </main>

        <footer className="py-8 text-center border-t border-slate-100">
          <p className="text-[11px] font-medium tracking-wide text-slate-300 uppercase">
            Alloro &middot; Referral Intelligence for Orthodontists
          </p>
        </footer>
      </div>
    </>
  );
}
