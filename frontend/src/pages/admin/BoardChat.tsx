/**
 * The Board -- Role-Based Advisory Chat (full page)
 */

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Brain, Sparkles } from "lucide-react";
import { sendCEOChatMessage, type ChatMessage } from "@/api/ceoChat";
import { useAuth } from "@/hooks/useAuth";

interface RoleConfig {
  subtitle: string;
  greeting: string;
  description: string;
  starters: string[];
}

const ROLE_CONFIGS: Record<string, RoleConfig> = {
  visionary: {
    subtitle: "Your advisory board, trained on the best",
    greeting: "Ask your board anything.",
    description: "Hormozi on pricing. Bezos on strategy. Musk on simplification. All of them see your live data.",
    starters: [
      "What should I focus on this week?",
      "What would Hormozi change about our pricing?",
      "What's the fastest path to 3 paying customers?",
      "Show me revenue risks right now",
    ],
  },
  integrator: {
    subtitle: "Your operations concierge",
    greeting: "What needs attention?",
    description: "Flag issues, check on clients, manage tasks. I'll route everything to the right person.",
    starters: [
      "Show me all clients at risk",
      "Flag a bug: the rankings page looks off",
      "What happened with Garrison this week?",
      "What action items came from the last call?",
    ],
  },
  build: {
    subtitle: "Your technical concierge",
    greeting: "What needs fixing?",
    description: "Report issues, check system status, review deploy queue. I'll create tasks and route them.",
    starters: [
      "What's the system health right now?",
      "Show me recent deploy errors",
      "Flag a bug: Redis keeps disconnecting",
      "What's queued for the next deploy?",
    ],
  },
  // DentalEMR partner roles
  dentalemr_ceo: {
    subtitle: "Your business intelligence partner",
    greeting: "What do you need to know?",
    description: "Website traffic, ChatGPT rankings, competitor moves, email performance. Intelligence that arrives before you ask.",
    starters: [
      "What happened to our website traffic this week?",
      "Are we still #1 in ChatGPT for endodontic software?",
      "Draft the next AAE follow-up email in my voice",
      "What is TDO doing that we should know about?",
    ],
  },
  dentalemr_sales: {
    subtitle: "Your sales co-pilot",
    greeting: "Who are you meeting with today?",
    description: "Prospect research, demo prep, follow-up drafts, objection handling. Know more than the prospect before the call.",
    starters: [
      "What should I know about my next demo?",
      "Draft a follow-up for a prospect who went quiet",
      "What are the top objections TDO users have about switching?",
      "Which prospects from AAE haven't booked a demo yet?",
    ],
  },
  dentalemr_support: {
    subtitle: "Your support co-pilot",
    greeting: "What needs attention?",
    description: "Client health, onboarding status, common issues, response drafts. The ground truth on what the product does.",
    starters: [
      "Which clients haven't logged in this week?",
      "Draft a response about our recall system capabilities",
      "What's the status of new client onboarding?",
      "What features are native vs. through partners?",
    ],
  },
};

function getUserRole(email: string): string {
  const lower = (email || "").toLowerCase();
  // DentalEMR partner roles
  if (lower.endsWith("@dentalemr.com")) {
    const prefix = lower.split("@")[0];
    if (prefix === "merideth") return "dentalemr_ceo";
    if (prefix === "jay") return "dentalemr_sales";
    if (prefix === "rosanna") return "dentalemr_support";
    return "dentalemr_ceo"; // fallback for other DentalEMR emails
  }
  // Internal Alloro roles
  if (lower.includes("jordan") || lower.includes("jo@")) return "integrator";
  if (lower.includes("dave") || lower.includes("rustine")) return "build";
  return "visionary";
}

export default function BoardChat() {
  const { userProfile } = useAuth();
  const role = getUserRole(userProfile?.email || "");
  const config = ROLE_CONFIGS[role] || ROLE_CONFIGS.visionary;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { scrollRef.current && (scrollRef.current.scrollTop = scrollRef.current.scrollHeight); }, [messages]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSend = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || sending) return;
    setMessages(prev => [...prev, { role: "user", content: msg }]);
    setInput("");
    setSending(true);
    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const res = await sendCEOChatMessage({ message: msg, history });
      if (res.success && res.response) {
        setMessages(prev => [...prev, { role: "assistant" as const, content: res.response! }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant" as const, content: "Connection error. Try again." }]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="min-h-screen bg-alloro-bg font-body">
      <header className="glass-header border-b border-black/5 lg:sticky lg:top-0 z-40">
        <div className="max-w-3xl mx-auto px-6 lg:px-10 py-6 flex items-center gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-alloro-orange to-orange-600 text-white rounded-xl flex items-center justify-center shadow-lg">
            <Brain size={20} />
          </div>
          <div className="flex flex-col text-left">
            <h1 className="text-[11px] font-black font-heading text-alloro-textDark uppercase tracking-[0.25em] leading-none">The Board</h1>
            <span className="text-[9px] font-bold text-alloro-textDark/40 uppercase tracking-widest mt-1.5">{config.subtitle}</span>
          </div>
        </div>
      </header>
      <div className="max-w-3xl mx-auto px-6 lg:px-10">
        <div ref={scrollRef} className="py-8 space-y-6 min-h-[60vh]">
          {messages.length === 0 && (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-alloro-orange/10 rounded-2xl flex items-center justify-center mx-auto mb-6"><Sparkles className="w-8 h-8 text-alloro-orange" /></div>
              <h2 className="text-xl font-black text-alloro-textDark tracking-tight mb-2">{config.greeting}</h2>
              <p className="text-sm text-slate-500 max-w-md mx-auto mb-8">{config.description}</p>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg mx-auto">
                {config.starters.map(p => (
                  <button key={p} onClick={() => handleSend(p)} className="text-xs px-4 py-2.5 rounded-xl border border-slate-200 text-alloro-textDark/70 hover:border-alloro-orange/40 hover:text-alloro-orange hover:bg-alloro-orange/5 transition-all">{p}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-5 py-4 ${msg.role === "user" ? "bg-alloro-navy text-white" : "bg-white border border-black/5 shadow-sm text-alloro-textDark"}`}>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start"><div className="bg-white border border-black/5 shadow-sm rounded-2xl px-5 py-4"><Loader2 className="w-4 h-4 text-alloro-orange animate-spin" /></div></div>
          )}
        </div>
        <div className="sticky bottom-0 bg-alloro-bg pb-6 pt-2">
          <div className="flex items-end gap-3 bg-white rounded-2xl border border-black/5 shadow-premium p-3">
            <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder="Ask your board..." rows={1} className="flex-1 resize-none text-sm text-alloro-textDark placeholder:text-slate-400 bg-transparent outline-none max-h-32" />
            <button onClick={() => handleSend()} disabled={!input.trim() || sending} className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-alloro-orange text-white disabled:opacity-30 hover:brightness-110 transition-all"><Send size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
