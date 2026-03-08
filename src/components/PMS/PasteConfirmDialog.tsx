import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ClipboardPaste, Loader2, X } from "lucide-react";
import type { PasteInfo } from "./types";

interface PasteConfirmDialogProps {
  pasteInfo: PasteInfo | null;
  isPasting: boolean;
  batchProgress: { current: number; total: number } | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const ALORO_ORANGE = "#C9765E";

export const PasteConfirmDialog: React.FC<PasteConfirmDialogProps> = ({
  pasteInfo,
  isPasting,
  batchProgress,
  onConfirm,
  onCancel,
}) => {
  if (!pasteInfo) return null;

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
              {isPasting ? "Parsing data..." : "Paste detected"}
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

            {isPasting && (
              <div className="w-full mt-2">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <Loader2 size={16} className="animate-spin text-gray-500" />
                  <span className="text-sm text-gray-600">
                    {batchProgress && batchProgress.total > 1
                      ? `Processing batch ${batchProgress.current} of ${batchProgress.total}...`
                      : "Analyzing your data..."}
                  </span>
                </div>

                {batchProgress && batchProgress.total > 1 && (
                  <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: ALORO_ORANGE }}
                      initial={{ width: "0%" }}
                      animate={{
                        width: `${
                          (batchProgress.current / batchProgress.total) * 100
                        }%`,
                      }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
