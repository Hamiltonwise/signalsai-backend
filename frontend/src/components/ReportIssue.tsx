/**
 * ReportIssue -- Jo's Blue Tape. Floating feedback button for ALL users.
 *
 * Available on every page for authenticated users. Auto-captures:
 * - Current URL
 * - User role and email
 * - Viewport size
 * - Category (bug, wrong data, confusing, suggestion)
 *
 * Creates a dream_team_task with full context so the issue can be
 * reproduced and fixed without a follow-up conversation.
 *
 * This is the feedback loop that teaches the system what it missed.
 */

import { useState } from "react";
import { MessageSquarePlus, X, Send } from "lucide-react";
import { apiPost } from "@/api/index";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "react-router-dom";
import toast from "react-hot-toast";

const CATEGORIES = [
  { value: "bug", label: "Something's broken", emoji: "bug" },
  { value: "wrong_data", label: "Data looks wrong", emoji: "numbers" },
  { value: "confusing", label: "This is confusing", emoji: "question" },
  { value: "suggestion", label: "Idea / suggestion", emoji: "lightbulb" },
] as const;

export function ReportIssue() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("bug");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { userProfile } = useAuth();
  const location = useLocation();

  const handleSubmit = async () => {
    if (!description.trim()) return;
    setSubmitting(true);

    const context = {
      url: location.pathname + location.search,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      userEmail: userProfile?.email || "unknown",
      category,
      timestamp: new Date().toISOString(),
    };

    const title = `[${category.toUpperCase()}] ${description.trim().slice(0, 80)}`;
    const fullDescription = [
      description.trim(),
      "",
      "--- Auto-captured context ---",
      `Page: ${context.url}`,
      `User: ${context.userEmail}`,
      `Viewport: ${context.viewport}`,
      `Time: ${context.timestamp}`,
    ].join("\n");

    try {
      const res = await apiPost({
        path: "/admin/flag-issue",
        passedData: {
          description: fullDescription,
          title,
          category,
          blast_radius: category === "wrong_data" ? "yellow" : "green",
        },
      });
      if (res?.success) {
        toast.success("Flagged. We'll fix it.");
        setDescription("");
        setCategory("bug");
        setOpen(false);
      } else {
        toast.error(res?.error || "Failed to submit.");
      }
    } catch {
      toast.error("Failed to submit.");
    } finally {
      setSubmitting(false);
    }
  };

  // Don't render if not authenticated
  if (!userProfile) return null;

  return (
    <>
      {/* Floating button -- bottom right */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-[9990] w-12 h-12 rounded-full bg-[#212D40] text-white shadow-lg hover:bg-[#D56753] transition-all duration-200 flex items-center justify-center group"
        title="Report an issue"
      >
        <MessageSquarePlus className="h-5 w-5 group-hover:scale-110 transition-transform" />
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/50"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md mx-0 sm:mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#1A1D23]">What's wrong?</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Category selector */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold text-left transition-all ${
                    category === cat.value
                      ? "bg-[#D56753]/10 text-[#D56753] border-2 border-[#D56753]/30"
                      : "bg-gray-50 text-gray-600 border-2 border-transparent hover:bg-gray-100"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what you see. Be specific."
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-[#1A1D23] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#D56753]/30 focus:border-[#D56753] resize-none"
              rows={3}
              autoFocus
            />

            <p className="text-xs text-gray-400 mt-2">
              Auto-captures: page URL, your role, screen size, timestamp.
            </p>

            <div className="flex justify-end mt-4">
              <button
                onClick={handleSubmit}
                disabled={submitting || !description.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-[#D56753] px-5 py-2.5 text-xs font-semibold text-white hover:brightness-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="h-3.5 w-3.5" />
                {submitting ? "Sending..." : "Flag It"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
