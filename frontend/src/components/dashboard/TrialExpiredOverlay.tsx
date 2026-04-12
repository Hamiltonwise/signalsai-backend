/**
 * Trial Expired Overlay -- hard gate.
 *
 * Full-screen overlay when trial has expired and no subscription exists.
 * The user can still see their score and one finding (the hook), but
 * the dashboard is blocked until they subscribe.
 *
 * Not a paywall. A reality: "We're still watching. You just can't see it."
 * That's the loss-aversion mechanic. The data exists. They're choosing not to see it.
 */

import { ArrowRight, Eye, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";

interface TrialExpiredOverlayProps {
  competitorName?: string | null;
  score?: number | null;
  finding?: string | null;
  onSubscribe: () => void;
  isGracePeriod?: boolean;
}

export default function TrialExpiredOverlay({
  competitorName,
  finding,
  onSubscribe,
  isGracePeriod,
}: TrialExpiredOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 bg-[#F8F6F2]/95 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="max-w-md w-full"
      >
        <div className="rounded-2xl bg-white border border-stone-200 shadow-xl p-8 text-center">
          {/* Status indicator */}
          <div className="w-14 h-14 rounded-2xl bg-[#D56753]/10 flex items-center justify-center mx-auto mb-5">
            <Eye className="w-7 h-7 text-[#D56753]" />
          </div>

          <h2 className="text-xl font-semibold text-[#1A1D23] mb-2">
            {isGracePeriod ? "Your trial ended." : "Your intelligence went dark."}
          </h2>

          <p className="text-sm text-gray-500 leading-relaxed mb-4">
            {competitorName
              ? `Alloro is still tracking ${competitorName} and your market. Subscribe to see what's changed.`
              : "Alloro is still collecting your competitive data. Subscribe to see your intelligence."}
          </p>

          {/* The hook: one finding they can see */}
          {finding && (
            <div className="rounded-xl bg-stone-50 border border-stone-200/60 p-4 mb-5 text-left">
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Your latest finding</p>
              <p className="text-sm text-[#1A1D23]">{finding}</p>
              <p className="text-xs text-gray-400 mt-2">Subscribe to see the full picture.</p>
            </div>
          )}

          <button
            onClick={onSubscribe}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#D56753] px-5 py-3 text-sm font-semibold text-white hover:brightness-105 active:scale-[0.98] transition-all"
          >
            Subscribe now
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="flex items-center justify-center gap-2 mt-4">
            <ShieldCheck className="w-3.5 h-3.5 text-gray-400" />
            <p className="text-xs text-gray-400">Your data is safe. Nothing was lost.</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
