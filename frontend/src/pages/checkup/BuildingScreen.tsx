import { useLocation, Navigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";

/**
 * /checkup/building — ClearPath build progress screen.
 * Shown after email capture. The website is being prepared.
 * No false promises, no countdown. Just: it's happening.
 */

interface BuildingState {
  practiceName: string;
  specialty: string;
  email: string;
}

export default function BuildingScreen() {
  const location = useLocation();
  const state = location.state as BuildingState | undefined;

  if (!state?.practiceName) {
    return <Navigate to="/checkup" replace />;
  }

  const { practiceName, specialty, email } = state;
  const specialtyLabel = specialty || "practice";

  return (
    <div className="w-full max-w-md mt-4 sm:mt-12 text-center space-y-10">
      {/* Animated progress ring — Terracotta branded */}
      <div className="relative mx-auto w-20 h-20">
        <div className="absolute inset-0 rounded-full border-[3px] border-[#D56753]/10" />
        <div className="absolute inset-0 rounded-full border-[3px] border-t-[#D56753] border-r-transparent border-b-transparent border-l-transparent animate-spin" style={{ animationDuration: "1.2s" }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-[#D56753]/20 animate-pulse" />
        </div>
      </div>

      {/* Headline — branded hierarchy */}
      <div className="space-y-4">
        <p className="text-xs font-semibold tracking-widest text-[#D56753] uppercase">
          Building Your Site
        </p>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-[#212D40] tracking-tight leading-tight">
          Your {specialtyLabel} website for {practiceName} is being prepared.
        </h2>
        <p className="text-sm text-slate-500 leading-relaxed max-w-sm mx-auto">
          We&apos;ll notify you at{" "}
          <span className="font-semibold text-[#212D40]">{email}</span> when
          it&apos;s ready — usually under an hour.
        </p>
      </div>

      {/* Progress bar — Terracotta indeterminate */}
      <div className="w-full h-1.5 bg-[#D56753]/8 rounded-full overflow-hidden">
        <div className="h-full bg-[#D56753] rounded-full animate-indeterminate" />
      </div>

      {/* What happens next — builds confidence */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.06)] text-left space-y-3">
        <p className="text-xs font-semibold tracking-wide text-slate-400 uppercase">What happens next</p>
        {[
          "Your site is generated from real market data",
          "We optimize it for local search in your area",
          "You get an email when it's ready to preview",
        ].map((step, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="shrink-0 w-5 h-5 rounded-full bg-[#D56753]/8 text-[#D56753] flex items-center justify-center text-[10px] font-bold mt-0.5">
              {i + 1}
            </span>
            <p className="text-sm text-slate-600 leading-relaxed">{step}</p>
          </div>
        ))}
      </div>

      {/* Quiet CTA */}
      <div>
        <a
          href="/signin"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#212D40] border border-[#212D40]/15 rounded-xl px-6 py-3 hover:border-[#212D40]/30 hover:shadow-sm transition-all"
        >
          Create your account to track progress
          <ArrowRight className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Indeterminate animation */}
      <style>{`
        @keyframes indeterminate {
          0% { transform: translateX(-100%); width: 40%; }
          50% { width: 60%; }
          100% { transform: translateX(250%); width: 40%; }
        }
        .animate-indeterminate {
          animation: indeterminate 1.8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
