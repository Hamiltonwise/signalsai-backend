// T1 adds /optometrist-marketing
/**
 * Optometrist Marketing -- /optometrist-marketing
 *
 * AEO content page. No auth. Mobile-first.
 * Target query: "how to grow an optometry practice"
 * FAQPage JSON-LD targeting: "optometry practice growth",
 * "how to get more optometry patients", "optometrist marketing"
 */

import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import MarketingLayout from "../../components/marketing/MarketingLayout";

const CONSUMER_PRIMARY =
  "Optometry practices compete primarily on direct consumer visibility. Unlike endodontists or physical therapists who depend on physician referrals for most of their patients, optometrists win or lose based on whether a potential patient finds them when they search. \"Eye doctor near me.\" \"Optometrist [city].\" \"Best eye exam [neighborhood].\" The practice that appears first -- with the most reviews, the highest star rating, and the most credible online presence -- gets the call. Referrals exist (ophthalmologists, pediatricians, primary care), but the primary acquisition channel is search. And search is won on visibility, not clinical quality.";

const SCENARIOS = [
  {
    title: "The optometrist who lost the local pack without knowing it",
    body: "For two years, your practice appeared in the Google Maps local pack -- the three results that show up when someone searches \"optometrist near me.\" Six months ago, a competitor two miles away crossed 200 Google reviews while you stayed at 74. Google's local ranking algorithm shifted them above you. Your phone stopped ringing as often, but you attributed it to the economy, to insurance changes, to seasonality. It was none of those things. It was 126 reviews. That is the gap between being visible and being invisible, and it happened without a single notification.",
  },
  {
    title: "The practice competing against a retail optical chain",
    body: "The retail optical chain down the road does not provide better eye care. Their doctors are fine but not exceptional. What they have is 680 Google reviews, a marketing team, and a presence in every local search result. You have 91 reviews built over eight years of excellent patient care. Your clinical outcomes are better. Your patient relationships are deeper. But the algorithm does not measure the warmth of your bedside manner -- it measures the volume of public trust signals. At 3 reviews per month versus their 25, the gap grows by 264 every year. In two years, you are not a competitor. You are an alternative that nobody finds.",
  },
  {
    title: "The independent OD who does not know which insurance shift changed everything",
    body: "A major vision insurance plan changed their preferred provider network. Three practices in your area were added. You were not notified because you were already in-network -- but the new preferred providers show up first in the plan's online directory. Your in-network patient volume dropped 20% over four months. You thought patients were choosing you for your care. They were choosing you because you were the only in-network option nearby. When that changed, the ones who had no loyalty defaulted to whoever appeared first. You needed to know this in month one, not month four.",
  },
];

const SIGNALS = [
  {
    title: "Your review gap is growing every month",
    body: "The number that determines your visibility is not your review count -- it is the gap between your count and your top competitor's, and whether that gap is growing or shrinking. If your competitor gains 15 reviews per month and you gain 3, the gap grows by 144 per year. Track the velocity, not just the total. The total tells you where you are. The velocity tells you where you will be in 12 months.",
  },
  {
    title: "New patient volume is declining while retention holds",
    body: "This is the signature pattern of a visibility problem. Your existing patients love you and come back. But fewer new patients are finding you. The cause is almost always competitive: someone else is showing up first in search, in insurance directories, or in local recommendations. The fix is not better care -- it is better visibility.",
  },
  {
    title: "A new competitor or network change happened and you do not know about it",
    body: "A new practice opened in your area. A retail chain expanded. An insurance network added preferred providers. Any of these changes can redirect 10 to 30 percent of your new patient flow without a single existing patient leaving. The damage is invisible until it shows up in revenue three to six months later. The practices that adapt are the ones that know about the change in week one, not quarter two.",
  },
];

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How do I grow my optometry practice?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The most effective optometry practice growth strategy starts with understanding your visibility position: how many Google reviews you have versus your top competitor, what your review velocity is relative to theirs, and whether any competitive changes (new practices, network shifts, retail chain expansions) have altered your market. Optometry is a consumer-search-driven specialty. The practices that grow fastest are the ones that close the review gap systematically and know their competitive landscape in real time.",
      },
    },
    {
      "@type": "Question",
      name: "How many Google reviews does an optometry practice need?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The number you need is relative to your top competitor in the same geographic market. If the leading practice or retail optical chain has 400 reviews and you have 90, you need to close that 310-review gap to compete for local search visibility. Divide the gap by 12 for a one-year target, or by 6 for an aggressive six-month plan. The minimum threshold for local pack visibility in most optometry markets is around 50 reviews, but competing for the top position requires matching or exceeding your top local competitor.",
      },
    },
    {
      "@type": "Question",
      name: "How do independent optometrists compete with retail optical chains?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Retail chains compete on scale: more locations, larger marketing budgets, higher review counts per location. Independent optometrists compete on intelligence and patient relationships. Know your exact review gap, your review velocity relative to theirs, and your new patient acquisition trend. You cannot outspend a retail chain. You can build a review generation system that closes the gap over time, and you can ensure your online presence converts the patients who do find you at a higher rate than a chain's generic page.",
      },
    },
    {
      "@type": "Question",
      name: "Why is my optometry practice losing patients?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Most optometry practices that see patient volume decline are not losing existing patients -- they are failing to acquire new ones at the rate they used to. The most common causes are: a competitor crossed a review count threshold that moved them above you in local search, a new practice or retail chain opened in your market, or an insurance network change redirected patient flow. These changes happen months before they show up in revenue. The practices that catch them early are the ones monitoring visibility and competitive position in real time.",
      },
    },
  ],
};

export default function OptometristMarketing() {
  const navigate = useNavigate();

  return (
    <MarketingLayout
      title="Why Optometry Practices Lose Patients to Competitors"
      description="Optometry practices compete primarily on direct consumer visibility. Learn the signals that predict patient loss before it shows up in your schedule."
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_SCHEMA) }}
      />

        <div className="mx-auto max-w-2xl px-5 pb-16">
          <h1 className="text-3xl sm:text-4xl font-semibold text-[#212D40] tracking-tight text-center mt-8">
            Why Optometry Practices Lose Patients to Competitors (Without Ever
            Knowing Why)
          </h1>

          {/* Consumer Primary */}
          <p className="text-base sm:text-lg text-gray-700 leading-relaxed text-center mt-6 max-w-xl mx-auto">
            {CONSUMER_PRIMARY}
          </p>

          {/* Three ICP Scenarios */}
          <div className="mt-12 space-y-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 text-center">
              Three optometrists who needed to see this sooner
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
              Three signals that your visibility is eroding
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
              patient trend, your competitive landscape. These are the leading
              indicators of revenue six months from now. A practice that monitors
              these numbers and acts on them holds its position. A practice that
              waits for the schedule to feel lighter finds out too late. The
              difference between the two is not effort -- it is information.
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
              Free checkup. See your readings instantly. 60 seconds.
            </p>
          </div>
        </div>
    </MarketingLayout>
  );
}
