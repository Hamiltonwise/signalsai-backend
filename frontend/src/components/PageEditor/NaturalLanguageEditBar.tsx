/**
 * Natural Language Edit Bar
 *
 * Allows practice owners to type plain-English edit instructions.
 * Sends to Claude API, shows a diff preview, applies on confirm.
 * WO-45: The Kuda Problem solved.
 */

import { useState, useRef } from "react";
import { Sparkles, Loader2, Check, X, AlertTriangle, ChevronRight } from "lucide-react";
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
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
          res.message || "No matching content found. Try being more specific."
        );
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
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
        setSuccessMessage(res.message);
        setChanges(null);
        setInstructions("");
        onChangesApplied();
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        setError(res.message || "Failed to apply changes.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to apply changes.");
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
    <div className="border-b border-gray-200 bg-gray-50">
      {/* Input Bar */}
      <div className="px-4 py-2.5 flex items-start gap-3">
        <div className="shrink-0 mt-1.5">
          <Sparkles className="h-4 w-4 text-[#D56753]" />
        </div>
        <div className="flex-1 min-w-0">
          <textarea
            ref={inputRef}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tell us what to change. Example: 'Change Team to Doctors everywhere. Add CareCredit as a financing option.' We'll show you a preview before anything goes live."
            rows={1}
            className="w-full text-sm text-gray-800 bg-white border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-[#D56753]/30 focus:border-[#D56753]/40 placeholder:text-gray-400"
            disabled={isProcessing || !!changes}
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={!instructions.trim() || !pageId || isProcessing || !!changes}
          className="shrink-0 mt-0.5 px-3 py-2 text-xs font-semibold text-white bg-[#D56753] rounded-lg hover:bg-[#C25544] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              Preview changes
              <ChevronRight className="h-3 w-3" />
            </>
          )}
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="px-4 pb-2.5 flex items-center gap-2 text-xs text-red-600">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {error}
        </div>
      )}

      {/* Success message */}
      {successMessage && (
        <div className="px-4 pb-2.5 flex items-center gap-2 text-xs text-green-600">
          <Check className="h-3 w-3 shrink-0" />
          {successMessage}
        </div>
      )}

      {/* Diff Preview */}
      {changes && changes.length > 0 && (
        <div className="border-t border-gray-200 bg-white">
          <div className="px-4 py-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700">
              {changes.length} change{changes.length !== 1 ? "s" : ""} found.
              Review before applying:
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCancel}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={isApplying}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-[#D56753] rounded-md hover:bg-[#C25544] disabled:opacity-40 transition-colors flex items-center gap-1.5"
              >
                {isApplying ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    <Check className="h-3 w-3" />
                    Confirm all changes
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
            {changes.map((change, i) => (
              <div key={i} className="px-4 py-2.5">
                <div className="flex items-start gap-2 mb-1.5">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wider mt-0.5">
                    {change.section}
                  </span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      change.changeType === "replace"
                        ? "bg-blue-50 text-blue-600"
                        : change.changeType === "add"
                          ? "bg-green-50 text-green-600"
                          : "bg-red-50 text-red-600"
                    }`}
                  >
                    {change.changeType}
                  </span>
                  {change.confidence === "low" && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium flex items-center gap-0.5">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      Review this one
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-600 mb-1.5">{change.description}</p>
                {change.changeType !== "add" && change.oldContent && (
                  <div className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded font-mono whitespace-pre-wrap break-all mb-1">
                    <X className="h-2.5 w-2.5 inline mr-1 opacity-50" />
                    {truncateContent(change.oldContent)}
                  </div>
                )}
                {change.changeType !== "remove" && change.newContent && (
                  <div className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded font-mono whitespace-pre-wrap break-all">
                    <Check className="h-2.5 w-2.5 inline mr-1 opacity-50" />
                    {truncateContent(change.newContent)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function truncateContent(content: string, maxLen = 200): string {
  // Strip HTML tags for display
  const text = content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + "...";
}
