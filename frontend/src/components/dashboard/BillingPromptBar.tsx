/**
 * Billing Prompt Bar — appears after TTFV "Yes" response.
 *
 * Quiet bar at top of dashboard (NOT modal).
 * "You said this told you something. Keep it telling you.
 * $1,500/month for your first 3 months, then $2,000. [Keep it running →]"
 *
 * Dismissable. Reappears on next login until billing activated.
 */

import { useState, useEffect } from "react";
import { X, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../../api/index";

interface BillingPromptBarProps {
  orgId: number | null;
}

export default function BillingPromptBar({ orgId }: BillingPromptBarProps) {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!orgId || dismissed) return;

    let cancelled = false;

    async function check() {
      try {
        const state = await apiGet({ path: `/api/org/${orgId}/ttfv` });
        if (cancelled) return;

        if (state?.showBillingPrompt) {
          setVisible(true);
        }
      } catch {
        // Silently fail
      }
    }

    check();
    return () => { cancelled = true; };
  }, [orgId, dismissed]);

  if (!visible || dismissed) return null;

  return (
    <div className="w-full bg-[#212D40] text-white px-4 py-3">
      <div className="mx-auto max-w-2xl flex items-center gap-3">
        <p className="flex-1 text-sm leading-snug">
          <span className="font-medium">You said this told you something.</span>{" "}
          <span className="text-white/70">
            Keep it telling you. $1,500/month for your first 3 months, then $2,000.
          </span>
        </p>
        <button
          onClick={() => navigate("/settings/billing")}
          className="shrink-0 flex items-center gap-1.5 rounded-lg bg-[#D56753] px-4 py-2 text-xs font-semibold text-white hover:brightness-105 active:scale-[0.98] transition-all"
        >
          Keep it running
          <ArrowRight className="h-3 w-3" />
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 p-1 text-white/40 hover:text-white/70 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
