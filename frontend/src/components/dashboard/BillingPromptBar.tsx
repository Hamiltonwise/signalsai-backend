/**
 * Billing Prompt — shown after TTFV "Yes" response.
 *
 * Card with score, one finding, pricing CTA.
 * Dismissable. Only shown once (marks billing_prompt_shown_at).
 */

import { useState, useEffect } from "react";
import { X, ArrowRight } from "lucide-react";

interface BillingPromptProps {
  orgId: number | null;
  score?: number | null;
  finding?: string | null;
}

export default function BillingPromptBar({ orgId, score, finding }: BillingPromptProps) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!orgId || dismissed) return;
    let cancelled = false;

    async function check() {
      try {
        const token = localStorage.getItem("auth_token");
        const res = await fetch("/api/checkup/ttfv-status", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (data.showBilling) setVisible(true);
      } catch { /* non-critical */ }
    }

    check();
    return () => { cancelled = true; };
  }, [orgId, dismissed]);

  const handleDismiss = async () => {
    setDismissed(true);
    setVisible(false);
    try {
      const token = localStorage.getItem("auth_token");
      await fetch("/api/checkup/billing-prompt-shown", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    } catch { /* non-critical */ }
  };

  if (!visible || dismissed) return null;

  return (
    <div className="mx-auto max-w-2xl px-4 mb-4">
      <div className="rounded-2xl border border-[#212D40]/10 bg-[#212D40] p-5 text-white relative">
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 text-white/30 hover:text-white/60 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>

        {score != null && (
          <p className="text-3xl font-black mb-1">{score}<span className="text-lg text-white/50">/100</span></p>
        )}

        {finding && (
          <p className="text-sm text-white/70 leading-relaxed mb-4">{finding}</p>
        )}

        <p className="text-sm font-medium text-white/90 mb-3">
          Continue seeing your full picture -- $2,000/month.
        </p>

        <a
          href="/settings/billing"
          className="inline-flex items-center gap-2 rounded-lg bg-[#D56753] px-5 py-2.5 text-sm font-semibold text-white hover:brightness-105 active:scale-[0.98] transition-all"
        >
          Keep it running
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}
