/**
 * Privacy Policy -- /privacy
 *
 * Basecamp-style: card-based, plain English, comprehensive.
 * Covers GDPR Article 20, CCPA, AI/LLM disclosure.
 * Attorney must review before production launch.
 */

import { useNavigate, Link } from "react-router-dom";

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-dvh bg-[#FAFAF8]">
      <header className="flex items-center justify-center pt-10 pb-6 px-4">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2"
        >
          <div className="w-8 h-8 rounded-lg bg-[#D56753] flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L14 14H2L8 2Z" fill="white" opacity="0.9" />
            </svg>
          </div>
          <span className="text-[22px] font-bold tracking-tight text-[#212D40]">
            alloro
          </span>
        </button>
      </header>

      <main className="mx-auto max-w-2xl px-5 pb-16">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#212D40] tracking-tight text-center mt-8">
          Privacy Policy
        </h1>

        <p className="text-sm text-gray-400 text-center mt-3">
          Last updated: March 29, 2026
        </p>

        {/* The Promise */}
        <div className="mt-10 rounded-2xl bg-[#212D40] p-6 text-center">
          <p className="text-base font-semibold text-white leading-relaxed">
            Your data stays yours. We make money from subscriptions, not from selling data.
          </p>
          <p className="text-sm text-white/50 mt-2">
            Everything below is the detail behind that promise.
          </p>
        </div>

        <div className="mt-6 space-y-5">

          {/* 1. What We Collect */}
          <Section title="What we collect">
            <p>When you use Alloro, we collect:</p>
            <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
              <Li>Your business name, email, and location (you provide these)</Li>
              <Li>Google Business Profile data: reviews, ratings, hours, photos, categories (publicly available)</Li>
              <Li>Competitor data: same public fields for businesses in your market</Li>
              <Li>If you connect your practice management system: scheduling and referral data for intelligence extraction</Li>
              <Li>Usage data: which features you use, how often you log in, actions you take (for product improvement)</Li>
              <Li>Payment information is handled by Stripe. We never see or store your card number.</Li>
            </ul>
          </Section>

          {/* 2. How We Use It */}
          <Section title="How we use it">
            <p>Your data serves one purpose: giving you clarity about your business.</p>
            <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
              <Li>Generate your Business Clarity Score and competitive analysis</Li>
              <Li>Build your Monday morning intelligence briefing</Li>
              <Li>Monitor your market position and alert you to changes</Li>
              <Li>Build and optimize your website (PatientPath)</Li>
              <Li>Improve the product based on usage patterns (never using individual business data for this)</Li>
            </ul>
            <p className="mt-3 font-medium text-[#212D40]">
              Your data is never sold. Never shared with competitors. Never used for advertising.
            </p>
          </Section>

          {/* 3. How AI Works in Alloro */}
          <Section title="How AI works in Alloro">
            <p>
              Alloro uses Anthropic's Claude to analyze your competitive data, generate insights,
              and write your intelligence briefings. Here is exactly what that means:
            </p>
            <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
              <Li><strong>What the AI sees:</strong> Your business name, review text, competitor data, market position. Never patient names, health records, or personal information.</Li>
              <Li><strong>What the AI does NOT do:</strong> Anthropic does not use your data to train their models. Your competitive intelligence is processed and returned to you. It is not stored by Anthropic or used to improve their general-purpose AI.</Li>
              <Li><strong>Aggregate patterns:</strong> We analyze patterns across all Alloro accounts to detect market trends (like regional ranking pressure). These patterns never include your business name and no individual account's data is visible to others.</Li>
            </ul>
          </Section>

          {/* 4. Who Else Touches Your Data */}
          <Section title="Who else touches your data">
            <p>We use a small number of services to run Alloro. Here is every one of them:</p>
            <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
              <Li><strong>Anthropic (Claude)</strong> -- AI analysis of your competitive data</Li>
              <Li><strong>Stripe</strong> -- Payment processing. They handle your card. We never see it.</Li>
              <Li><strong>Google Places API</strong> -- Public business data (reviews, ratings, hours)</Li>
              <Li><strong>Email provider</strong> -- Sends your Monday briefings and notifications</Li>
              <Li><strong>Hosting (AWS)</strong> -- Where your data is stored and processed</Li>
            </ul>
            <p className="mt-2 text-xs text-gray-400">
              We do not use advertising networks, analytics trackers, or data brokers.
            </p>
          </Section>

          {/* 5. Your Rights */}
          <Section title="Your rights">
            <p>You can do any of these at any time, from your Settings page:</p>
            <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
              <Li><strong>Export all your data</strong> -- One click. JSON and CSV formats. No support ticket. No waiting.</Li>
              <Li><strong>Delete your account</strong> -- We remove your data within 30 days. Anonymized aggregate statistics remain.</Li>
              <Li><strong>Correct your information</strong> -- Update your business details anytime.</Li>
              <Li><strong>Pause your subscription</strong> -- Up to 3 months. Your data is preserved. Resume anytime.</Li>
              <Li><strong>Object to profiling</strong> -- We use engagement data to improve your experience (not to sell you things). You can request we stop.</Li>
            </ul>
            <p className="mt-2 text-xs text-gray-400">
              These rights apply regardless of where you live. We follow GDPR and CCPA standards for all users.
            </p>
          </Section>

          {/* 6. Healthcare Practices */}
          <Section title="For healthcare practices">
            <p>
              If you connect practice management data that may contain patient information:
            </p>
            <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
              <Li>A Business Associate Agreement (BAA) is required before data upload</Li>
              <Li>Raw scheduling data (including patient-identifiable information) is processed and deleted</Li>
              <Li>We store extracted intelligence (referral velocity, case trends) not patient records</Li>
              <Li>Alloro gives you business clarity without requiring patient data to leave your existing systems</Li>
            </ul>
          </Section>

          {/* 7. Automated Decisions */}
          <Section title="Automated decisions">
            <p>
              Alloro uses automated systems to help us serve you better:
            </p>
            <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
              <Li><strong>Health scoring:</strong> Alloro tracks your engagement to detect if you might not be getting value. If Alloro notices you're not logging in, it sends a check-in, not a sales pitch.</Li>
              <Li><strong>Intelligence prioritization:</strong> Our agents decide which finding is most important for your Monday email. This is based on what changed in your market, not on what we want you to buy.</Li>
            </ul>
            <p className="mt-2">
              You can request a human review of any automated decision by emailing{" "}
              <a href="mailto:corey@getalloro.com" className="text-[#D56753] underline underline-offset-2">corey@getalloro.com</a>.
            </p>
          </Section>

          {/* 8. If You Leave */}
          <Section title="If you leave">
            <ul className="space-y-1.5 text-sm text-gray-700">
              <Li>You can export all your data before cancelling (Settings &gt; Your Data)</Li>
              <Li>After cancellation, your data is preserved for 90 days in case you return</Li>
              <Li>After 90 days, identifiable data is deleted</Li>
              <Li>Anonymized aggregate data (market averages, regional trends) is retained</Li>
              <Li>We will not email you after cancellation unless you opt into our win-back sequence</Li>
            </ul>
          </Section>

          {/* 9. Do Not Sell */}
          <Section title="We do not sell your data">
            <p>
              Under the California Consumer Privacy Act (CCPA), you have the right to opt out of
              the "sale" or "sharing" of your personal information. Alloro does not sell or share
              your personal information with third parties for advertising or marketing purposes. Period.
            </p>
            <p className="mt-2">
              If you have questions about this, email{" "}
              <a href="mailto:legal@getalloro.com" className="text-[#D56753] underline underline-offset-2">legal@getalloro.com</a>.
            </p>
          </Section>

          {/* 10. Contact */}
          <div
            className="rounded-2xl px-6 py-5 text-center"
            style={{ backgroundColor: "rgba(213, 103, 83, 0.05)" }}
          >
            <p className="text-sm font-semibold text-[#212D40]">
              Questions about your data?
            </p>
            <p className="text-sm text-gray-600 mt-1">
              Email{" "}
              <a href="mailto:corey@getalloro.com" className="text-[#D56753] underline underline-offset-2">corey@getalloro.com</a>
              {" "}or{" "}
              <a href="mailto:legal@getalloro.com" className="text-[#D56753] underline underline-offset-2">legal@getalloro.com</a>
            </p>
            <p className="text-xs text-gray-400 mt-3">
              Corey Wise, Founder. Bend, Oregon.
            </p>
          </div>

          <p className="text-[11px] text-gray-300 text-center mt-4">
            This policy will be reviewed by legal counsel before Alloro accepts payment.
            <br />
            <Link to="/terms" className="underline underline-offset-2 hover:text-gray-400">Terms of Service</Link>
          </p>
        </div>
      </main>

      <footer className="py-8 text-center border-t border-slate-100">
        <p className="text-[11px] font-medium tracking-wide text-slate-300 uppercase">
          Alloro &middot; Business Clarity
        </p>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-[#212D40] mb-3">{title}</h2>
      <div className="text-sm text-gray-700 leading-relaxed">{children}</div>
    </div>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-[#D56753]/40" />
      <span>{children}</span>
    </li>
  );
}
