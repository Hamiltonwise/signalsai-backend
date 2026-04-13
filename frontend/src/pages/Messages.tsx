import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  MessageSquare,
  Send,
  Users,
  User,
  Building2,
  FileText,
  CheckCircle2,
  Zap,
  Loader2,
} from "lucide-react";
import {
  fetchMessages,
  sendMessage,
  markAsRead,
  type Message,
} from "../api/messages";

type MessageType = "text" | "note" | "decision" | "action_item";

interface ConversationGroup {
  key: string;
  label: string;
  isTeam: boolean;
  recipientId: number | null;
  orgContextId: number | null;
  lastMessage: Message;
  unreadCount: number;
  messages: Message[];
}

const MESSAGE_TYPE_ICONS: Record<string, React.ReactNode> = {
  text: <MessageSquare size={12} />,
  note: <FileText size={12} />,
  decision: <CheckCircle2 size={12} />,
  action_item: <Zap size={12} />,
};

const MESSAGE_TYPE_LABELS: Record<string, string> = {
  text: "Message",
  note: "Note",
  decision: "Decision",
  action_item: "Action Item",
};

const MESSAGE_TYPE_COLORS: Record<string, string> = {
  text: "bg-slate-100 text-slate-600",
  note: "bg-blue-50 text-blue-600",
  decision: "bg-emerald-50 text-emerald-600",
  action_item: "bg-amber-50 text-amber-700",
};

