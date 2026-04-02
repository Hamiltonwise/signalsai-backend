/**
 * Onboarding Checklist -- persistent top-of-dashboard card.
 *
 * Five steps. Two pre-completed as Alloro gifts (endowment + Zeigarnik):
 * 1. "Alloro analyzed your competitive position" -- auto-done if checkup ran
 * 2. "Your competitors were identified" -- auto-done if checkup ran
 * 3. "Upload your scheduling data" -- user action
 * 4. "Go deeper with live Google data" -- optional enhancement
 * 5. "Share your Checkup with a colleague" -- user action
 *
 * GBP is an optional enhancement, NOT a gate. Checkup data powers the dashboard.
 * User lands at "2 of 5 complete" before lifting a finger.
 * Dismissable after 3 complete. Disappears after all 5 complete.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  ChevronRight,
  X,
  BarChart3,
  Link2,
  Upload,
  Target,
  Share2,
  Copy,
} from "lucide-react";
import { TailorText } from "../TailorText";

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
      id: "pms",
      title: "Upload your scheduling data",
      anxiety: "See which referral sources drive revenue",
      complete: pmsUploaded,
      cta: "Upload data",
      action: () => { onStepComplete?.("pms"); navigate("/dashboard/referrals"); },
      icon: Upload,
    },
    {
      id: "gbp",
      title: "Go deeper with live Google data",
      anxiety: "Add live ranking tracking and review alerts",
      complete: gbpConnected,
      cta: "Connect Google",
      action: () => navigate("/settings/integrations"),
      icon: Link2,
    },
    {
      id: "share",
      title: "Share and split the check",
      anxiety: "Know someone who should see this? You both save a month.",
      complete: referralShared,
      cta: "Share and save",
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
      <div className="card-featured px-5 py-4 text-center">
        <p className="text-sm font-semibold text-emerald-700">
          You're all set. Alloro is watching your market. See you Monday.
        </p>
      </div>
    );
  }

  return (
    <div className="card-primary">
      {/* Header -- IKEA effect: "building", not "completing" */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <TailorText editKey="dashboard.checklist.title" defaultText="Getting started" as="p" className="text-sm font-semibold text-[#1A1D23]" />
          <p className="text-xs text-[#D56753]/50 mt-1 font-medium">
            {completed} of {steps.length} complete
          </p>
        </div>
        {canDismiss && (
          <button
            onClick={() => { setDismissed(true); onDismiss(); }}
            className="p-1.5 text-gray-400 hover:text-gray-500 transition-colors rounded-lg hover:bg-gray-50"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-[#D56753]/[0.06] rounded-full mb-5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${(completed / steps.length) * 100}%`,
            background: 'linear-gradient(90deg, #D56753, #E07A66)',
          }}
        />
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {steps.map((step, i) => (
          <button
            key={step.id}
            onClick={step.action}
            disabled={step.complete && step.autoCompleted}
            className={`w-full flex items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-all duration-200 ${
              step.complete
                ? step.autoCompleted
                  ? "bg-gradient-to-r from-emerald-50/60 to-emerald-50/30 border border-emerald-200/40"
                  : "bg-gray-50/50 opacity-60"
                : "bg-white hover:bg-[#FFF9F7] border border-[#D56753]/8 hover:border-[#D56753]/20 shadow-sm hover:shadow-warm"
            }`}
            style={!step.complete ? { animation: `fade-in-up 0.3s ease-out ${i * 0.05}s both` } : undefined}
          >
            {step.complete ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
            ) : (
              <div className="w-5 h-5 rounded-full border-2 border-[#D56753]/25 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${
                step.complete
                  ? step.autoCompleted
                    ? "text-emerald-700"
                    : "text-gray-400 line-through"
                  : "text-[#1A1D23]"
              }`}>
                {step.title}
              </p>
              {!step.complete && (
                <p className="text-xs text-gray-400 mt-0.5">{step.anxiety}</p>
              )}
              {step.complete && step.autoCompleted && (
                <p className="text-xs text-emerald-500 mt-0.5 font-medium">Done for you</p>
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
