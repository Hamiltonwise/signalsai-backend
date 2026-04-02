/**
 * Billing Prompt -- shown when autonomous TTFV detection reaches threshold.
 *
 * Instead of a flat pricing message, shows loss-aversion copy
 * based on real TTFV signals (review growth, competitor data, engagement).
 * Only visible when TTFV score >= 50.
 */

import { useState, useEffect } from "react";
import { X, ArrowRight, TrendingUp, Shield } from "lucide-react";

interface BillingPromptProps {
  orgId: number | null;
  score?: number | null;
  finding?: string | null;
}

interface TTFVSignals {
  reached: boolean;
  signals: string[];
  score: number;
}

export default function BillingPromptBar({ orgId, score, finding }: BillingPromptProps) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [ttfvData, setTtfvData] = useState<TTFVSignals | null>(null);
  const [lossContext, setLossContext] = useState<{
    reviewGrowth: number;
    competitorName: string | null;
    competitorGap: number | null;
  }>({ reviewGrowth: 0, competitorName: null, competitorGap: null });

  useEffect(() => {
    if (!orgId || dismissed) return;
    let cancelled = false;

    async function check() {
      try {
        const token = localStorage.getItem("auth_token");
        const headers: Record<string, string> = token
          ? { Authorization: `Bearer ${token}` }
          : {};

        // Fetch TTFV detection + billing status in parallel
        const [ttfvRes, statusRes] = await Promise.all([
          fetch(`/api/org/${orgId}/ttfv-detection`, { headers }).catch(() => null),
          fetch("/api/checkup/ttfv-status", { headers }).catch(() => null),
        ]);

        if (cancelled) return;

        // Check TTFV detection signals
        let ttfvReached = false;
        if (ttfvRes?.ok) {
          const data = await ttfvRes.json();
          if (data.success) {
            setTtfvData(data);
            ttfvReached = data.reached;
          }
        }

        // Fallback to legacy billing check
        if (!ttfvReached && statusRes?.ok) {
          const data = await statusRes.json();
          if (data.showBilling) ttfvReached = true;
        }

        // Only show when TTFV is actually detected
        if (ttfvReached) {
          setVisible(true);
          // Fetch loss-aversion context
          try {
            const contextRes = await fetch(`/api/org/${orgId}/ttfv`, { headers });
            if (contextRes.ok) {
              const ctx = await contextRes.json();
              setLossContext({
                reviewGrowth: ctx.reviewGrowth || 0,
                competitorName: ctx.competitorName || null,
                competitorGap: ctx.competitorGap || null,
              });
            }
          } catch { /* non-critical */ }
        }
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

  // Build loss-aversion headline
  const headlines: string[] = [];
  if (lossContext.reviewGrowth > 0) {
    headlines.push(
      `You have gained ${lossContext.reviewGrowth} review${lossContext.reviewGrowth > 1 ? "s" : ""} since joining.`
    );
  }
  if (lossContext.competitorName && lossContext.competitorGap != null) {
    headlines.push(
      `${lossContext.competitorName} is ${lossContext.competitorGap} reviews away.`
    );
  }
  const headlineText = headlines.length > 0
    ? `${headlines.join(" ")} Keep your intelligence running.`
    : "Your competitive intelligence is building momentum. Keep it running.";

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
          <p className="text-3xl font-semibold mb-1">{score}<span className="text-lg text-white/50">/100</span></p>
        )}

        {/* TTFV signals */}
        {ttfvData && ttfvData.signals.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {ttfvData.signals.map((signal) => (
              <span
                key={signal}
                className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/70"
              >
                {signal === "Growing reviews" ? (
                  <TrendingUp className="h-3 w-3 text-emerald-400" />
                ) : (
                  <Shield className="h-3 w-3 text-[#D56753]" />
                )}
                {signal}
              </span>
            ))}
          </div>
        )}

        {finding && (
          <p className="text-sm text-white/70 leading-relaxed mb-3">{finding}</p>
        )}

        <p className="text-sm font-medium text-white/90 mb-3">
          {headlineText}
        </p>

        <div className="flex items-center gap-3">
          <a
            href="/settings/billing"
            className="inline-flex items-center gap-2 rounded-lg bg-[#D56753] px-5 py-2.5 text-sm font-semibold text-white hover:brightness-105 active:scale-[0.98] transition-all"
          >
            Keep it running
            <ArrowRight className="h-4 w-4" />
          </a>
          <p className="text-xs text-white/30">
            Your market data stays yours either way.
          </p>
        </div>
      </div>
    </div>
  );
}
