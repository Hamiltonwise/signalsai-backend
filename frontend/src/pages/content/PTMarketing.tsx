// T1 adds /physical-therapist-marketing
/**
 * Physical Therapist Marketing -- /physical-therapist-marketing
 *
 * AEO content page. No auth. Mobile-first.
 * Target query: "how to get more physical therapy referrals" /
 * "physical therapy practice growth"
 * FAQPage JSON-LD targeting: "PT referrals", "physical therapy marketing",
 * "how to grow a physical therapy practice"
 */

import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const MD_DEPENDENCY =
  "Physical therapy practices depend on physician referrals more heavily than almost any other licensed specialty. Orthopedic surgeons, primary care physicians, sports medicine doctors, and pain management specialists control the flow of patients into your clinic. When a referring physician's behavior changes -- fewer referrals, different case types, longer gaps between calls -- the revenue impact follows within 60 to 90 days. The problem is that most PT practices track referral totals quarterly, not referral velocity per physician monthly. By the time the quarterly number looks wrong, the referring relationship has already moved.";

const SCENARIOS = [
  {
    title: "The PT clinic whose top orthopedic surgeon retired a partner",
    body: "Your highest-volume referral source was an orthopedic surgery group that sent 25 post-surgical patients per month. One of the partners retired. The remaining partners brought in a new surgeon who trained with a PT down the road and prefers to send cases there. Your referral volume from that group dropped from 25 to 14 over three months. You noticed the schedule felt lighter but attributed it to seasonality. It was not seasonality. It was a structural change in the referral relationship that nobody communicated to you. At an average case value of $1,200, that is $13,200 per month in lost revenue -- $158,400 per year.",
  },
  {
    title: "The practice losing post-surgical cases to a competitor with better turnaround",
    body: "A competing PT clinic started sending progress reports to referring physicians within 24 hours of each visit. You send yours weekly. The physicians noticed. They did not tell you they noticed -- they just started sending more post-surgical cases to the practice that communicates faster. Your referral volume from three different surgeons declined 30% over 60 days. The clinical quality difference between you and the competitor is negligible. The communication speed difference is not.",
  },
  {
    title: "The solo PT who does not know the real referral landscape",
    body: "You have five referring physicians. You think you know who they are. But you have never measured which one sends the most revenue (not the most patients -- the most revenue, which accounts for case complexity and duration). Your top referrer by patient count sends routine cases worth $800 each. Your third-ranked referrer sends post-surgical spinal cases worth $3,200 each. If the third-ranked referrer drifts, the revenue impact is four times what you expect. You are protecting the wrong relationship because you are measuring the wrong metric.",
  },
];

const SIGNALS = [
  {
    title: "Referral velocity per physician is declining",
    body: "A 30% decline in monthly referral volume from any single physician over 60 days is not noise. It is a decision that has already been made -- the physician found someone closer, faster, or more communicative. The window to intervene is while they still think of you as their PT. After 90 days, the new habit is set.",
  },
  {
    title: "Case mix is shifting toward lower-value procedures",
    body: "When a referring physician keeps sending you routine cases but routes complex post-surgical patients elsewhere, total referral count may look stable while revenue quietly drops. Track revenue per referrer, not just patient count per referrer.",
  },
  {
    title: "Communication lag is increasing on both sides",
    body: "You take longer to send progress reports. The physician's office takes longer to return your calls. Neither side names the problem. But 60 days of increasing communication lag is the leading indicator of a referral relationship in decline.",
  },
];

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How do physical therapists get more physician referrals?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The most effective referral growth strategy for physical therapists is protecting and expanding the physician relationships you already have. Monitor referral velocity per physician monthly -- not total referrals quarterly. A physician who drops from 10 referrals per month to 4 over 60 days is actively building a new referral habit. Catching that pattern early and responding with outreach (a call, a lunch, faster progress reports) retains the relationship far more often than waiting until the referrals stop entirely.",
      },
    },
    {
      "@type": "Question",
      name: "Why are my physical therapy referrals declining?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "PT referral declines typically stem from three causes: a change in the referring physician's practice (new partner, retirement, shift in patient demographics), a competitor offering faster communication or more convenient scheduling, or a structural change in the referral network that nobody communicated to you. The common pattern is that the change happened 60 to 90 days before it showed up in your revenue. Practices that monitor referral velocity per physician catch these shifts early enough to respond.",
      },
    },
    {
      "@type": "Question",
      name: "How do PT practices compete for physician referrals?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The practices that win the most physician referrals are not the ones with the most marketing. They are the ones with the fastest communication (progress reports within 24 hours, not weekly), the most proactive relationship management (reaching out before the physician goes quiet), and the clearest intelligence about which relationships are strong, which are drifting, and which represent the highest revenue value. Speed and awareness beat advertising every time in referral-dependent specialties.",
      },
    },
    {
      "@type": "Question",
      name: "What is the best marketing strategy for a physical therapy practice?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The highest-ROI marketing strategy for PT practices is referral intelligence: knowing which physicians are actively referring, which ones are drifting, and what the dollar value of each relationship is. Most PT marketing focuses on consumer ads and social media. The revenue reality is that 60 to 80 percent of new patients in a typical PT practice come through physician referrals. Protecting and growing those relationships has a higher return than any ad campaign.",
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
          <h1 className="text-3xl sm:text-4xl font-semibold text-[#212D40] tracking-tight text-center mt-8">
            How Physical Therapy Practices Lose MD Referrals (And How to Know
            Before It Costs Them)
          </h1>

          {/* MD Dependency */}
          <p className="text-base sm:text-lg text-gray-700 leading-relaxed text-center mt-6 max-w-xl mx-auto">
            {MD_DEPENDENCY}
          </p>

          {/* Three ICP Scenarios */}
          <div className="mt-12 space-y-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 text-center">
              Three PT practices that discovered the problem too late
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
              Three signals that a referral relationship is moving
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
              Act within the window. A 60-day referral velocity decline is
              recoverable with a phone call, a faster report cadence, or a
              face-to-face visit. A 90-day decline is a habit change that has
              already solidified. The cost of proactive outreach is trivial
              compared to the cost of replacing a referring physician. One lost
              orthopedic surgeon at 15 post-surgical cases per month represents
              $18,000 to $48,000 in monthly revenue depending on case
              complexity. You cannot afford to find out three months late.
            </p>
          </div>

          {/* CTA */}
          <div className="mt-12 text-center">
            <button
              onClick={() => navigate("/checkup")}
              className="inline-flex items-center gap-2 rounded-xl bg-[#D56753] px-8 py-4 text-base font-semibold text-white shadow-[0_4px_14px_rgba(213,103,83,0.35)] hover:shadow-[0_6px_20px_rgba(213,103,83,0.45)] hover:brightness-105 active:scale-[0.98] transition-all"
            >
              See your referral intelligence
              <ArrowRight className="h-5 w-5" />
            </button>
            <p className="text-xs text-gray-400 mt-3">
              Free checkup. See your score instantly. 60 seconds.
            </p>
          </div>
        </main>

        <footer className="py-8 text-center border-t border-slate-100">
          <p className="text-xs font-medium tracking-wide text-slate-300 uppercase">
            Alloro &middot; Business Clarity for Physical Therapy
          </p>
        </footer>
      </div>
    </>
  );
}
