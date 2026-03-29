/**
 * CardCapture - Soft card-on-file prompt during trial
 *
 * Shows on the dashboard during trial days 3-7 (not before).
 * Subtle, non-aggressive. NOT a gate. NOT required.
 * Just a soft prompt to add a payment method.
 */

import { useState } from "react";
import { CreditCard, X, ArrowRight } from "lucide-react";
import { apiPost } from "../../api";

interface CardCaptureProps {
  trialDaysRemaining: number;
  isSubscribed: boolean;
}

export default function CardCapture({
  trialDaysRemaining,
  isSubscribed,
}: CardCaptureProps) {
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);

  // Only show days 3-7 of trial (days_remaining 0-4), not before day 3
  // Trial is 7 days: day 3 means 4 days remaining, day 7 means 0 days remaining
  const trialDayNumber = 7 - trialDaysRemaining;
  const shouldShow =
    !isSubscribed &&
    !dismissed &&
    trialDayNumber >= 3 &&
    trialDaysRemaining >= 0;

  if (!shouldShow) return null;

  const handleAddCard = async () => {
    setLoading(true);
    try {
      // Try to create a SetupIntent via the API
      const res = await apiPost({
        path: "/billing/setup-intent",
        body: {},
      });

      if (res?.success && res.clientSecret) {
        // For now, redirect to billing settings where full Stripe integration lives
        // The SetupIntent client_secret can be used with Stripe Elements in the future
        window.location.href = "/settings/billing?setup=true";
      } else {
        // Fallback: just navigate to billing settings
        window.location.href = "/settings/billing";
      }
    } catch {
      // Fallback: navigate to billing settings
      window.location.href = "/settings/billing";
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative bg-gradient-to-r from-[#212D40]/[0.03] to-[#D56753]/[0.04] border border-black/5 rounded-2xl p-5 transition-all duration-300 hover:border-[#D56753]/15">
      {/* Dismiss button */}
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-black/5 transition-colors"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>

      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#212D40]/[0.06] flex items-center justify-center">
          <CreditCard size={18} className="text-[#212D40]/50" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#212D40] leading-snug">
            Add a payment method to keep your intelligence running after your trial.
          </p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            {trialDaysRemaining > 0
              ? `${trialDaysRemaining} day${trialDaysRemaining !== 1 ? "s" : ""} remaining. No charge until your trial ends.`
              : "Your trial is ending today. Add a card to continue without interruption."}
          </p>

          {/* CTA */}
          <button
            onClick={handleAddCard}
            disabled={loading}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#D56753] hover:text-[#c04e3a] transition-colors disabled:opacity-50"
          >
            {loading ? "Setting up..." : "Add card"}
            {!loading && <ArrowRight size={12} />}
          </button>
        </div>
      </div>
    </div>
  );
}
