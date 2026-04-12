/**
 * Trial Banner -- soft gate.
 *
 * Shows when trial has <= 3 days remaining. Dismissable but reappears daily.
 * Not aggressive. Not begging. Just clear: "Your intelligence goes dark in X days."
 *
 * The banner uses loss-aversion, not generic CTAs. It names the competitor,
 * the review gap, the specific intelligence that will stop. Specific > generic.
 */

import { useState, useEffect } from "react";
import { X, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface TrialBannerProps {
  daysRemaining: number;
  competitorName?: string | null;
  onSubscribe: () => void;
}

export default function TrialBanner({ daysRemaining, competitorName, onSubscribe }: TrialBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  // Check if already dismissed today
  useEffect(() => {
    const lastDismissed = localStorage.getItem("trial_banner_dismissed");
    if (lastDismissed) {
      const dismissedDate = new Date(lastDismissed).toDateString();
      const today = new Date().toDateString();
      if (dismissedDate === today) setDismissed(true);
    }
  }, []);

  if (dismissed || daysRemaining > 3 || daysRemaining < 0) return null;

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("trial_banner_dismissed", new Date().toISOString());
  };

  // Loss-aversion copy, not generic
  const headline = daysRemaining === 0
    ? "Your trial ends today."
    : daysRemaining === 1
      ? "Your intelligence goes dark tomorrow."
      : `${daysRemaining} days left on your trial.`;

  const subtext = competitorName
    ? `Alloro stops tracking ${competitorName} and your market when your trial ends.`
    : "Your competitive intelligence, weekly reports, and market tracking stop when your trial ends.";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="mx-auto max-w-[800px] px-4 sm:px-6 mb-4"
      >
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 relative">
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 p-1 text-amber-400 hover:text-amber-600 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>

          <p className="text-sm font-semibold text-[#1A1D23] pr-6">{headline}</p>
          <p className="text-sm text-gray-500 mt-1">{subtext}</p>

          <button
            onClick={onSubscribe}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#D56753] px-4 py-2 text-sm font-medium text-white hover:brightness-105 transition-all"
          >
            Keep your intelligence running
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
