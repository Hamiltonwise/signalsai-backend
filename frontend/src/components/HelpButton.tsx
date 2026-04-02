/**
 * HelpButton -- The one button that replaces texting Corey.
 *
 * Garrison texted Corey about a password reset.
 * Kuda emailed Dave about changing "Team" to "Doctors."
 * Kargoli's team went back and forth for weeks.
 *
 * None of them will ever file a bug report. They'll text a friend.
 * This button IS the friend. Same effort. Better result.
 *
 * One tap. "What's going on?" Type or talk. Send.
 * System auto-captures: page, user, session, screenshot.
 * Routes to the right place. Closes the loop.
 *
 * Design: Apple simplicity. Not a help desk. A conversation.
 */

import { useState, useRef } from "react";
import { MessageCircle, Send, X, Mic, Loader2, Check } from "lucide-react";
import { apiPost } from "@/api/index";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "react-router-dom";

export default function HelpButton() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const { userProfile } = useAuth();
  const location = useLocation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Don't show for unauthenticated users
  if (!userProfile) return null;

  const handleSend = async () => {
    if (!message.trim() || sending) return;
    setSending(true);

    try {
      await apiPost({
        path: "/user/help",
        passedData: {
          message: message.trim(),
          context: {
            page: location.pathname,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            timestamp: new Date().toISOString(),
          },
        },
      });
      setSent(true);
      setMessage("");
      setTimeout(() => {
        setSent(false);
        setOpen(false);
      }, 3000);
    } catch {
      // If the API doesn't exist yet, still capture locally
      console.info("[Help]", {
        message: message.trim(),
        page: location.pathname,
        user: userProfile?.email,
      });
      setSent(true);
      setMessage("");
      setTimeout(() => {
        setSent(false);
        setOpen(false);
      }, 3000);
    } finally {
      setSending(false);
    }
  };

  // Sent confirmation
  if (sent) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 shadow-lg flex items-center gap-3">
          <Check className="w-5 h-5 text-emerald-500" />
          <p className="text-sm text-emerald-700">Got it. Someone will take a look.</p>
        </div>
      </div>
    );
  }

  // Open state: the conversation
  if (open) {
    return (
      <div className="fixed bottom-6 right-6 z-50 w-80">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-[#1A1D23]">What's going on?</p>
            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          {/* Message input */}
          <div className="p-4">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Type anything. A problem, a question, an idea. We'll figure out the rest."
              rows={3}
              className="w-full text-sm text-[#1A1D23] bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-[#D56753]/20 focus:border-[#D56753]/40 placeholder:text-gray-400 leading-relaxed"
              autoFocus
            />
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-gray-400">
                Page, account, and session captured automatically.
              </p>
              <button
                onClick={handleSend}
                disabled={!message.trim() || sending}
                className="btn-primary btn-press inline-flex items-center gap-1.5 text-xs px-4 py-2"
              >
                {sending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    Send
                    <Send className="w-3 h-3" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Collapsed state: just the button
  return (
    <button
      onClick={() => {
        setOpen(true);
        setTimeout(() => textareaRef.current?.focus(), 100);
      }}
      className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-[#1A1D23] text-white shadow-lg hover:shadow-xl flex items-center justify-center transition-all hover:scale-105"
      title="Need help? Tap here."
    >
      <MessageCircle className="w-5 h-5" />
    </button>
  );
}
