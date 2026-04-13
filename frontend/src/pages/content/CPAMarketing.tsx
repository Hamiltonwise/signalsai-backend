// T1 adds /cpa-marketing route
/**
 * CPA Marketing -- /cpa-marketing
 *
 * AEO content page. No auth. Mobile-first.
 * Target query: "how to get more accounting clients" /
 * "CPA firm client acquisition"
 * FAQPage JSON-LD targeting: "CPA firm marketing",
 * "how to grow an accounting practice", "CPA client acquisition"
 */

import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const SEASONAL_VULNERABILITY =
  "CPA firms face a competitive dynamic that most professional services do not: seasonal predictability creates predictable vulnerability windows. Tax season drives a surge of new client inquiries every January through April. Competitors know this. The firms that invest in visibility and referral relationships in Q4 -- before tax season begins -- capture the clients who start searching in January. The firms that wait until January to think about growth find that the market has already been claimed. Referral sources (attorneys, financial advisors, HR departments) make their referral decisions in the off-season, not during the rush. If a competing CPA built a stronger relationship with your top referring attorney in September, you will not find out until February -- when the referrals do not come.";

const SCENARIOS = [
  {
    title: "The CPA who lost their top attorney referral source over turnaround time",
    body: "An estate planning attorney sent you 15 clients a year for six years. The attorney started sending clients to a firm that returns work product in 48 hours instead of your 10-day turnaround during busy season. During tax season, your response time increases. During their estate planning season, the competing firm maintains the same speed year-round. The attorney never told you they were shifting, they just stopped calling in September. By January, the habit was set. Multiply those 15 missing clients by your average annual billing to see the revenue impact, then consider the lifetime value on top of that.",
  },
  {
    title: "The firm that does not know a boutique competitor is targeting their niche",
    body: "A boutique CPA firm opened in your market specializing exclusively in medical practices -- your most profitable niche. They launched with a Google Ads campaign targeting \"CPA for doctors\" and a review generation strategy that gave them 85 Google reviews in six months. You have 42 reviews across all practice areas. When a physician searches for an accountant, the specialist firm appears first. Your medical practice clients are not leaving -- yet. But every new physician in the market who needs a CPA is finding the competitor instead of you. In 18 months, your medical practice portfolio will be shrinking through natural attrition while the competitor grows.",
  },
  {
    title: "The solo CPA competing against a regional firm with 12 partners",
    body: "You are a solo practitioner with 28 Google reviews. The regional firm across town has 12 partners, each with their own professional networks and referral sources. Their collective Google review count is 195. Their collective referral network touches every attorney, financial advisor, and HR director in the metro area. You cannot match their reach. But you can match their intelligence -- if you know exactly which of your referral relationships are active, which are drifting, and which competitors are gaining ground in your specific niches. The solo practitioner who knows more about their market than the regional firm knows about theirs has an advantage no headcount can replicate.",
  },
];

