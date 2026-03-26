/**
 * CS Agent — Floating chat widget for the doctor dashboard.
 *
 * Terracotta FAB bottom-right → opens drawer with Claude-powered
 * account-aware conversation. Session-scoped history.
 */

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2, Sparkles } from "lucide-react";
import { sendChatMessage, type ChatMessage } from "../../api/csAgent";

interface CSAgentChatProps {
  practiceName: string;
  score: number | null;
  locationId?: number | null;
}

export default function CSAgentChat({
  practiceName,
  score,
  locationId,
}: CSAgentChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const handleSend = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || sending) return;

    setInput("");
    const userMsg: ChatMessage = { role: "user", content: msg };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    try {
      const result = await sendChatMessage({
        message: msg,
        history: messages,
        locationId,
      });

      if (result.success && result.response) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: result.response! },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              result.error || "Something went wrong. Please try again.",
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Connection error. Please check your internet and try again.",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Starter prompts — contextual to their data
  const starters = [
    score != null
      ? `Why is my score ${score}?`
      : "What data do you have on my practice?",
    "Who are my top referring GPs?",
    "What should I do this week?",
  ];

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[#D56753] text-white shadow-[0_4px_20px_rgba(213,103,83,0.4)] hover:shadow-[0_6px_28px_rgba(213,103,83,0.5)] hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
          aria-label="Open chat"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}

      {/* Chat Drawer */}
      {isOpen && (
        <div className="fixed bottom-0 right-0 z-50 w-full sm:w-[400px] sm:bottom-6 sm:right-6 sm:rounded-2xl overflow-hidden border border-gray-200 bg-white shadow-[0_8px_40px_rgba(0,0,0,0.15)] flex flex-col" style={{ height: "min(600px, calc(100dvh - 48px))" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 bg-[#212D40]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#D56753] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Alloro Intelligence</p>
                <p className="text-[10px] text-white/50 uppercase tracking-wider">
                  {practiceName}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 transition-colors"
              aria-label="Close chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
          >
            {/* Empty state — starter prompts */}
            {messages.length === 0 && (
              <div className="space-y-3 pt-4">
                <p className="text-sm text-gray-500 text-center mb-4">
                  Ask me anything about {practiceName}.
                </p>
                {starters.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    disabled={sending}
                    className="w-full text-left rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-[#212D40] hover:border-[#D56753]/30 hover:bg-[#D56753]/[0.02] transition-colors disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Message bubbles */}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-[#D56753] text-white rounded-br-md"
                      : "bg-gray-100 text-[#212D40] rounded-bl-md"
                  }`}
                >
                  {msg.content.split("\n").map((line, j) => (
                    <p key={j} className={j > 0 ? "mt-2" : ""}>
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-gray-100 px-4 py-3">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your practice..."
                rows={1}
                className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-[#212D40] placeholder:text-gray-400 focus:outline-none focus:border-[#D56753] focus:ring-2 focus:ring-[#D56753]/10 max-h-24"
                style={{ minHeight: "40px" }}
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || sending}
                className="w-10 h-10 shrink-0 rounded-xl bg-[#D56753] text-white flex items-center justify-center hover:brightness-105 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="text-[10px] text-gray-300 text-center mt-2">
              Powered by Alloro Intelligence
            </p>
          </div>
        </div>
      )}
    </>
  );
}
