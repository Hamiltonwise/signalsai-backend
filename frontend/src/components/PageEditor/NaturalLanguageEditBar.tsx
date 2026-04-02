/**
 * Natural Language Edit Bar -- The Kuda Solution
 *
 * Kuda emailed: "Change Team to Doctors. Add Internal Bleaching.
 * Update referral forms. Add CareCredit." That email became a
 * support ticket. The ticket became a project. The project took
 * two weeks.
 *
 * This component makes it 60 seconds.
 * Type what you want. See the preview. Tap confirm. Done.
 *
 * NOT a developer diff tool. A conversation with your website.
 * "What would you like to change?" -> plain English response ->
 * "Here's what will change" in words, not code -> Confirm.
 */

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Check, AlertTriangle } from "lucide-react";
import { apiPost } from "@/api/index";

interface EditChange {
  section: string;
  oldContent: string;
  newContent: string;
  changeType: "replace" | "add" | "remove";
  confidence: "high" | "low";
  description: string;
}

interface NaturalLanguageEditBarProps {
  pageId: string | null;
  onChangesApplied: () => void;
}

export default function NaturalLanguageEditBar({
  pageId,
  onChangesApplied,
}: NaturalLanguageEditBarProps) {
  const [instructions, setInstructions] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [changes, setChanges] = useState<EditChange[] | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
    }
  }, [instructions]);

  async function handleSubmit() {
    if (!instructions.trim() || !pageId || isProcessing) return;

    setIsProcessing(true);
    setError(null);
    setChanges(null);
    setSuccessMessage(null);

    try {
      const res = await apiPost({
        path: `/user/website/pages/${pageId}/natural-edit`,
        passedData: { instructions: instructions.trim() },
      });

      if (res.success && res.changes?.length > 0) {
        setChanges(res.changes);
      } else {
        setError(
          res.message || "Alloro couldn't find matching content to change. Try being more specific about what and where."
        );
      }
    } catch {
      setError("Connection interrupted. Check your internet and try again.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleConfirm() {
    if (!changes || !pageId || isApplying) return;

    setIsApplying(true);
    setError(null);

    try {
      const res = await apiPost({
        path: `/user/website/pages/${pageId}/natural-edit/apply`,
        passedData: { changes },
      });

      if (res.success) {
        setSuccessMessage("Changes published. Your site is updated.");
        setChanges(null);
        setInstructions("");
        onChangesApplied();
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        setError(res.message || "Changes couldn't be applied. Try again.");
      }
    } catch {
      setError("Connection interrupted. Your changes were not applied. Try again.");
    } finally {
      setIsApplying(false);
    }
  }

  function handleCancel() {
    setChanges(null);
    setError(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="space-y-3">
      {/* Input -- feels like a message, not a form */}
      {!changes && (
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What would you like to change?"
            rows={2}
            className="w-full text-sm text-[#1A1D23] bg-white border border-gray-200 rounded-xl px-4 py-3 pr-12 resize-none focus:outline-none focus:ring-2 focus:ring-[#D56753]/20 focus:border-[#D56753]/40 placeholder:text-gray-400 leading-relaxed"
            disabled={isProcessing}
          />
          <button
            onClick={handleSubmit}
            disabled={!instructions.trim() || !pageId || isProcessing}
            className="absolute right-3 bottom-3 w-8 h-8 rounded-lg bg-[#D56753] text-white flex items-center justify-center disabled:opacity-30 hover:bg-[#C45A46] transition-colors"
            title="Preview changes"
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {/* Success */}
      {successMessage && (
        <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-xl px-4 py-3">
          <Check className="h-4 w-4 shrink-0" />
          <p>{successMessage}</p>
        </div>
      )}

      {/* Preview -- plain English, not a code diff */}
      {changes && changes.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-[#1A1D23]">
              {changes.length} change{changes.length !== 1 ? "s" : ""} ready to publish
            </p>
          </div>

          <div className="divide-y divide-gray-50">
            {changes.map((change, i) => (
              <div key={i} className="px-4 py-3">
                {/* Plain English description, not a code diff */}
                <p className="text-sm text-[#1A1D23] leading-relaxed">
                  {change.description}
                </p>
                {change.confidence === "low" && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Double-check this one
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={isApplying}
              className="btn-primary btn-press inline-flex items-center gap-1.5 text-sm"
            >
              {isApplying ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Publishing...
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Publish changes
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
