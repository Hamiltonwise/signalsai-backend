// T1 adds /terms and /privacy to App.tsx
// T1 adds footer links in Home.tsx and Pricing.tsx
/**
 * Terms of Service -- /terms
 *
 * Placeholder legal page. No auth. Mobile-first.
 * Attorney finalizes full content before production launch.
 */

import { useNavigate } from "react-router-dom";

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
          <span className="text-[22px] font-bold tracking-tight text-[#212D40]">
            alloro
          </span>
        </button>
      </header>

      <main className="mx-auto max-w-2xl px-5 pb-16">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#212D40] tracking-tight text-center mt-8">
          Terms of Service
        </h1>

        <p className="text-sm text-gray-400 text-center mt-3">
          Last updated: March 24, 2026
        </p>

        <div className="mt-10 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-700 leading-relaxed">
            These Terms of Service govern your use of Alloro's business
            intelligence platform. By creating an account, you agree to these
            terms. Full terms are being finalized and will be published here
            shortly.
          </p>
          <p className="text-sm text-gray-700 leading-relaxed mt-4">
            Questions? Email{" "}
            <a
              href="mailto:legal@getalloro.com"
              className="text-[#D56753] underline underline-offset-2"
            >
              legal@getalloro.com
            </a>
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
