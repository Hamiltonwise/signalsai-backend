/**
 * Help Center -- /help
 *
 * Not a knowledge base. A direct line.
 * FAQ accordion, direct contact, feedback form.
 * Replaces old Help.tsx design. T1 wires this as the /help route.
 */

import { useState } from "react";
import {
  ChevronDown,
  Mail,
  Send,
  Loader2,
  CheckCircle2,
  MessageSquare,
} from "lucide-react";

// ─── FAQ Data ───────────────────────────────────────────────────────

const FAQ: { question: string; answer: string }[] = [
  {
    question: "How does Alloro calculate my ranking?",
    answer:
      "We query Google's local search results for your specialty and city, the same way your patients search.",
  },
  {
    question: "How often does my data update?",
    answer:
      "Rankings update every Sunday night. Your dashboard reflects last week's market.",
  },
  {
    question: "What does the dollar figure mean?",
    answer:
      "It's an estimate of the revenue difference between your current position and your top competitor's position, based on average case values for your specialty.",
  },
  {
    question: "Why is my competitor wrong?",
    answer:
      "If a competitor showing up isn't one you recognize, let us know via the feedback button below. We'll look into it.",
  },
  {
    question: "How do I upload my referral data?",
    answer:
      "Go to Referral Intelligence and drag any export from your practice management software. Dentrix, Eaglesoft, and OpenDental exports all work.",
  },
];

// ─── Component ──────────────────────────────────────────────────────

export default function HelpCenter() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleFeedbackSubmit = async () => {
    if (!feedback.trim() || submitting) return;
    setSubmitting(true);
    try {
      await fetch("/api/user/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: feedback.trim() }),
      });
      setSubmitted(true);
      setFeedback("");
    } catch {
      // Silently fail -- feedback is best-effort
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#FAFAF8]">
      {/* Header */}
      <header className="bg-[#212D40] py-4 px-5">
        <div className="max-w-lg mx-auto flex items-center gap-2">
          <a href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#D56753] flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L14 14H2L8 2Z" fill="white" opacity="0.9" />
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight text-white">
              alloro
            </span>
          </a>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-5 py-12 sm:py-16 space-y-12">
        {/* Title */}
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#212D40] tracking-tight">
            Help
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Answers first. Direct line if you need it.
          </p>
        </div>

        {/* Section 1: FAQ Accordion */}
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-[#D56753] mb-3">
            Common questions
          </p>
          {FAQ.map((item, i) => {
            const isOpen = openIndex === i;
            return (
              <div
                key={i}
                className="rounded-xl border border-gray-200 bg-white overflow-hidden"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left"
                >
                  <span className="text-sm font-semibold text-[#212D40] pr-4">
                    {item.question}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-4">
                    <p className="text-sm text-slate-600 leading-relaxed">
                      {item.answer}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Section 2: Contact Corey */}
        <div className="rounded-2xl bg-[#212D40] p-6">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Mail className="w-5 h-5 text-[#D56753]" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">
                Something feel off?
              </p>
              <p className="text-sm text-white/60 leading-relaxed mt-1">
                Email corey@getalloro.com directly. I read every one.
              </p>
              <a
                href="mailto:corey@getalloro.com"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#D56753] hover:underline"
              >
                corey@getalloro.com
              </a>
            </div>
          </div>
        </div>

        {/* Section 3: Feedback */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-4 h-4 text-[#D56753]" />
            <p className="text-xs font-bold uppercase tracking-widest text-[#D56753]">
              Data feedback
            </p>
          </div>

          {submitted ? (
            <div className="flex items-center gap-3 py-4">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <p className="text-sm text-[#212D40] font-medium">
                Received. Corey will look into it.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-500 mb-3">
                Found something wrong with your data?
              </p>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Tell us what looks off..."
                className="w-full h-24 rounded-xl border border-slate-200 bg-[#FAFAF8] px-4 py-3 text-sm text-[#212D40] placeholder:text-slate-400 resize-none focus:outline-none focus:border-[#D56753] focus:ring-2 focus:ring-[#D56753]/10 transition-all"
              />
              <button
                onClick={handleFeedbackSubmit}
                disabled={!feedback.trim() || submitting}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#D56753] text-white text-sm font-semibold px-5 py-2.5 shadow-[0_4px_14px_rgba(213,103,83,0.35)] hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                Send feedback
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-slate-300">
          &copy; 2026 Alloro, Inc. Bend, Oregon.
        </p>
      </div>
    </div>
  );
}

// T1 adds /help route pointing to HelpCenter.tsx in App.tsx (replaces old Help.tsx)
// T2 registers POST /api/user/feedback (creates dream_team_task owner='Corey')
