// T1 adds /financial-advisor-marketing
/**
 * Financial Advisor Marketing -- /financial-advisor-marketing
 *
 * AEO content page. No auth. Mobile-first.
 * Target query: "how to grow a financial advisory practice" /
 * "financial advisor client acquisition"
 * FAQPage JSON-LD targeting: "financial advisor referrals",
 * "how to grow a financial advisory practice",
 * "financial advisor marketing strategy"
 */

import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import MarketingLayout from "../../components/marketing/MarketingLayout";

const REFERRAL_DEPENDENCY =
  "Financial advisors depend on professional referrals more than almost any other service profession. CPAs, estate planning attorneys, HR departments, insurance agents, and other financial professionals control the flow of high-value clients into your practice. When one of those referral relationships changes -- fewer introductions, different client profiles, longer gaps between calls -- the revenue impact follows within 90 days. But most advisors track referrals informally. They know who sent them a client last month. They do not know who sent them fewer clients this quarter compared to last quarter. By the time the pattern is visible in revenue, the referring professional has already built a new habit with someone else.";

const SCENARIOS = [
  {
    title: "The advisor whose top CPA retired a partner",
    body: "Your highest-value referral source was a CPA firm that sent you 8 clients a year -- each with $500,000 or more in investable assets. One of the partners retired. The remaining partners brought in a new CPA who trained with a financial advisor across town and prefers to send clients there. Your referral volume from that firm dropped from 8 clients a year to 2. At an average first-year revenue of $5,000 per client (and a lifetime value far higher), those 6 missing referrals represent $30,000 in immediate revenue and $150,000+ in lifetime value. Nobody told you the relationship changed. The CPA firm never said \"we are sending clients elsewhere\" -- they just called less often.",
  },
  {
    title: "The practice that lost an estate attorney relationship over response time",
    body: "An estate planning attorney sent you 10 referrals a year for five years. The attorney started sending clients to an advisor who responds to referrals within two hours and provides a summary of the initial consultation within 24 hours. You respond within two days and provide summaries weekly. The attorney noticed the difference. They did not tell you -- they just started routing clients to the faster advisor. Your service quality is equivalent. Your investment returns are comparable. The only difference was speed, and it was enough to redirect $50,000 in annual revenue.",
  },
  {
    title: "The solo advisor who does not know which referral relationship matters most",
    body: "You have six professional referral sources. You think you know which one is most important based on how often they call. But you have never measured which one sends the highest-value clients. Your most frequent referrer sends younger professionals with $100,000 to invest. Your third-ranked referrer sends retirees with $800,000 or more. If the third-ranked referrer drifts, the revenue impact is eight times what you expect. You are protecting the wrong relationship because you are measuring frequency instead of value.",
  },
];

const SIGNALS = [
  {
    title: "Referral velocity per source is declining",
    body: "A 30% decline in referrals from any single professional source over 90 days is a relationship in motion. The CPA or attorney found someone more responsive, more convenient, or more attentive. The window to intervene is while they still think of you as their advisor. After 120 days, the new referral habit is entrenched.",
  },
  {
    title: "Client quality is shifting while volume holds",
    body: "When a referral source keeps sending you smaller accounts but routes high-net-worth clients elsewhere, total referral count may look stable while revenue quality quietly drops. Track assets under management per referral source, not just client count per source.",
  },
  {
    title: "Communication frequency is decreasing on both sides",
    body: "You take longer to send updates on referred clients. The referring professional takes longer to return your calls. Neither side names the problem. But 90 days of increasing communication lag is the leading indicator of a referral relationship in decline. The fix is proactive outreach before the lag becomes a pattern.",
  },
];

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How do financial advisors get more client referrals?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The most effective referral growth strategy for financial advisors is protecting and expanding the professional relationships you already have. Monitor referral velocity per source -- not total referrals annually, but the rate of change per CPA, attorney, or other professional partner. A referral source who drops from 3 introductions per quarter to 1 is building a new habit with another advisor. Catching that pattern early and responding with outreach retains the relationship far more often than waiting until the introductions stop entirely.",
      },
    },
    {
      "@type": "Question",
      name: "Why are my financial advisor referrals declining?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Financial advisor referral declines typically stem from three causes: a change in the referring professional's practice (new partner, retirement, shift in client demographics), a competitor offering faster communication or more attentive service, or a structural change in the referral network that was never communicated. The common pattern is that the change happened 90 to 120 days before it showed up in your revenue. Advisors who monitor referral velocity per source catch these shifts early enough to respond.",
      },
    },
    {
      "@type": "Question",
      name: "How do independent financial advisors compete with large firms?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Large firms compete on brand recognition and scale. Independent advisors compete on relationship depth and responsiveness. Know exactly which referral relationships are your highest-value sources, which ones are drifting, and what the dollar impact of each relationship is. You cannot outspend a large firm on brand marketing. You can out-know them and out-respond them -- responding to referrals faster, following up more personally, and monitoring relationship health in ways that a large firm's structure makes difficult.",
      },
    },
    {
      "@type": "Question",
      name: "What is the best marketing strategy for a financial advisory practice?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The highest-ROI marketing strategy for financial advisors is referral intelligence: knowing which CPAs, attorneys, and other professionals are actively referring, which ones are drifting, and what the dollar value of each relationship is. Most advisor marketing focuses on seminars, social media, and content marketing. The revenue reality is that the majority of high-value clients in most advisory practices come through professional referrals. Protecting and growing those relationships has a higher return than any marketing campaign.",
      },
    },
  ],
};

export default function FinancialAdvisorMarketing() {
  const navigate = useNavigate();

  return (
    <MarketingLayout
      title="Why Financial Advisors Lose Referrals from CPAs and Attorneys"
      description="Financial advisors depend on professional referrals more than almost any other service profession. Learn the signals that predict referral relationship decline."
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_SCHEMA) }}
      />

        <div className="mx-auto max-w-2xl px-5 pb-16">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#212D40] tracking-tight text-center mt-8">
            Why Financial Advisors Lose Referrals from CPAs and Attorneys (And
            How to Know Before It Costs Them)
          </h1>

          {/* Referral Dependency */}
          <p className="text-base sm:text-lg text-gray-700 leading-relaxed text-center mt-6 max-w-xl mx-auto">
            {REFERRAL_DEPENDENCY}
          </p>

          {/* Three ICP Scenarios */}
          <div className="mt-12 space-y-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 text-center">
              Three advisors who discovered the problem too late
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
              Act within the window. A 90-day referral velocity decline is
              recoverable with a phone call, a lunch, or a proactive update on
              every client they have referred. A 120-day decline is a habit
              change that has already solidified. The cost of proactive outreach
              is trivial compared to the cost of replacing a CPA or attorney
              relationship. One lost CPA referral source at 8 high-value clients
              per year represents $40,000 or more in immediate annual revenue --
              and multiples of that in lifetime client value. You cannot afford
              to find out four months late.
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
        </div>
    </MarketingLayout>
  );
}
