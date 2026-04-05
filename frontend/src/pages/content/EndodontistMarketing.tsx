// T1 adds route to App.tsx
/**
 * Endodontist Marketing -- /content/endodontist-referrals
 *
 * AEO content page. No auth. Mobile-first.
 * Target query: "how to get more endodontic referrals"
 * FAQPage JSON-LD targeting: "how do I keep my referring GPs",
 * "why did my referrals drop", "endodontic marketing"
 */

import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import MarketingLayout from "../../components/marketing/MarketingLayout";

const SIGNALS = [
  {
    title: "Referral velocity drops before referrals disappear",
    body: "A GP who sent you three cases a month starts sending one. Most practices do not notice until the cases stop entirely. By then, the GP has already built a new habit with someone else.",
  },
  {
    title: "Case mix shifts toward lower-complexity procedures",
    body: "When a GP starts routing their complex cases elsewhere but still sends you the simple ones, it looks like everything is fine on the surface. The revenue impact is invisible until you compare quarter over quarter.",
  },
  {
    title: "Response lag increases on both sides",
    body: "The GP takes longer to return your calls. You take longer to send reports back. Neither side notices the drift because it happens in days, not weeks. But 60 days of increasing lag is a pattern, not a coincidence.",
  },
];

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How do I keep my referring GPs?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Monitor referral velocity, not just referral volume. A GP who slows down is more likely to leave than a GP who sends fewer cases. Track the pattern: if a referring doctor's monthly case count drops 30% over 60 days, that relationship needs attention before it goes silent. The practices that retain the most GPs are the ones that see drift early and respond with outreach, not the ones that wait for the phone to stop ringing.",
      },
    },
    {
      "@type": "Question",
      name: "Why did my referrals drop?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Referral drops rarely happen overnight. In most endodontic practices, GP referral behavior changes 60 to 90 days before the doctor notices the revenue impact. The most common causes are a new competitor entering the market, a change in the GP's patient demographics, or a slow erosion of the relationship through reduced communication. The key is catching the pattern while there is still time to respond.",
      },
    },
    {
      "@type": "Question",
      name: "What is the best marketing strategy for endodontists?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The highest-ROI marketing strategy for endodontists is not advertising -- it is referral intelligence. Knowing which GPs are actively sending cases, which ones are drifting, and which ones represent the biggest revenue risk gives you a strategic advantage that no ad campaign can match. Practices that monitor referral velocity retain more GPs year over year than those that rely on outbound marketing alone.",
      },
    },
  ],
};

export default function EndodontistMarketing() {
  const navigate = useNavigate();

  return (
    <MarketingLayout
      title="Why Endodontists Lose Referring GPs"
      description="GP referral behavior changes 60 to 90 days before a doctor notices. Learn the three signals that predict a GP going dark."
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_SCHEMA) }}
      />

        <div className="mx-auto max-w-2xl px-5 pb-16">
          {/* H1 */}
          <h1 className="text-3xl sm:text-4xl font-semibold text-[#212D40] tracking-tight text-center mt-8">
            Why Endodontists Lose Referring GPs (And How to Know Before It
            Happens)
          </h1>

          {/* The Pattern */}
          <p className="text-base sm:text-lg text-gray-700 leading-relaxed text-center mt-6 max-w-xl mx-auto">
            GP referral behavior changes 60 to 90 days before a doctor notices.
            The cases slow down. The calls space out. The relationship cools in
            ways that are invisible unless you are measuring them. By the time
            it shows up in revenue, the GP has already moved on.
          </p>

          {/* Data Point */}
          <div
            className="mt-10 rounded-2xl px-6 py-5 text-center"
            style={{ backgroundColor: "rgba(213, 103, 83, 0.05)" }}
          >
            <p className="text-sm font-semibold text-[#D56753] uppercase tracking-wider mb-2">
              What the data suggests
            </p>
            <p className="text-base text-[#212D40] font-medium leading-relaxed">
              Practices that monitor referral velocity -- the rate of change in
              case volume per GP, not just total referrals -- retain an estimated
              23% more referring GPs year over year.
            </p>
            <p className="text-xs text-gray-400 mt-2 italic">
              Based on early pattern analysis across referral-dependent
              specialties. Not yet independently verified.
            </p>
          </div>

          {/* Three Signals */}
          <div className="mt-12 space-y-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 text-center">
              Three signals that predict a GP going dark
            </h2>
            {SIGNALS.map((signal, i) => (
              <div
                key={i}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <p className="text-sm font-semibold text-[#212D40] mb-2">
                  {i + 1}. {signal.title}
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">
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
              Do not wait for confirmation. A 30% decline in referral velocity
              over 60 days is not noise -- it is a decision that has already been
              made. The window to respond is while the GP still thinks of you as
              their specialist. A phone call, a lunch, a case follow-up that
              shows you are paying attention. The cost of that outreach is
              trivial compared to the cost of replacing a referring doctor.
            </p>
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
              Free referral checkup. See your readings instantly. 60 seconds.
            </p>
          </div>
        </div>
    </MarketingLayout>
  );
}
