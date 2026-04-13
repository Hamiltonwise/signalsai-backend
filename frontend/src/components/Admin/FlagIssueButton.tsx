/**
 * FlagIssueButton -- quick bug/issue reporter for admin users.
 * Creates a dream_team_task with priority "normal" and owner "Corey".
 * Replaces verbal bug reports.
 */

import { useState } from "react";
import { Bug, X, Send } from "lucide-react";
import { apiPost } from "@/api/index";
import toast from "react-hot-toast";

export function FlagIssueButton() {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!description.trim()) return;
    setSubmitting(true);
    try {
      const res = await apiPost({
        path: "/admin/flag-issue",
        passedData: { description: description.trim() },
      });
      if (res?.success) {
        toast.success("Issue flagged. Task created.");
        setDescription("");
        setOpen(false);
      } else {
        toast.error(res?.error || "Failed to flag issue.");
      }
    } catch {
      toast.error("Failed to flag issue.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        title="Flag an issue"
      >
        <Bug className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Flag Issue</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={() => setOpen(false)}>
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#1A1D23] uppercase tracking-wider">Flag an Issue</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's broken or wrong? Be specific."
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-[#1A1D23] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#D56753]/30 focus:border-[#D56753] resize-none"
              rows={4}
              autoFocus
            />

            <p className="text-xs text-gray-400 mt-2">
              Creates a task assigned to Corey. Paste a screenshot URL if you have one.
            </p>

            <div className="flex justify-end mt-4">
              <button
                onClick={handleSubmit}
                disabled={submitting || !description.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#D56753] px-4 py-2 text-xs font-semibold text-white hover:brightness-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="h-3 w-3" />
                {submitting ? "Sending..." : "Flag It"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
