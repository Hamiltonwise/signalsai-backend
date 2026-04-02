// T1 adds /veterinarian-marketing route
/**
 * Veterinarian Marketing -- /veterinarian-marketing
 *
 * AEO content page. No auth. Mobile-first.
 * Target query: "how to grow a veterinary practice" /
 * "veterinary practice marketing"
 * FAQPage JSON-LD targeting: "how to grow a vet practice",
 * "veterinary practice marketing", "vet clinic Google reviews"
 */

import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const REVIEW_PRIMARY =
  "Veterinary practices compete almost entirely on local visibility and reviews. Unlike dental or medical specialties where physician referrals drive a large share of new patients, vet practices live and die by the Google search. When a pet owner searches \"vet near me\" or \"emergency vet [city],\" Google shows the practice with the strongest combination of proximity, review count, and star rating. Referral networks exist -- general practice vets refer to specialists, breeders recommend practices, shelters have preferred providers -- but the primary acquisition channel is the one every pet owner uses: search.";

const SCENARIOS = [
  {
    title: "The vet with 52 reviews competing against a corporate chain with 400",
    body: "You have 52 Google reviews earned over six years of caring for animals. The corporate veterinary chain that opened in your market two years ago has 400 reviews. Their review velocity is 18 per month. Yours is 2. Every pet owner who searches \"vet near me\" sees their review count first. Your patient satisfaction scores are higher. Your clinical outcomes are better. But Google does not measure bedside manner -- it measures the volume of people who said something publicly. At current velocity, the gap grows by 192 reviews per year. In three years, you are not just behind -- you are invisible.",
  },
  {
    title: "The specialty vet who does not know referrals are drifting",
    body: "You are a veterinary oncologist. Your case volume comes primarily from general practice vets who refer complex cases to you. Your top three referring practices sent you 40 cases a month combined for two years. Over the last quarter, that dropped to 28. You did not notice because your schedule still felt full -- existing cases in treatment filled the slots. But those 12 missing monthly referrals represent $18,000 to $30,000 in lost revenue per month. One of the referring vets retired a partner. Another started sending cases to a new specialist who opened closer. The third is still sending -- but only the simple cases. The complex ones go elsewhere now.",
  },
  {
    title: "The small practice watching a new competitor open without being able to quantify the threat",
    body: "A new veterinary practice opened three miles from yours. They have a modern facility, extended hours, and a marketing budget. You know they exist. What you do not know is: how many Google reviews they have already accumulated, what their review velocity is, whether any of your regular clients have visited them, and at what point their presence will start affecting your new client acquisition. Without numbers, the threat is abstract. With numbers, it is either manageable or urgent -- and you can act accordingly.",
  },
];

const SIGNALS = [
  {
    title: "Your review gap is growing, not shrinking",
    body: "The number that matters is not your review count. It is the gap between your count and your top competitor's count, and whether that gap is growing or shrinking. If the gap is growing by 10 or more reviews per month, you are losing the visibility race. Calculate: (competitor velocity minus your velocity) times 12. That is how much bigger the gap will be in one year.",
  },
  {
    title: "New client volume is declining while retention holds",
    body: "This is the signature pattern of a visibility problem. Your existing clients are happy and coming back. But new clients are not finding you at the rate they used to. The cause is almost always competitive: someone else is showing up first in search. The fix is not better care -- it is better visibility.",
  },
  {
    title: "A referring practice has gone quiet",
    body: "For specialty vets, a 30% decline in referral volume from a single referring practice over 60 days is a signal. The referring vet found someone closer, discovered a new specialist, or lost a partner who was your champion. The window to re-engage is before the new referral habit solidifies -- typically 60 to 90 days.",
  },
];

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How do I grow my veterinary practice?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The most effective veterinary practice growth strategy starts with understanding your competitive position: how many Google reviews you have versus your top competitor, what your review velocity is relative to theirs, and whether any new competitors have entered your market. Pet owners choose vets primarily through Google search. The practices that grow fastest are the ones that close the review gap systematically and know their competitive landscape in real time -- not the ones that spend the most on advertising.",
      },
    },
    {
      "@type": "Question",
      name: "How many Google reviews does a veterinary practice need?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The number you need is relative to your top competitor in the same market. If the leading practice in your area has 350 reviews and you have 80, you need to close that 270-review gap to compete for local search visibility. Calculate your monthly target: divide the gap by 12 for a one-year close, or by 6 for an aggressive six-month timeline. The minimum for local pack visibility in most markets is around 40 to 50 reviews, but competing for the top position requires matching or exceeding your top competitor.",
      },
    },
    {
      "@type": "Question",
      name: "How do small vet practices compete with corporate veterinary chains?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Corporate veterinary chains compete on scale: more locations, more marketing spend, more reviews per location. Independent practices compete on intelligence and relationships. Know your exact review gap, your review velocity relative to theirs, and your new client acquisition trend. You cannot outspend a chain. You can out-know them -- and you can build the kind of client loyalty that generates organic reviews at a rate that closes the gap over time.",
      },
    },
    {
      "@type": "Question",
      name: "Why is my vet practice losing clients?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Most veterinary practices that lose clients are not losing existing clients -- they are failing to acquire new ones at the rate they used to. The cause is almost always competitive visibility: a new practice opened nearby, a competitor's review count surpassed yours, or your Google presence fell behind. The pattern is invisible until it shows up in revenue three to six months later. The practices that catch it early are the ones monitoring their competitive position in real time.",
      },
    },
  ],
};

export default function VeterinarianMarketing() {
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
            How Veterinary Practices Lose Clients to Competitors Without Ever
            Knowing It
          </h1>

          {/* Review Primary */}
          <p className="text-base sm:text-lg text-gray-700 leading-relaxed text-center mt-6 max-w-xl mx-auto">
            {REVIEW_PRIMARY}
          </p>

          {/* Three ICP Scenarios */}
          <div className="mt-12 space-y-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 text-center">
              Three veterinary practices that needed to see this sooner
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
              Three signals that tell you the problem is real
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
              The alternative to finding out too late
            </h2>
            <p className="text-base text-gray-700 leading-relaxed text-center">
              Know the number. Your review gap, your review velocity, your new
              client trend, your competitor count. These are not vanity metrics
              -- they are the leading indicators of revenue six months from now.
              The practice that monitors these numbers and acts on them retains
              market position. The practice that waits for the bank statement to
              change finds out too late to respond.
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
          <p className="text-xs font-medium tracking-wide text-slate-300 uppercase">
            Alloro &middot; Business Clarity for Veterinary Practices
          </p>
        </footer>
      </div>
    </>
  );
}
