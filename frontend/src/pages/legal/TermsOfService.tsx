/**
 * Terms of Service -- /terms
 *
 * Plain English, card-based format matching the privacy policy.
 * Attorney must review before production launch.
 */

import { useNavigate, Link } from "react-router-dom";

export default function TermsOfService() {
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
          <span className="text-[22px] font-semibold tracking-tight text-[#1A1D23]">
            alloro
          </span>
        </button>
      </header>

      <main className="mx-auto max-w-2xl px-5 pb-16">
        <h1 className="text-3xl sm:text-4xl font-semibold text-[#1A1D23] tracking-tight text-center mt-8">
          Terms of Service
        </h1>

        <p className="text-sm text-gray-400 text-center mt-3">
          Last updated: March 29, 2026
        </p>

        <div className="mt-10 space-y-5">

          <Section title="What Alloro is">
            <p>
              Alloro is a business intelligence platform that analyzes publicly available data
              and data you provide to generate competitive insights, market position reports,
              and actionable recommendations for your business.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              Alloro is not medical, legal, or financial advice. Rankings and scores are estimates
              based on public data, not guarantees of business outcomes. Decisions you make based
              on Alloro's intelligence are your responsibility.
            </p>
          </Section>

          <Section title="Your account">
            <ul className="space-y-1.5">
              <Li>One account per organization. You must be 18+ and authorized to act for the business.</Li>
              <Li>You are responsible for your password and account security.</Li>
              <Li>Information you provide must be accurate. We use it to generate your intelligence.</Li>
              <Li>You can close your account at any time from Settings.</Li>
            </ul>
          </Section>

          <Section title="Billing, pause, and cancellation">
            <ul className="space-y-1.5">
              <Li><strong>Free tier:</strong> The Google Health Check is free. No account required. No credit card.</Li>
              <Li><strong>When billing starts:</strong> After you experience first value, not at signup. We don't charge until you've seen something useful.</Li>
              <Li><strong>Pricing:</strong> $2,000/month. No contracts. No annual commitment required.</Li>
              <Li><strong>Pause:</strong> You can pause your subscription for up to 3 months. Your data stays. Resume anytime.</Li>
              <Li><strong>Cancel:</strong> Cancel anytime from Settings. Your data is preserved for 90 days, then deleted.</Li>
              <Li><strong>Refunds:</strong> No refunds for partial months. If you cancel mid-cycle, you retain access until the end of the billing period.</Li>
              <Li><strong>Payment:</strong> Processed by Stripe. We never see or store your card number.</Li>
            </ul>
          </Section>

          <Section title="Heroes and Founders pricing">
            <ul className="space-y-1.5">
              <Li>Veterans, active duty spouses, first responders, and Gold Star family members: Alloro is free. Forever. Not discounted.</Li>
              <Li>First-year business owners: $400/month. Everything included.</Li>
              <Li>Eligibility verified during onboarding. We trust you to be honest.</Li>
            </ul>
          </Section>

          <Section title="Your data">
            <ul className="space-y-1.5">
              <Li><strong>You own your data.</strong> Everything you put into Alloro, you can take out. Rankings, referrals, reports. One click, standard formats.</Li>
              <Li><strong>License:</strong> You grant Alloro a limited license to process your data for the purpose of delivering the service. This license ends when you delete your account.</Li>
              <Li><strong>Derived insights:</strong> Intelligence reports generated for your account belong to you. Anonymized aggregate data (market averages, regional trends) that cannot identify your business belongs to Alloro.</Li>
              <Li><strong>No sale:</strong> We do not sell, rent, or trade your data to anyone.</Li>
            </ul>
            <p className="mt-2 text-xs text-gray-500">
              See our <Link to="/privacy" className="text-[#D56753] underline underline-offset-2">Privacy Policy</Link> for the full detail.
            </p>
          </Section>

          <Section title="What you can and cannot do">
            <p className="text-xs text-gray-500 mb-2">The short version: use Alloro for your business. Don't use it to harm others.</p>
            <ul className="space-y-1.5">
              <Li>You may use Alloro to analyze your own business and make informed decisions.</Li>
              <Li>You may not scrape Alloro to build a competing product.</Li>
              <Li>You may not use the review request feature to send spam or harass anyone.</Li>
              <Li>You may not impersonate another business or create fake accounts.</Li>
              <Li>You may not upload malicious content or attempt to access other users' data.</Li>
            </ul>
          </Section>

          <Section title="Third-party services">
            <ul className="space-y-1.5">
              <Li>Google Business Profile data is subject to Google's Terms of Service.</Li>
              <Li>Payment processing by Stripe is subject to Stripe's terms.</Li>
              <Li>AI analysis is powered by Anthropic's Claude, subject to Anthropic's commercial terms.</Li>
              <Li>Alloro is not responsible for changes to these third-party services.</Li>
            </ul>
          </Section>

          <Section title="Our intellectual property">
            <ul className="space-y-1.5">
              <Li>Alloro owns the platform, algorithms, agent architecture, and brand.</Li>
              <Li>You own your data and the intelligence generated for your account.</Li>
              <Li>You may not copy, modify, or distribute Alloro's software or proprietary methods.</Li>
            </ul>
          </Section>

          <Section title="Limitation of liability">
            <p>
              Alloro is provided "as is." We work hard to make it accurate and reliable,
              but we cannot guarantee uninterrupted service or perfect data.
            </p>
            <ul className="mt-2 space-y-1.5">
              <Li>Our total liability is limited to the fees you paid in the 12 months before a claim.</Li>
              <Li>We are not liable for indirect, consequential, or punitive damages.</Li>
              <Li>Rankings and scores are estimates. Business decisions based on them are your responsibility.</Li>
            </ul>
          </Section>

          <Section title="Referral program">
            <ul className="space-y-1.5">
              <Li>When you refer a colleague and they subscribe, you both split month one (Rise Together).</Li>
              <Li>You may not use automated tools or spam to distribute referral links.</Li>
              <Li>Alloro reserves the right to modify or end the referral program at any time.</Li>
            </ul>
          </Section>

          <Section title="Changes to these terms">
            <p>
              We may update these terms. If the change is material, we will notify you by email
              at least 30 days before it takes effect. Continued use after the change means you accept
              the new terms. If you disagree, you can cancel and export your data.
            </p>
          </Section>

          <Section title="Governing law">
            <p>
              These terms are governed by the laws of the State of Oregon. Disputes will be resolved
              through binding arbitration, with a carve-out for small claims court. Class action waiver applies.
            </p>
          </Section>

          {/* Contact */}
          <div
            className="rounded-2xl px-6 py-5 text-center"
            style={{ backgroundColor: "rgba(213, 103, 83, 0.05)" }}
          >
            <p className="text-sm font-semibold text-[#1A1D23]">
              Questions?
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

          <p className="text-xs text-gray-300 text-center mt-4">
            These terms will be reviewed by legal counsel before Alloro accepts payment.
            <br />
            <Link to="/privacy" className="underline underline-offset-2 hover:text-gray-400">Privacy Policy</Link>
          </p>
        </div>
      </main>

      <footer className="py-8 text-center border-t border-slate-100">
        <p className="text-xs font-medium tracking-wide text-slate-300 uppercase">
          Alloro
        </p>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-[#1A1D23] mb-3">{title}</h2>
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
