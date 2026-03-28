/**
 * Onboarding Checklist — persistent top-of-dashboard card.
 *
 * Five steps, each reducing a specific anxiety:
 * 1. "Do I know where I stand?" → competitive position
 * 2. "Is this data real?" → GBP connection
 * 3. "Will this tell me about my referrals?" → PMS upload
 * 4. "What will Monday look like?" → Monday email preview
 * 5. "Is this worth sharing?" → share referral link
 *
 * Dismissable after step 3. Disappears after all 5 complete.
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
  Mail,
  Share2,
  Copy,
} from "lucide-react";

interface OnboardingStep {
  id: string;
  title: string;
  anxiety: string;
  complete: boolean;
  cta: string;
  action: () => void;
  icon: React.ComponentType<{ className?: string }>;
}

interface OnboardingChecklistProps {
  checkupScore: number | null;
  gbpConnected: boolean;
  pmsUploaded: boolean;
  mondayEmailOpened: boolean;
  referralShared: boolean;
  referralCode: string | null;
  onDismiss: () => void;
}

export default function OnboardingChecklist({
  checkupScore,
  gbpConnected,
  pmsUploaded,
  mondayEmailOpened,
  referralShared,
  referralCode,
  onDismiss,
}: OnboardingChecklistProps) {
  const navigate = useNavigate();
  const [linkCopied, setLinkCopied] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const steps: OnboardingStep[] = [
    {
      id: "checkup",
      title: "See your competitive position",
      anxiety: "Do I know where I stand?",
      complete: checkupScore != null,
      cta: "View your market",
      action: () => navigate("/dashboard/rankings"),
      icon: BarChart3,
    },
    {
      id: "gbp",
      title: "Connect your Google Business Profile",
      anxiety: "Is this data real?",
      complete: gbpConnected,
      cta: "Connect Google",
      action: () => navigate("/settings/integrations"),
      icon: Link2,
    },
    {
      id: "pms",
      title: "Upload your scheduling data",
      anxiety: "Will this tell me about my referrals?",
      complete: pmsUploaded,
      cta: "Upload data",
      action: () => navigate("/dashboard/referrals"),
      icon: Upload,
    },
    {
      id: "monday",
      title: "Review your Monday email",
      anxiety: "What will Monday look like?",
      complete: mondayEmailOpened,
      cta: "See what's coming",
      action: () => navigate("/dashboard/intelligence"),
      icon: Mail,
    },
    {
      id: "share",
      title: "Share your Checkup with a colleague",
      anxiety: "Is this worth sharing?",
      complete: referralShared,
      cta: "Share",
      action: () => {
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
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-bold text-[#212D40]">Get started</p>
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
                ? "bg-gray-50 opacity-60"
                : "bg-white hover:bg-[#D56753]/[0.02] hover:border-[#D56753]/20 border border-gray-100"
            }`}
          >
            {step.complete ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
            ) : (
              <Circle className="h-5 w-5 text-gray-300 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${step.complete ? "text-gray-400 line-through" : "text-[#212D40]"}`}>
                {step.title}
              </p>
              {!step.complete && (
                <p className="text-[10px] text-gray-400 mt-0.5 italic">{step.anxiety}</p>
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