const SIGNALS = [
  {
    title: "Off-season referral activity is declining",
    body: "The referrals that matter most come in Q3 and Q4 -- before tax season. An attorney or financial advisor who sends you a client in October is signaling an active relationship. If those off-season referrals decline 30% or more compared to the prior year, the relationship is drifting. The fix happens in summer and fall, not in January.",
  },
  {
    title: "Review gap is widening in your specialty niches",
    body: "If a competitor is gaining Google reviews faster than you -- especially in your most profitable niches (medical, legal, real estate) -- the visibility gap compounds monthly. A niche competitor with 85 reviews to your 42 will capture every new-to-market search in that specialty. Track velocity per niche, not just total firm reviews.",
  },
  {
    title: "New client inquiries are flat despite a growing market",
    body: "If the number of businesses in your market is growing but your new client inquiries are flat, a competitor is capturing the growth. This is the signature pattern of a visibility problem: your existing clients are satisfied, but the new ones are finding someone else first. The cause is almost always competitive -- someone else is showing up in search, in directories, or in referral conversations.",
  },
];

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How do CPA firms get more clients?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The most effective client acquisition strategy for CPA firms addresses two channels: professional referrals (monitoring which attorneys, financial advisors, and HR departments are sending clients and which ones have slowed) and direct consumer visibility (closing the Google review gap against competing firms, especially in your most profitable specialty niches). The firms that grow fastest invest in referral relationship maintenance during the off-season (Q3/Q4) and ensure their online visibility is strong before tax season inquiry volume peaks in January.",
      },
    },
    {
      "@type": "Question",
      name: "Why are my CPA firm referrals declining?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "CPA firm referral declines typically stem from one of three causes: a competitor built a stronger relationship with your referral source during the off-season, a niche-focused competitor entered your market and is capturing specialty referrals, or your turnaround times during busy season damaged a referral relationship that was built on responsiveness. The common pattern is that the change happened in Q3 or Q4 and did not become visible until tax season, when the referrals that should have come did not arrive.",
      },
    },
    {
      "@type": "Question",
      name: "How do solo CPAs compete with large accounting firms?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Large firms compete on headcount and brand recognition. Solo CPAs compete on niche expertise, responsiveness, and intelligence. Know your exact competitive position in your most profitable niches. Know which referral relationships are active versus drifting. Know whether a niche competitor has entered your market. You cannot match a 12-partner firm's reach. You can know more about your specific market than they do -- and act on that knowledge faster than their structure allows.",
      },
    },
    {
      "@type": "Question",
      name: "What is the best marketing strategy for a CPA firm in 2026?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The highest-ROI CPA marketing strategy combines off-season referral relationship maintenance (Q3/Q4 outreach to attorneys, financial advisors, and HR contacts), niche visibility (closing the Google review gap in your most profitable specialty areas), and competitive intelligence (knowing when a new competitor enters your niches or when a referral source shifts). Most CPA marketing focuses on tax season advertising. The firms that grow fastest build their pipeline in the off-season when competitors are not paying attention.",
      },
    },
  ],
};

export default function CPAMarketing() {
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
            How CPA Firms Lose Referral Sources (And How to Know Before the
            Revenue Drops)
          </h1>

          {/* Seasonal Vulnerability */}
          <p className="text-base sm:text-lg text-gray-700 leading-relaxed text-center mt-6 max-w-xl mx-auto">
            {SEASONAL_VULNERABILITY}
          </p>

          {/* Three ICP Scenarios */}
          <div className="mt-12 space-y-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 text-center">
              Three CPA firms that discovered the problem too late
            </h2>
            {SCENARIOS.map((scenario, i) => (
              <div
                key={i}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <p className="text-sm font-semibold text-[#1A1D23] mb-2">
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
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 text-center">
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
                <p className="text-sm text-[#1A1D23] leading-relaxed">
                  {signal.body}
                </p>
              </div>
            ))}
          </div>

          {/* What To Do */}
          <div className="mt-12">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 text-center mb-4">
              What to do when you see the signal
            </h2>
            <p className="text-base text-gray-700 leading-relaxed text-center">
              Act in the off-season. The firms that grow are the ones that
              invest in referral relationships and competitive intelligence when
              competitors are coasting between April and December. One lost
              attorney referral source at 15 clients per year, each worth your
              average billing, adds up to substantial annual revenue. One niche
              competitor capturing your specialty market is every new client in
              that vertical choosing them instead of you. The math is not
              abstract, it is your firm's trajectory.
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
              Free checkup. See your readings instantly. 60 seconds.
            </p>
          </div>
        </main>

        <footer className="py-8 text-center border-t border-slate-100">
          <p className="text-xs font-medium tracking-wide text-slate-300 uppercase">
            Alloro &middot; Business Clarity for CPA Firms
          </p>
        </footer>
      </div>
    </>
  );
}
