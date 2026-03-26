import { useEffect, useState } from "react";
import { useLocation, Navigate, useNavigate } from "react-router-dom";
import { isConferenceMode, clearFlowParams } from "./conferenceFallback";

/**
 * /checkup/building -- transition screen after account creation.
 * Shows what's happening behind the scenes while the user waits.
 * Navigates to dashboard after a brief brand moment.
 */

interface BuildingState {
  practiceName: string;
  specialty: string;
  email: string;
}

export default function BuildingScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as BuildingState | undefined;
  const [ready, setReady] = useState(false);

  // Verify auth token exists before navigating to dashboard
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      // No token, wait a moment then check again (token may still be propagating)
      const retry = setTimeout(() => {
        const retryToken = localStorage.getItem("auth_token");
        if (retryToken) {
          setReady(true);
        } else {
          // Still no token after retry, send to signin
          navigate("/signin", { replace: true });
        }
      }, 2000);
      return () => clearTimeout(retry);
    }
    setReady(true);
  }, [navigate]);

  // Once auth is confirmed, navigate after brand moment
  // Conference mode: route through /thank-you (booth info + one action card)
  // Normal mode: go straight to dashboard
  useEffect(() => {
    if (!ready) return;
    const conference = isConferenceMode();
    const destination = conference ? "/thank-you" : "/dashboard";
    const timer = setTimeout(() => {
      // Clear all flow params so they don't persist beyond the checkup
      clearFlowParams();
      navigate(destination, { replace: true });
    }, 3500);
    return () => clearTimeout(timer);
  }, [ready, navigate]);

  if (!state?.practiceName) {
    return <Navigate to="/checkup" replace />;
  }

  const { practiceName, email } = state;

  return (
    <div className="w-full max-w-md mt-4 sm:mt-12 text-center space-y-10">
      {/* Animated progress ring */}
      <div className="relative mx-auto w-20 h-20">
        <div className="absolute inset-0 rounded-full border-[3px] border-[#D56753]/10" />
        <div className="absolute inset-0 rounded-full border-[3px] border-t-[#D56753] border-r-transparent border-b-transparent border-l-transparent animate-spin" style={{ animationDuration: "1.2s" }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-[#D56753]/20 animate-pulse" />
        </div>
      </div>

      {/* Headline */}
      <div className="space-y-4">
        <p className="text-xs font-semibold tracking-widest text-[#D56753] uppercase">
          Setting Up Your Dashboard
        </p>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-[#212D40] tracking-tight leading-tight">
          Welcome, {practiceName}.
        </h2>
        <p className="text-sm text-slate-500 leading-relaxed max-w-sm mx-auto">
          Your competitive intelligence is being prepared. We'll send updates to{" "}
          <span className="font-semibold text-[#212D40]">{email}</span>.
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-[#D56753]/8 rounded-full overflow-hidden">
        <div className="h-full bg-[#D56753] rounded-full animate-indeterminate" />
      </div>

      {/* What happens next */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.06)] text-left space-y-3">
        <p className="text-xs font-semibold tracking-wide text-slate-400 uppercase">What happens next</p>
        {[
          "Your market data is being analyzed in depth",
          "Your competitive dashboard is being configured",
          "Your first weekly intelligence brief is being queued",
        ].map((step, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="shrink-0 w-5 h-5 rounded-full bg-[#D56753]/8 text-[#D56753] flex items-center justify-center text-[10px] font-bold mt-0.5">
              {i + 1}
            </span>
            <p className="text-sm text-slate-600 leading-relaxed">{step}</p>
          </div>
        ))}
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
