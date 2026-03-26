// T1 adds /law-firm-marketing
/**
 * Legal Practice Marketing -- /law-firm-marketing
 *
 * AEO content page. No auth. Mobile-first.
 * Target query: "how to get more clients for law firm" /
 * "law firm client acquisition"
 * FAQPage JSON-LD targeting: "law firm marketing",
 * "how to grow a law firm", "attorney client acquisition"
 */

import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import MarketingLayout from "../../components/marketing/MarketingLayout";

const TWO_CHANNEL =
  "Law firms compete on two channels simultaneously. Channel one is professional referrals -- other attorneys, financial advisors, CPAs, judges, and past clients who send business your way. Channel two is direct consumer visibility -- potential clients searching Google for \"family lawyer near me\" or \"estate planning attorney [city]\" and choosing based on reviews, reputation, and what they find online. Losing ground on either channel costs you clients. The problem is that most attorneys track neither. Referrals arrive informally and are never measured. Google visibility is assumed, not monitored. The competitive landscape changes in ways that are invisible until revenue shifts -- and by then, the damage is done.";

const SCENARIOS = [
  {
    title: "The family law attorney who does not know a new firm opened in the same building",
    body: "A new family law practice opened two floors above yours. They launched with a modern website, a $3,000/month Google Ads budget, and an aggressive review generation strategy. In six months, they accumulated 140 Google reviews. You have 38, built over a decade of excellent representation. When someone searches \"family lawyer near me,\" they see the new firm first. Your case outcomes are better. Your experience is deeper. But Google does not rank on decades of courtroom success -- it ranks on the volume of people who said something publicly. The new firm is capturing every potential client who searches before calling.",
  },
  {
    title: "The estate planning attorney whose top referral source shifted quietly",
    body: "Your highest-volume referral source was a financial advisor who sent you 12 clients a year for seven years. Over the last six months, that dropped to two. The financial advisor started recommending a firm that is closer to their office, responds to referrals within an hour, and sends a handwritten thank-you note after each one. Nobody told you the relationship changed. Nobody had to. The financial advisor never said \"I'm sending clients elsewhere\" -- they just stopped calling. At an average case value of $5,500, those 10 missing referrals represent $55,000 in annual revenue you will not recover.",
  },
  {
    title: "The solo practitioner competing against a firm with 8 partners",
    body: "You are a solo attorney with 22 Google reviews. The firm down the street has eight partners, each of whom generates reviews independently. Their collective count is 310. When a potential client compares options on Google, the review gap alone determines who gets the consultation call. Your per-client satisfaction is higher. Your attention to detail is better. But the potential client does not know that -- they know the numbers they see on a screen. At your current review velocity of 1 per month versus their 8 per month, the gap grows by 84 reviews per year. In three years, you are not a competitor in search. You are invisible.",
  },
];

