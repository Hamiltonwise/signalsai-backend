/**
 * Guided Demo Experience -- /demo?guided=true
 *
 * Wraps the existing Demo page with a 4-step coach mark overlay
 * for AAE walk-throughs. Non-guided /demo is unchanged.
 *
 * T1 wires: if ?guided=true, render DemoGuided instead of Demo.
 * Or: DemoGuided can be used standalone at the same route with a param check.
 */

import { useState } from "react";
import { ArrowRight, X, Mail } from "lucide-react";
import Demo from "./Demo";

// ─── Coach Mark Steps ───────────────────────────────────────────────

interface CoachStep {
  title: string;
  body: string;
  position: "top" | "center" | "bottom";
}

const STEPS: CoachStep[] = [
  {
    title: "Your competitive position",
    body: "Mountain View Endodontics ranks #3 in Salt Lake City. There are 2 practices ahead of them. This score updates weekly -- no work required.",
    position: "top",
  },
  {
    title: "The competitor gap",
    body: "Valley Endodontics SLC has 27 more reviews. That's a $3,200/month gap at current referral rates. Alloro tracks this every week and tells you exactly how to close it.",
    position: "top",
  },
  {
    title: "Monday morning",
    body: "This is what the doctor sees every Monday. One finding. One action. Before they start their day. No dashboards to check. No reports to read.",
    position: "center",
  },
  {
    title: "The Monday email",
    body: "",
    position: "center",
  },
];

// ─── Mock Email Preview ─────────────────────────────────────────────

function MockEmailPreview() {
  return (
    <div className="rounded-xl bg-white border border-gray-200 shadow-lg overflow-hidden max-w-sm mx-auto">
      {/* Email header */}
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2 mb-1.5">
          <Mail className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[10px] text-slate-400">Monday 7:00 AM</span>
        </div>
        <p className="text-xs font-bold text-[#212D40]">
          Dr. Mitchell, Valley Endodontics SLC is pulling away.
        </p>
        <p className="text-[10px] text-slate-400 mt-0.5">
          From: Alloro Intelligence
        </p>
      </div>
      {/* Email body */}
      <div className="px-4 py-4 space-y-3">
        <p className="text-xs text-[#212D40]/80 leading-relaxed">
          Good morning. Here's what changed in your market this week:
        </p>
        <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2.5">
          <p className="text-xs font-bold text-red-700">Finding</p>
          <p className="text-xs text-red-600 mt-1 leading-relaxed">
            Valley Endodontics SLC added 6 reviews this week. You added 0.
            The gap is now 27 reviews.
          </p>
        </div>
        <div className="rounded-lg bg-[#D56753]/5 border border-[#D56753]/15 px-3 py-2.5">
          <p className="text-xs font-bold text-[#D56753]">Your one action</p>
          <p className="text-xs text-[#212D40]/70 mt-1 leading-relaxed">
            Send 3 review requests today. Text the link right after their
            visit -- they remember you best in the first hour.
          </p>
        </div>
        <p className="text-[10px] text-slate-300 text-center pt-1">
          Alloro Business Clarity -- Mountain View Endodontics
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export default function DemoGuided() {
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) {
    return <Demo />;
  }

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isEmail = step === 3;

  const positionClass =
    current.position === "top"
      ? "items-start pt-32"
      : current.position === "bottom"
        ? "items-end pb-32"
        : "items-center";

  return (
    <div className="relative">
      {/* Demo underneath */}
      <div className="pointer-events-none select-none" aria-hidden="true">
        <Demo />
      </div>

      {/* Overlay */}
      <div
        className={`fixed inset-0 z-50 bg-[#212D40]/80 backdrop-blur-sm flex justify-center px-5 ${positionClass}`}
      >
        <div className="w-full max-w-md">
          {/* Step indicator */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 rounded-full transition-all ${
                    i === step
                      ? "w-6 bg-[#D56753]"
                      : i < step
                        ? "w-3 bg-white/40"
                        : "w-3 bg-white/15"
                  }`}
                />
              ))}
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="text-white/30 hover:text-white/60 transition-colors"
              aria-label="Skip guided tour"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Card */}
          <div className="rounded-2xl bg-white p-6 shadow-2xl">
            <p className="text-xs font-bold uppercase tracking-widest text-[#D56753] mb-2">
              Step {step + 1} of {STEPS.length}
            </p>
            <h2 className="text-lg font-extrabold text-[#212D40]">
              {current.title}
            </h2>

            {isEmail ? (
              <div className="mt-4">
                <p className="text-sm text-slate-500 mb-4">
                  This is what lands in their inbox Monday at 7am.
                </p>
                <MockEmailPreview />
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                {current.body}
              </p>
            )}

            {/* Action */}
            <div className="mt-6">
              {isLast ? (
                <button
                  onClick={() => setDismissed(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#D56753] text-white text-sm font-semibold py-3 shadow-[0_4px_14px_rgba(213,103,83,0.35)] hover:brightness-105 active:scale-[0.98] transition-all"
                >
                  Got it. Show me the full dashboard.
                </button>
              ) : (
                <button
                  onClick={() => setStep(step + 1)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#212D40] text-white text-sm font-semibold py-3 hover:bg-[#212D40]/90 active:scale-[0.98] transition-all"
                >
                  Next
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// T1 wires: render DemoGuided when /demo?guided=true, else render Demo
