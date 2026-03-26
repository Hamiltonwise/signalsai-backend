/**
 * AAE Thank You Page -- /thank-you
 *
 * Shown after account creation at AAE.
 * Renders the One Action Card for the new account (healthy-state fallback
 * since no data exists yet) and sets the expectation for Monday's brief.
 */

import { CheckCircle2, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import OneActionCard from "../components/dashboard/OneActionCard";

export default function ThankYou() {
  return (
    <div className="min-h-dvh bg-[#FAFAF8]">
      {/* Header */}
      <header className="bg-[#212D40] text-white py-4 px-5">
        <div className="mx-auto max-w-lg flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#D56753] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L14 14H2L8 2Z" fill="white" opacity="0.9" />
            </svg>
          </div>
          <span className="text-lg font-bold tracking-tight">alloro</span>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-5 py-12 space-y-8">
        {/* Confirmation */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-50 mb-5">
            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#212D40] tracking-tight">
            Your Alloro account is ready.
          </h1>
          <p className="mt-3 text-base text-slate-500 leading-relaxed">
            We'll send you your full Business Clarity report Monday morning.
          </p>
        </div>

        {/* One Action intro */}
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#D56753] mb-3">
            In the meantime
          </p>
          <p className="text-sm text-slate-600 leading-relaxed mb-4">
            Here's the one thing you can do today:
          </p>

          {/* One Action Card -- healthy state fallback for new accounts */}
          <OneActionCard
            billingActive={true}
            gbpConnected={false}
          />
        </div>

        {/* Booth CTA */}
        <div className="rounded-2xl bg-[#212D40] p-6 text-center">
          <p className="text-base font-bold text-white">
            Come find us at booth #835.
          </p>
          <p className="text-sm text-white/60 mt-2 leading-relaxed">
            We'll show you what Monday looks like.
          </p>
        </div>

        {/* Dashboard CTA */}
        <div className="text-center">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl bg-[#D56753] text-white text-base font-semibold px-8 py-4 shadow-[0_4px_20px_rgba(213,103,83,0.4)] hover:brightness-110 active:scale-[0.98] transition-all"
          >
            Go to your dashboard
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-gray-300 uppercase tracking-wide pt-4">
          Business Clarity. Finally.
        </p>
      </div>
    </div>
  );
}

// T1 adds /thank-you route to App.tsx