const SIGNALS = [
  {
    title: "Professional referral volume is declining per source",
    body: "A 30% decline in referrals from any single source over 60 days is a relationship in motion. The referring professional found someone more responsive, more convenient, or more attentive. The window to re-engage is before the new referral habit solidifies -- typically 60 to 90 days. After that, the habit is set.",
  },
  {
    title: "Review gap is widening against local competitors",
    body: "If a competing firm is gaining reviews faster than you, the gap compounds monthly. A firm adding 8 reviews per month while you add 1 means the gap grows by 84 reviews per year. Track the velocity, not just the count. The velocity tells you whether you are converging toward visibility or diverging from it.",
  },
  {
    title: "New market entrant is advertising aggressively",
    body: "A new firm opened in your market and is running paid search ads, building a Google presence, and actively soliciting reviews. Their first 90 days of marketing spend will determine whether they capture your market share permanently. You need to know they exist before their strategy is fully deployed -- not after your consultation calls have already declined.",
  },
];

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How do law firms get more clients?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The most effective client acquisition strategy for law firms addresses two channels: professional referrals (monitoring which attorneys, CPAs, and financial advisors are sending clients and which ones have slowed) and direct consumer visibility (closing the Google review gap against competing firms in your market). Most law firm marketing focuses only on ads and networking events. The firms that grow fastest focus on the two assets that compound: trusted referral relationships and accumulated public social proof.",
      },
    },
    {
      "@type": "Question",
      name: "Why is my law firm not getting referrals?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Law firm referral declines typically stem from one of three causes: a referring professional found someone more responsive or more convenient, a new competitor entered the market and is actively building professional relationships, or the referring professional's practice shifted in ways that changed their referral patterns. The common thread is that the change happened months before it showed up in your revenue. Firms that monitor referral velocity per source catch these shifts early enough to respond.",
      },
    },
    {
      "@type": "Question",
      name: "How do solo attorneys compete with large law firms?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Large firms compete on volume: more partners, more marketing spend, more Google reviews. Solo attorneys compete on intelligence and responsiveness. Know your exact review gap, know which referral relationships are active versus drifting, and know whether a new competitor has entered your market. You cannot outspend a large firm. You can out-know them and out-respond them -- if you have the intelligence layer that reads your competitive landscape in real time.",
      },
    },
    {
      "@type": "Question",
      name: "What is the best marketing strategy for a law firm in 2026?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The highest-ROI law firm marketing strategy combines referral intelligence (monitoring and protecting professional referral relationships before they drift) and competitive visibility (closing the Google review gap and maintaining local search presence). Most law firm marketing focuses on networking events and paid ads. The firms that grow fastest focus on the two assets that compound over time: referral relationships and public trust signals.",
      },
    },
  ],
};

export default function LegalPracticeMarketing() {
  const navigate = useNavigate();

  return (
    <MarketingLayout
      title="How Law Firms Lose Clients to Competitors"
      description="Law firms compete on two channels: professional referrals and direct consumer visibility. Learn the signals that predict client loss before it shows up in revenue."
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_SCHEMA) }}
      />

        <div className="mx-auto max-w-2xl px-5 pb-16">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#212D40] tracking-tight text-center mt-8">
            How Law Firms Lose Clients to Competitors (And How to See It Before
            It Happens)
          </h1>

          {/* Two-Channel Problem */}
          <p className="text-base sm:text-lg text-gray-700 leading-relaxed text-center mt-6 max-w-xl mx-auto">
            {TWO_CHANNEL}
          </p>

          {/* Three ICP Scenarios */}
          <div className="mt-12 space-y-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 text-center">
              Three attorneys who needed to see this sooner
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

          {/* What To Do */}
          <div className="mt-12">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 text-center mb-4">
              What to do when you see the signal
            </h2>
            <p className="text-base text-gray-700 leading-relaxed text-center">
              Measure both channels. Know your review gap number and whether it
              is growing. Know which referral sources are active and which have
              gone quiet. The cost of that intelligence is trivial compared to
              the cost of discovering the problem six months late. One lost
              referral source at 12 clients per year at $5,500 per case is
              $66,000 in annual revenue. One widening review gap is every
              potential client who chose the competitor instead of you. The math
              is not abstract -- it is your practice.
            </p>
          </div>

          {/* CTA */}
          <div className="mt-12 text-center">
            <button
              onClick={() => navigate("/checkup")}
              className="inline-flex items-center gap-2 rounded-xl bg-[#D56753] px-8 py-4 text-base font-semibold text-white shadow-[0_4px_14px_rgba(213,103,83,0.35)] hover:shadow-[0_6px_20px_rgba(213,103,83,0.45)] hover:brightness-105 active:scale-[0.98] transition-all"
            >
              See where your firm stands right now
              <ArrowRight className="h-5 w-5" />
            </button>
            <p className="text-xs text-gray-400 mt-3">
              Free checkup. No login required. 60 seconds.
            </p>
          </div>
        </div>
    </MarketingLayout>
  );
}