const Messages: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [newContent, setNewContent] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("text");
  const threadEndRef = useRef<HTMLDivElement>(null);

  // Set page title
  useEffect(() => {
    document.title = "Messages | Alloro";
  }, []);

  // Load messages
  const loadMessages = useCallback(async () => {
    try {
      const res = await fetchMessages({ limit: 200 });
      if (res?.success) {
        setMessages(res.messages ?? []);
        setUnreadCount(res.unreadCount ?? 0);
        if (res.currentUserId) {
          setCurrentUserId(res.currentUserId);
        }
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + polling every 5 seconds
  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  // Group messages into conversations
  const conversations: ConversationGroup[] = React.useMemo(() => {
    const groups = new Map<string, ConversationGroup>();

    for (const msg of messages) {
      // Determine the conversation key
      let key: string;
      let label: string;
      let isTeam = false;
      let recipientId: number | null = null;
      let orgContextId: number | null = null;

      if (msg.recipient_id === null) {
        // Team-wide message, group by org context or "team"
        if (msg.org_context_id) {
          key = `org-${msg.org_context_id}`;
          label = `Client #${msg.org_context_id}`;
          orgContextId = msg.org_context_id;
        } else {
          key = "team";
          label = "Team Channel";
        }
        isTeam = true;
      } else {
        // Direct message: key is the "other" person
        const otherId =
          msg.sender_id === currentUserId
            ? msg.recipient_id
            : msg.sender_id;
        key = `dm-${otherId}`;
        label = `User #${otherId}`;
        recipientId = otherId;
      }

      const existing = groups.get(key);
      if (existing) {
        existing.messages.push(msg);
        // Track most recent
        if (new Date(msg.created_at) > new Date(existing.lastMessage.created_at)) {
          existing.lastMessage = msg;
        }
        // Count unread (not sent by me, not read)
        if (msg.sender_id !== currentUserId && !msg.read_at) {
          existing.unreadCount++;
        }
      } else {
        groups.set(key, {
          key,
          label,
          isTeam,
          recipientId,
          orgContextId,
          lastMessage: msg,
          unreadCount:
            msg.sender_id !== currentUserId && !msg.read_at ? 1 : 0,
          messages: [msg],
        });
      }
    }

    // Sort conversations by most recent message
    return Array.from(groups.values()).sort(
      (a, b) =>
        new Date(b.lastMessage.created_at).getTime() -
        new Date(a.lastMessage.created_at).getTime()
    );
  }, [messages, currentUserId]);

  // Auto-select first conversation
  useEffect(() => {
    if (!selectedConversation && conversations.length > 0) {
      setSelectedConversation(conversations[0].key);
    }
  }, [conversations, selectedConversation]);

  // Get selected conversation's messages (sorted oldest first)
  const activeConversation = conversations.find(
    (c) => c.key === selectedConversation
  );
  const threadMessages = React.useMemo(
    () =>
      activeConversation
        ? [...activeConversation.messages].sort(
            (a, b) =>
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime()
          )
        : [],
    [activeConversation]
  );

  // Scroll to bottom of thread when it changes
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadMessages]);

  // Mark unread messages as read when viewing conversation
  useEffect(() => {
    if (!activeConversation || !currentUserId) return;
    const unreadMessages = activeConversation.messages.filter(
      (m) => m.sender_id !== currentUserId && !m.read_at
    );
    for (const msg of unreadMessages) {
      markAsRead(msg.id).catch(() => {});
    }
  }, [activeConversation, currentUserId]);

  // Send handler
  const handleSend = async () => {
    if (!newContent.trim() || sending) return;

    setSending(true);
    try {
      const payload: {
        content: string;
        message_type: MessageType;
        recipient_id?: number | null;
        org_context_id?: number | null;
      } = {
        content: newContent.trim(),
        message_type: messageType,
      };

      if (activeConversation) {
        payload.recipient_id = activeConversation.recipientId;
        payload.org_context_id = activeConversation.orgContextId;
      }

      const res = await sendMessage(payload);
      if (res?.success) {
        setNewContent("");
        await loadMessages();
      }
    } catch (err) {
      console.error("Failed to send message:", err);
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

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-alloro-orange" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col">
      {/* Header */}
      <div className="px-8 py-6 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-alloro-navy/5 rounded-xl">
              <MessageSquare className="w-5 h-5 text-alloro-navy" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-alloro-navy font-heading tracking-tight">
                Messages
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                {unreadCount > 0
                  ? `${unreadCount} unread`
                  : "All caught up"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main content: two-panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel: conversation list */}
        <div className="w-80 border-r border-slate-100 flex flex-col bg-slate-50/50">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-[0.2em]">
              Conversations
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="p-6 text-center">
                <MessageSquare className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                <p className="text-sm text-slate-400">No messages yet</p>
                <p className="text-xs text-slate-300 mt-1">
                  Start a conversation with your team
                </p>
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.key}
                  onClick={() => setSelectedConversation(conv.key)}
                  className={`w-full px-4 py-3.5 text-left transition-colors border-b border-slate-100/50 ${
                    selectedConversation === conv.key
                      ? "bg-white shadow-sm"
                      : "hover:bg-white/60"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2 rounded-lg mt-0.5 ${
                        conv.isTeam
                          ? "bg-alloro-navy/5 text-alloro-navy"
                          : "bg-alloro-orange/10 text-alloro-orange"
                      }`}
                    >
                      {conv.isTeam ? (
                        conv.orgContextId ? (
                          <Building2 size={14} />
                        ) : (
                          <Users size={14} />
                        )
                      ) : (
                        <User size={14} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-semibold text-alloro-navy truncate">
                          {conv.label}
                        </span>
                        {conv.unreadCount > 0 && (
                          <span className="ml-2 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-alloro-orange text-white text-[9px] font-semibold px-1">
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 truncate mt-0.5">
                        {conv.lastMessage.content}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold ${
                            MESSAGE_TYPE_COLORS[conv.lastMessage.message_type]
                          }`}
                        >
                          {MESSAGE_TYPE_ICONS[conv.lastMessage.message_type]}
                          {MESSAGE_TYPE_LABELS[conv.lastMessage.message_type]}
                        </span>
                        <span className="text-xs text-slate-300">
                          {formatTime(conv.lastMessage.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right panel: message thread */}
        <div className="flex-1 flex flex-col bg-white">
          {activeConversation ? (
            <>
              {/* Thread header */}
              <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg ${
                    activeConversation.isTeam
                      ? "bg-alloro-navy/5 text-alloro-navy"
                      : "bg-alloro-orange/10 text-alloro-orange"
                  }`}
                >
                  {activeConversation.isTeam ? (
                    activeConversation.orgContextId ? (
                      <Building2 size={16} />
                    ) : (
                      <Users size={16} />
                    )
                  ) : (
                    <User size={16} />
                  )}
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-alloro-navy">
                    {activeConversation.label}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {activeConversation.messages.length} message
                    {activeConversation.messages.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {threadMessages.map((msg) => {
                  const isMine = msg.sender_id === currentUserId;
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                          isMine
                            ? "bg-alloro-navy text-white"
                            : "bg-slate-100 text-alloro-navy"
                        }`}
                      >
                        {!isMine && (
                          <p className="text-xs font-semibold opacity-50 mb-1">
                            User #{msg.sender_id}
                          </p>
                        )}
                        {msg.message_type !== "text" && (
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold mb-2 ${
                              isMine
                                ? "bg-white/20 text-white/80"
                                : MESSAGE_TYPE_COLORS[msg.message_type]
                            }`}
                          >
                            {MESSAGE_TYPE_ICONS[msg.message_type]}
                            {MESSAGE_TYPE_LABELS[msg.message_type]}
                          </span>
                        )}
                        <p className="text-[13px] leading-relaxed whitespace-pre-wrap">
                          {msg.content}
                        </p>
                        <p
                          className={`text-xs mt-1.5 ${
                            isMine ? "text-white/40" : "text-slate-300"
                          }`}
                        >
                          {formatTime(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={threadEndRef} />
              </div>

              {/* Input */}
              <div className="px-6 py-4 border-t border-slate-100">
                {/* Message type selector */}
                <div className="flex items-center gap-1.5 mb-2">
                  {(
                    ["text", "note", "decision", "action_item"] as const
                  ).map((type) => (
                    <button
                      key={type}
                      onClick={() => setMessageType(type)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-colors ${
                        messageType === type
                          ? "bg-alloro-navy text-white"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                    >
                      {MESSAGE_TYPE_ICONS[type]}
                      {MESSAGE_TYPE_LABELS[type]}
                    </button>
                  ))}
                </div>
                <div className="flex items-end gap-3">
                  <textarea
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    rows={1}
                    className="flex-1 resize-none border border-slate-200 rounded-xl px-4 py-3 text-[13px] text-alloro-navy placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-alloro-orange/20 focus:border-alloro-orange transition-all"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!newContent.trim() || sending}
                    className="p-3 bg-alloro-orange text-white rounded-xl hover:bg-alloro-orange/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    {sending ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Send size={18} />
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                <p className="text-sm text-slate-400 font-medium">
                  Select a conversation or start a new one
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Messages;
