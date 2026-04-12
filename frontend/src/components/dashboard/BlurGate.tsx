/**
 * Blur Gate -- premium content behind a subscribe wall.
 *
 * After trial expires, sections that require a subscription show
 * blurred content with a subscribe overlay. The data is still being
 * collected (so it's ready when they pay), but they can't see it.
 *
 * The blur creates loss-aversion: "The data exists. You're choosing
 * not to see it." That's stronger than never having had it.
 *
 * Usage:
 *   <BlurGate locked={!isSubscribed && trialExpired}>
 *     <YourPremiumContent />
 *   </BlurGate>
 */

import type { ReactNode } from "react";
import { ArrowRight, Lock } from "lucide-react";

interface BlurGateProps {
  locked: boolean;
  children: ReactNode;
  /** What they're missing -- shown in the overlay */
  featureName?: string;
  onSubscribe?: () => void;
}

export default function BlurGate({ locked, children, featureName, onSubscribe }: BlurGateProps) {
  if (!locked) return <>{children}</>;

  return (
    <div className="relative">
      {/* Blurred content -- visible but unreadable */}
      <div className="pointer-events-none select-none" style={{ filter: "blur(6px)" }} aria-hidden="true">
        {children}
      </div>

      {/* Subscribe overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-[#F8F6F2]/60 rounded-2xl">
        <div className="text-center px-6 py-5 max-w-xs">
          <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center mx-auto mb-3">
            <Lock className="w-5 h-5 text-gray-400" />
          </div>
          <p className="text-sm font-semibold text-[#1A1D23] mb-1">
            {featureName ? `${featureName} requires a subscription` : "Subscribe to unlock"}
          </p>
          <p className="text-xs text-gray-500 mb-3">
            Alloro is still collecting this data. Subscribe to see it.
          </p>
          {onSubscribe && (
            <button
              onClick={onSubscribe}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#D56753] text-white text-sm font-medium hover:brightness-105 transition-all"
            >
              Subscribe
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
