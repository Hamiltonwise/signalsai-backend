import React from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, ArrowRight } from "lucide-react";
import { useAuth } from "../../../hooks/useAuth";

/**
 * SetupProgressBanner — thin orange-tinted banner that appears above the
 * focus dashboard hero when the org's onboarding is incomplete. Reads
 * `onboardingCompleted` from `useAuth()` (the same flag passed to Sidebar
 * via PageWrapper). Returns `null` when complete (or while the value is
 * still loading / null).
 *
 * CTA destination: `/new-account-onboarding` — the protected standalone
 * onboarding page (see App.tsx route definition). The hidden
 * SetupProgressWizard component would have routed users to
 * /settings/integrations or /pmsStatistics, but those are post-onboarding
 * setup steps. For users who have not yet completed initial onboarding,
 * /new-account-onboarding is the correct destination.
 */
export function SetupProgressBanner() {
  const { onboardingCompleted } = useAuth();
  const navigate = useNavigate();

  // Hide while loading (null) and when complete (true).
  if (onboardingCompleted !== false) {
    return null;
  }

  return (
    <div
      role="status"
      className="inline-flex w-full items-center gap-3 rounded-[12px] border border-[#F3D6C4] bg-[#FFF7F2] px-[18px] py-3 text-[#8A4A36]"
    >
      <Sparkles size={16} className="shrink-0" aria-hidden="true" />
      <p className="flex-1 text-sm font-medium leading-snug">
        Finish setting up your practice to unlock your full dashboard.
      </p>
      <button
        type="button"
        onClick={() => navigate("/new-account-onboarding")}
        className="group inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#8A4A36] px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#6f3a2a]"
      >
        Continue setup
        <ArrowRight
          size={12}
          className="transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

export default SetupProgressBanner;
