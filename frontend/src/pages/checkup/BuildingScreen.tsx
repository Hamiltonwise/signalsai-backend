import { useEffect, useState } from "react";
import { useLocation, Navigate, useNavigate } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { isConferenceMode, clearFlowParams } from "./conferenceFallback";

/**
 * /checkup/building -- transition after account creation.
 *
 * NOT a fake progress screen. The data already exists from the checkup.
 * This is a CONFIRMATION moment: "It worked. Your score is real. Here's
 * what happens Monday."
 *
 * The old version showed fake progress ("analyzing your market") when
 * nothing was actually happening. That's the exact pattern our ICP has
 * been burned by from every agency. We don't do that.
 *
 * Design: calm confirmation, score reminder, then forward to share screen.
 */

interface BuildingState {
  businessName: string;
  specialty: string;
  email: string;
  referralCode?: string | null;
  checkupScore?: number | null;
}

export default function BuildingScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as BuildingState | undefined;
  const [ready, setReady] = useState(false);

  // Verify auth token exists before navigating
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      const retry = setTimeout(() => {
        const retryToken = localStorage.getItem("auth_token");
        if (retryToken) {
          setReady(true);
        } else {
          navigate("/signin", { replace: true });
        }
      }, 2000);
      return () => clearTimeout(retry);
    }
    setReady(true);
  }, [navigate]);

  // Navigate forward after the confirmation moment
  useEffect(() => {
    if (!ready) return;
    const conference = isConferenceMode();
    const destination = conference ? "/checkup/share" : "/checkup/share";
    const timer = setTimeout(() => {
      clearFlowParams();
      navigate(destination, {
        replace: true,
        state: {
          referralCode: state?.referralCode || null,
          checkupScore: state?.checkupScore || null,
          businessName: state?.businessName || null,
        },
      });
    }, 4000);
    return () => clearTimeout(timer);
  }, [ready, navigate, state]);

  if (!state?.businessName) {
    return <Navigate to="/checkup" replace />;
  }

  const { businessName, email } = state;

  return (
    <div className="w-full max-w-md mt-4 sm:mt-12 text-center space-y-8">
      {/* Confirmation: it worked */}
      <div className="space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 mx-auto">
          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-semibold text-[#1A1D23] tracking-tight leading-tight font-heading">
          {businessName} is set up.
        </h2>
      </div>

      {/* Dashboard bridge */}
      <div className="card-primary text-center py-6">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-[0.05em] mb-2">
          Your Google Health Check
        </p>
        <p className="text-sm text-gray-500 mt-2">
          Your readings are in your dashboard. They update every week.
        </p>
      </div>

      {/* What's real: no fake progress, just honest next steps */}
      <div className="space-y-3 text-left">
        <div className="flex items-start gap-3">
          <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-50 flex items-center justify-center mt-0.5">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
          </span>
          <p className="text-sm text-gray-500 leading-relaxed">
            Your competitors have been mapped and your readings are live
          </p>
        </div>
        <div className="flex items-start gap-3">
          <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-50 flex items-center justify-center mt-0.5">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
          </span>
          <p className="text-sm text-gray-500 leading-relaxed">
            Monday at 7:15 AM, your first briefing arrives at <span className="font-medium text-[#1A1D23]">{email}</span>
          </p>
        </div>
      </div>

      {/* Website preview teaser -- builds anticipation */}
      <div className="rounded-2xl border border-[#D56753]/15 bg-[#D56753]/[0.03] p-5 text-left">
        <p className="text-xs font-semibold text-[#D56753] uppercase tracking-wide mb-2">
          Coming soon in your dashboard
        </p>
        <p className="text-sm text-[#1A1D23] leading-relaxed">
          We're reading your reviews to find what makes {businessName} different. When it's ready, you'll see a website preview built from what your customers actually say about you, not stock copy.
        </p>
      </div>
    </div>
  );
}
