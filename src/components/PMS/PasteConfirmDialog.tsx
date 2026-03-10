import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ClipboardPaste, Loader2, Search, Sparkles, X } from "lucide-react";
import type { PasteInfo } from "./types";
import type { PastePhase } from "./usePasteHandler";

interface PasteConfirmDialogProps {
  pasteInfo: PasteInfo | null;
  isPasting: boolean;
  phase: PastePhase;
  batchProgress: { current: number; total: number } | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const ALORO_ORANGE = "#C9765E";

const PHASE_CONFIG: Record<
  Exclude<PastePhase, "idle">,
  { icon: React.ReactNode; label: string; description: string }
> = {
  analyzing: {
    icon: <Search size={16} className="animate-pulse" />,
    label: "Analyzing your data structure...",
    description: "Detecting columns, types, and layout",
  },
  parsing: {
    icon: <Loader2 size={16} className="animate-spin" />,
    label: "Parsing data...",
    description: "Extracting referral sources and production values",
  },
  sanitizing: {
    icon: <Sparkles size={16} className="animate-pulse" />,
    label: "Cleaning your data...",
    description: "Deduplicating similar sources",
  },
};

export const PasteConfirmDialog: React.FC<PasteConfirmDialogProps> = ({
  pasteInfo,
  isPasting,
  phase,
  batchProgress,
  onConfirm,
  onCancel,
}) => {
  if (!pasteInfo) return null;

  const phaseConfig = phase !== "idle" ? PHASE_CONFIG[phase] : null;

  // Compute overall progress across all 3 phases
  const getOverallProgress = (): number => {
    if (phase === "analyzing") return 10;
    if (phase === "parsing" && batchProgress) {
      // Parsing is 10-80% of overall progress
      const batchPct = batchProgress.current / batchProgress.total;
      return 10 + batchPct * 70;
    }
    if (phase === "sanitizing") return 85;
    return 0;
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/30 flex items-center justify-center z-[110]"
        onClick={onCancel}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl p-6 w-96 shadow-xl relative"
        >
          <button
            onClick={onCancel}
            disabled={isPasting}
            className="absolute right-3 top-3 p-1 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            aria-label="Close"
          >
            <X size={16} className="text-gray-400" />
          </button>

          <div className="flex flex-col items-center">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: `${ALORO_ORANGE}18` }}
            >
              <ClipboardPaste size={24} style={{ color: ALORO_ORANGE }} />
            </div>

            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {isPasting
                ? phaseConfig?.label || "Processing..."
                : "Paste detected"}
            </h3>

            {!isPasting && (
              <>
                <p className="text-sm text-gray-500 text-center mb-4">
                  {pasteInfo.chunksRequired > 1
                    ? `That's a lot of data! We'll process it in ${pasteInfo.chunksRequired} batches of 30 rows each.`
                    : "Ready to parse your pasted data using AI."}
                </p>

                <div className="w-full bg-gray-50 rounded-xl p-3 mb-5 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Size</span>
                    <span className="font-medium text-gray-700">
                      {pasteInfo.sizeKB.toFixed(1)} KB
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Rows detected</span>
                    <span className="font-medium text-gray-700">
                      ~{pasteInfo.estimatedRows}
                    </span>
                  </div>
                  {pasteInfo.chunksRequired > 1 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Batches</span>
                      <span className="font-medium text-gray-700">
                        {pasteInfo.chunksRequired}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 w-full">
                  <button
                    onClick={onCancel}
                    className="flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={onConfirm}
                    className="flex-1 rounded-full px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 flex items-center justify-center gap-2"
                    style={{ backgroundColor: ALORO_ORANGE }}
                  >
                    <ClipboardPaste size={14} />
                    Parse Data
                  </button>
                </div>
              </>
            )}

            {isPasting && phaseConfig && (
              <div className="w-full mt-2">
                {/* Phase indicator */}
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span style={{ color: ALORO_ORANGE }}>
                    {phaseConfig.icon}
                  </span>
                  <span className="text-sm text-gray-600">
                    {phase === "parsing" &&
                    batchProgress &&
                    batchProgress.total > 1
                      ? `Processing batch ${batchProgress.current} of ${batchProgress.total}...`
                      : phaseConfig.description}
                  </span>
                </div>

                {/* Phase step indicators */}
                <div className="flex items-center justify-center gap-1.5 mb-3 mt-2">
                  {(
                    ["analyzing", "parsing", "sanitizing"] as const
                  ).map((p) => (
                    <div
                      key={p}
                      className="flex items-center gap-1"
                    >
                      <div
                        className="w-2 h-2 rounded-full transition-colors duration-300"
                        style={{
                          backgroundColor:
                            phase === p
                              ? ALORO_ORANGE
                              : (
                                  ["analyzing", "parsing", "sanitizing"].indexOf(phase) >
                                  ["analyzing", "parsing", "sanitizing"].indexOf(p)
                                )
                                ? ALORO_ORANGE
                                : "#e5e7eb",
                          opacity:
                            phase === p
                              ? 1
                              : (
                                  ["analyzing", "parsing", "sanitizing"].indexOf(phase) >
                                  ["analyzing", "parsing", "sanitizing"].indexOf(p)
                                )
                                ? 0.5
                                : 0.3,
                        }}
                      />
                      <span
                        className="text-[10px] font-medium transition-colors duration-300"
                        style={{
                          color:
                            phase === p
                              ? ALORO_ORANGE
                              : "#9ca3af",
                        }}
                      >
                        {p === "analyzing"
                          ? "Analyze"
                          : p === "parsing"
                            ? "Parse"
                            : "Clean"}
                      </span>
                      {p !== "sanitizing" && (
                        <div className="w-4 h-px bg-gray-200 mx-0.5" />
                      )}
                    </div>
                  ))}
                </div>

                {/* Overall progress bar */}
                <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: ALORO_ORANGE }}
                    initial={{ width: "0%" }}
                    animate={{
                      width: `${getOverallProgress()}%`,
                    }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                  />
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
