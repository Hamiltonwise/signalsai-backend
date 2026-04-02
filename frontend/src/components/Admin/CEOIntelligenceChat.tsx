/**
 * CEO Intelligence Chat -- "The Conversation"
 *
 * Floating chat panel for the VisionaryView dashboard.
 * Full organizational context: revenue, agents, clients, competitive intel.
 * This is the Limitless pill. Drop an article, ask a question, get the answer
 * with full context of everything Alloro knows.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, X, Send, Loader2, Brain } from "lucide-react";
import { sendCEOChatMessage, type ChatMessage } from "@/api/ceoChat";

const STARTER_PROMPTS = [
  "What should I focus on this week?",
  "Which client needs attention most?",
  "What would Hormozi change about our funnel?",
  "Show me the biggest revenue risk right now.",
];

export default function CEOIntelligenceChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSend = useCallback(async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || sending) return;

    setInput("");
    const userMsg: ChatMessage = { role: "user", content: msg };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    try {
      const result = await sendCEOChatMessage({
        message: msg,
        history: messages,
      });

      if (result.success && result.response) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: result.response! },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: result.error || "Something went wrong. Try again." },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Connection lost. Try again." },
      ]);
    } finally {
      setSending(false);
    }
  }, [input, sending, messages]);

  return (
    <>
      {/* FAB -- bottom left to avoid conflict with CS Agent on right */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 left-6 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#212D40] text-white shadow-lg shadow-[#212D40]/30 hover:shadow-xl hover:scale-[1.02] transition-all group"
        >
          <Brain className="h-5 w-5 text-[#D56753] group-hover:animate-pulse" />
          <span className="text-sm font-bold">The Conversation</span>
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-6 left-6 z-50 w-[440px] max-h-[600px] rounded-2xl bg-white border border-gray-200 shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 bg-[#212D40] text-white">
            <div className="flex items-center gap-3">
              <Brain className="h-5 w-5 text-[#D56753]" />
              <div>
                <p className="text-sm font-bold">The Conversation</p>
                <p className="text-xs text-white/50">Full organizational intelligence</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-[300px]">
            {messages.length === 0 ? (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <Sparkles className="h-8 w-8 text-[#D56753]/30 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Ask anything about the business. I have context on every client, every agent, every metric, and every framework in the Alloro playbook.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {STARTER_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => handleSend(prompt)}
                      className="text-left text-xs text-gray-600 px-3 py-2.5 rounded-xl border border-gray-200 hover:border-[#D56753]/30 hover:bg-[#D56753]/[0.02] transition-all"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-[#212D40] text-white rounded-br-md"
                        : "bg-gray-100 text-[#212D40] rounded-bl-md"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))
            )}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 px-4 py-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask anything about the business..."
                rows={1}
                className="flex-1 resize-none text-sm text-[#212D40] placeholder:text-gray-400 bg-transparent outline-none min-h-[36px] max-h-[120px]"
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || sending}
                className="shrink-0 p-2 rounded-xl bg-[#D56753] text-white disabled:opacity-40 hover:brightness-105 transition-all"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
