/**
 * Pricing Page -- /pricing
 *
 * One plan. No comparison table. No feature grid.
 * This is a conviction page, not a menu.
 */

import { ArrowRight, CheckCircle2 } from "lucide-react";

const INCLUDES = [
  "Your competitive position, updated weekly.",
  "The referring GPs who are drifting -- named, with dollar figures.",
  "A PatientPath website built from your actual patient reviews.",
  "Monday morning email. One finding. One action.",
  "A Business Clarity Checkup you can share with any GP.",
];

export default function Pricing() {
  return (
    <div className="min-h-dvh bg-[#FAFAF8]">
      {/* Header bar */}
      <header className="bg-[#212D40] py-4 px-5">
        <div className="max-w-lg mx-auto flex items-center gap-2">
          <a href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#D56753] flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L14 14H2L8 2Z" fill="white" opacity="0.9" />
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight text-white">
              alloro
            </span>
          </a>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-5 py-16 sm:py-20">
        {/* Plan */}
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-[#D56753] mb-3">
            One plan
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#212D40] tracking-tight">
            Practice Intelligence
          </h1>
          <div className="mt-6">
            <span className="text-5xl sm:text-6xl font-black text-[#212D40]">
              $2,000
            </span>
            <span className="text-lg text-slate-400 ml-2">/ month</span>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Everything. No tiers. No add-ons.
          </p>
        </div>

        {/* What's included */}
        <div className="mt-12 space-y-4">
          {INCLUDES.map((line) => (
            <div key={line} className="flex items-start gap-3">
              <CheckCircle2 className="w-4.5 h-4.5 text-[#D56753] shrink-0 mt-0.5" />
              <p className="text-sm text-[#212D40]/80 leading-relaxed">
                {line}
              </p>
            </div>
          ))}
        </div>

        {/* Guarantee */}
        <div className="mt-12 rounded-2xl border border-gray-200 bg-white p-6">
          <p className="text-sm font-bold text-[#212D40]">
            The guarantee
          </p>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            If Alloro doesn't show you something about your market you
            didn't know in the first 7 days, we'll refund your first
            month. No forms. Just email Corey.
          </p>
          <a
            href="mailto:corey@getalloro.com"
            className="mt-3 inline-block text-xs font-semibold text-[#D56753] hover:underline"
          >
            corey@getalloro.com
          </a>
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <a
            href="/checkup"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-xl bg-[#D56753] text-white text-base font-semibold px-8 py-4 shadow-[0_4px_20px_rgba(213,103,83,0.4)] hover:shadow-[0_6px_28px_rgba(213,103,83,0.5)] hover:brightness-110 active:scale-[0.98] transition-all"
          >
            Start with a free Checkup
            <ArrowRight className="w-4 h-4" />
          </a>
          <p className="mt-4 text-xs text-slate-400 leading-relaxed">
            Most practices see their first finding in 60 seconds.
            <br />
            Monthly, cancel anytime.
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 px-5 py-8">
        <p className="text-center text-[11px] text-slate-300">
          &copy; 2026 Alloro, Inc. Bend, Oregon.
        </p>
      </footer>
    </div>
  );
}

// T1 adds /pricing route to App.tsx
