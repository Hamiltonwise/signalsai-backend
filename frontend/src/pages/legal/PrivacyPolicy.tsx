// T1 adds /terms and /privacy to App.tsx
// T1 adds footer links in Home.tsx and Pricing.tsx
/**
 * Privacy Policy -- /privacy
 *
 * Placeholder legal page. No auth. Mobile-first.
 * Attorney finalizes full content before production launch.
 */

import { useNavigate } from "react-router-dom";

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
          Last updated: March 24, 2026
        </p>

        <div className="mt-10 space-y-6">
          {/* What We Collect */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-[#212D40] mb-3">
              What we collect
            </h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              When you use Alloro, we collect the information you provide
              directly: your practice name, email address, and business
              location. We also access publicly available data from your Google
              Business Profile (reviews, ratings, business hours) and, if you
              choose to connect your practice management system, scheduling and
              referral data necessary to generate your business intelligence
              reports.
            </p>
          </div>

          {/* How We Use It */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-[#212D40] mb-3">
              How we use it
            </h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              Your data is used exclusively to generate your competitive
              analysis, referral intelligence, and Monday morning briefings. We
              use it to identify your competitors, calculate your market
              position, detect referral drift patterns, and deliver actionable
              recommendations specific to your practice. Your data is never sold
              to third parties. It is never shared with competitors. It is never
              used for advertising. It exists for one purpose: giving you
              clarity about your business.
            </p>
          </div>

          {/* HIPAA Note */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-[#212D40] mb-3">
              A note on patient data (HIPAA)
            </h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              If you connect your practice management system, scheduling data is
              processed to extract referral patterns and business intelligence.
              The raw scheduling data -- including any patient-identifiable
              information -- is processed and deleted. We store the extracted
              intelligence (referral velocity, case volume trends, revenue
              patterns), not patient records. Alloro is designed to give you
              business clarity without requiring you to store patient data
              outside your existing systems.
            </p>
          </div>

          {/* Contact */}
          <div
            className="rounded-2xl px-6 py-5 text-center"
            style={{ backgroundColor: "rgba(213, 103, 83, 0.05)" }}
          >
            <p className="text-sm text-[#212D40] leading-relaxed">
              Full privacy policy is being finalized by our legal team and will
              be published here before production launch. Questions? Email{" "}
              <a
                href="mailto:legal@getalloro.com"
                className="text-[#D56753] underline underline-offset-2"
              >
                legal@getalloro.com
              </a>
            </p>
          </div>
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
