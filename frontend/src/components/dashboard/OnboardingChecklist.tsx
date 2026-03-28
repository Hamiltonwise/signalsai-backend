/**
 * Onboarding Checklist -- persistent top-of-dashboard card.
 *
 * Five steps. Two pre-completed as Alloro gifts (endowment + Zeigarnik):
 * 1. "Alloro analyzed your competitive position" -- auto-done if checkup ran
 * 2. "Your competitors were identified" -- auto-done if checkup ran
 * 3. "Connect your Google Business Profile" -- user action
 * 4. "Upload your scheduling data" -- user action
 * 5. "Share your Checkup with a colleague" -- user action
 *
 * User lands at "2 of 5 complete" before lifting a finger.
 * Dismissable after 3 complete. Disappears after all 5 complete.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  Circle,
  ChevronRight,
  X,
  BarChart3,
  Link2,
  Upload,
  Target,
  Share2,
  Copy,
} from "lucide-react";

interface OnboardingStep {
  id: string;
  title: string;
  anxiety: string;
  complete: boolean;
  autoCompleted?: boolean;
  cta: string;
  action: () => void;
  icon: React.ComponentType<{ className?: string }>;
}

interface OnboardingChecklistProps {
  checkupScore: number | null;
  gbpConnected: boolean;
  pmsUploaded: boolean;
  referralShared: boolean;
  referralCode: string | null;
  checkupRank?: number | null;
  checkupTotal?: number | null;
  checkupCity?: string | null;
  onStepComplete?: (step: string) => void;
  onDismiss: () => void;
}

export default function OnboardingChecklist({
  checkupScore,
  gbpConnected,
  pmsUploaded,
  referralShared,
  referralCode,
  checkupRank,
  checkupTotal,
  checkupCity,
  onStepComplete,
  onDismiss,
}: OnboardingChecklistProps) {
  const navigate = useNavigate();
  const [linkCopied, setLinkCopied] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const hasCheckup = checkupScore != null;

  const steps: OnboardingStep[] = [
    {
      id: "analyzed",
      title: hasCheckup && checkupRank
        ? `You're #${checkupRank} of ${checkupTotal || "?"} in ${checkupCity || "your market"}`
        : hasCheckup
          ? "Alloro analyzed your competitive position"
          : "See your competitive position",
      anxiety: "See every competitor in your market",
      complete: hasCheckup,
      autoCompleted: hasCheckup,
      cta: "Run checkup",
      action: () => navigate("/checkup"),
      icon: BarChart3,
    },
    {
      id: "competitors",
      title: hasCheckup
        ? checkupTotal
          ? `${checkupTotal} competitors identified in ${checkupCity || "your market"}`
          : "Your competitors were identified"
        : "Map your competitors",
      anxiety: "Know who you're up against",
      complete: hasCheckup,
      autoCompleted: hasCheckup,
      cta: "View market",
      action: () => navigate("/dashboard/rankings"),
      icon: Target,
    },
    {
      id: "gbp",
      title: "Connect your Google Business Profile",
      anxiety: "Unlock live ranking data",
      complete: gbpConnected,
      cta: "Connect Google",
      action: () => navigate("/settings/integrations"),
      icon: Link2,
    },
    {
      id: "pms",
      title: "Upload your scheduling data",
      anxiety: "See which referral sources drive revenue",
      complete: pmsUploaded,
      cta: "Upload data",
      action: () => { onStepComplete?.("pms"); navigate("/dashboard/referrals"); },
      icon: Upload,
    },
    {
      id: "share",
      title: "Share your Checkup with a colleague",
      anxiety: "Know someone who should see this?",
      complete: referralShared,
      cta: "Share",
      action: () => {
        onStepComplete?.("share");
        if (referralCode) {
          const link = `${window.location.origin}/checkup?ref=${referralCode}`;
          navigator.clipboard.writeText(link).then(() => {
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2000);
          });
        } else {
          navigate("/checkup");
        }
      },
      icon: Share2,
    },
  ];

  const completed = steps.filter((s) => s.complete).length;
  const allComplete = completed === steps.length;
  const canDismiss = completed >= 3;

  // Auto-dismiss after all complete
  if (allComplete && !dismissed) {
    setTimeout(() => setDismissed(true), 3000);
  }

  if (dismissed) return null;

  // All complete: show quiet success card
  if (allComplete) {
    return (
      <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-5 py-4 text-center">
        <p className="text-sm font-semibold text-emerald-800">
          You're set up. See you Monday.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      {/* Header -- IKEA effect: "building", not "completing" */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-bold text-[#212D40]">Building your intelligence</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {completed} of {steps.length} complete
          </p>
        </div>
        {canDismiss && (
          <button
            onClick={() => { setDismissed(true); onDismiss(); }}
            className="p-1 text-gray-300 hover:text-gray-500 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-100 rounded-full mb-4 overflow-hidden">
        <div
          className="h-full bg-[#D56753] rounded-full transition-all duration-500"
          style={{ width: `${(completed / steps.length) * 100}%` }}
        />
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {steps.map((step) => (
          <button
            key={step.id}
            onClick={step.complete ? undefined : step.action}
            disabled={step.complete}
            className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all ${
              step.complete
                ? step.autoCompleted
                  ? "bg-emerald-50/50 border border-emerald-100"
                  : "bg-gray-50 opacity-60"
                : "bg-white hover:bg-[#D56753]/[0.02] hover:border-[#D56753]/20 border border-gray-100"
            }`}
          >
            {step.complete ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
            ) : (
              <Circle className="h-5 w-5 text-gray-300 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${
                step.complete
                  ? step.autoCompleted
                    ? "text-emerald-700"
                    : "text-gray-400 line-through"
                  : "text-[#212D40]"
              }`}>
                {step.title}
              </p>
              {!step.complete && (
                <p className="text-[10px] text-gray-400 mt-0.5 italic">{step.anxiety}</p>
              )}
              {step.complete && step.autoCompleted && (
                <p className="text-[10px] text-emerald-500 mt-0.5">Done for you</p>
              )}
            </div>
            {!step.complete && (
              <span className="flex items-center gap-1 text-xs font-semibold text-[#D56753] shrink-0">
                {step.id === "share" && linkCopied ? (
                  <>
                    <Copy className="h-3 w-3" />
                    Copied!
                  </>
                ) : (
                  <>
                    {step.cta}
                    <ChevronRight className="h-3 w-3" />
                  </>
                )}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
