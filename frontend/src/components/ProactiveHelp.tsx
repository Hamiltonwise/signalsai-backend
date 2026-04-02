/**
 * ProactiveHelp -- The toast that appears BEFORE the user asks.
 *
 * Uses frustration detection (rage clicks, idle, navigation loops)
 * to surface contextual help. One tap dismisses or opens help.
 *
 * This is the layer between "the product just works" and "text Corey."
 * The system catches frustration signals and offers help automatically.
 */

import { useFrustrationDetection } from "@/hooks/useFrustrationDetection";
import { MessageCircle, X } from "lucide-react";

export default function ProactiveHelp() {
  const { showHelp, helpMessage, dismissHelp } = useFrustrationDetection({
    idleThresholdMs: 90000,
    enabled: true,
  });

  if (!showHelp) return null;

  return (
    <div className="fixed bottom-20 right-6 z-50 w-72 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#D56753]/10 flex items-center justify-center shrink-0">
            <MessageCircle className="w-4 h-4 text-[#D56753]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-[#1A1D23] leading-relaxed">
              {helpMessage}
            </p>
          </div>
          <button
            onClick={dismissHelp}
            className="w-6 h-6 rounded flex items-center justify-center hover:bg-gray-100 shrink-0"
          >
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
      </div>
    </div>
  );
}
