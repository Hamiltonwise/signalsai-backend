import { useLocation, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

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
    <div className="w-full max-w-md mt-8 sm:mt-16 text-center space-y-8">
      {/* Animated progress indicator */}
      <div className="relative mx-auto w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
        <div className="absolute inset-0 rounded-full border-4 border-t-[#D56753] animate-spin" />
      </div>

      {/* Headline */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
          Your {specialtyLabel} website for {practiceName} is being prepared.
        </h2>
        <p className="mt-3 text-sm text-slate-500 leading-relaxed">
          We&apos;ll notify you at{" "}
          <span className="font-medium text-slate-700">{email}</span> when
          it&apos;s ready — usually under an hour.
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-[#D56753] rounded-full animate-indeterminate" />
      </div>

      {/* Quiet CTA */}
      <div className="pt-4">
        <a
          href="/signin"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#212D40] border border-[#212D40]/20 rounded-lg px-5 py-2.5 hover:border-[#212D40]/40 transition-colors"
        >
          Create your account to track progress
        </a>
      </div>

      {/* Indeterminate animation keyframes injected via style tag */}
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
