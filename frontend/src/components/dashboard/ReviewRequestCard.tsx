/**
 * ReviewRequestCard — Doctor-facing card for sending review requests.
 *
 * Supports email and SMS delivery. Shows toggle, patient input,
 * recent history with status badges, and conversion stats.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Star,
  Send,
  CheckCircle2,
  Loader2,
  MousePointerClick,
  Mail,
  Phone,
} from "lucide-react";
import {
  sendReviewRequest,
  listReviewRequests,
  type ReviewRequest,
} from "../../api/reviewRequests";
import { TailorText } from "../TailorText";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function statusBadge(r: ReviewRequest) {
  switch (r.status) {
    case "converted":
      return { label: "Review left", class: "bg-emerald-50 text-emerald-700" };
    case "clicked":
      return { label: "Link clicked", class: "bg-blue-50 text-blue-700" };
    default:
      return { label: "Sent", class: "bg-gray-50 text-gray-500" };
  }
}

function deliveryIcon(method: "email" | "sms") {
  return method === "sms" ? (
    <Phone className="w-3 h-3 text-gray-400" />
  ) : (
    <Mail className="w-3 h-3 text-gray-400" />
  );
}

export default function ReviewRequestCard({
  placeId,
  practiceName,
}: {
  placeId: string | null;
  practiceName: string;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"email" | "sms">("email");
  const [contact, setContact] = useState("");
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const { data } = useQuery({
    queryKey: ["review-requests"],
    queryFn: () => listReviewRequests({ limit: 5 }),
    staleTime: 30_000,
  });

  const stats = data?.stats;
  const smsConfigured = data?.smsConfigured ?? false;
  const recent = data?.requests?.slice(0, 5) || [];

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact.trim() || !placeId || sending) return;

    // Validate
    if (mode === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact.trim())) {
        setError("Enter a valid email address");
        return;
      }
    } else {
      const cleaned = contact.replace(/[\s()-]/g, "");
      if (!/^\+?[1-9]\d{6,14}$/.test(cleaned)) {
        setError("Enter a valid phone number (e.g. +12025551234)");
        return;
      }
    }

    setError("");
    setSending(true);

    try {
      const result = await sendReviewRequest({
        recipientEmail: mode === "email" ? contact.trim() : undefined,
        recipientPhone: mode === "sms" ? contact.replace(/[\s()-]/g, "").trim() : undefined,
        recipientName: name.trim() || undefined,
        placeId,
        practiceName,
      });

      if (result.success) {
        setSent(true);
        setContact("");
        setName("");
        queryClient.invalidateQueries({ queryKey: ["review-requests"] });
        setTimeout(() => setSent(false), 3000);
      } else {
        setError(result.error || "Failed to send");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setSending(false);
    }
  };

  if (!placeId) {
    return (
      <div className="card-supporting">
        <div className="flex items-center gap-2 mb-2">
          <Star className="w-5 h-5 text-[#D56753]" />
          <TailorText editKey="dashboard.reviews.title" defaultText="Get More Reviews" as="h3" className="text-base font-bold text-[#212D40]" />
        </div>
        <p className="text-sm text-gray-500">
          <TailorText editKey="dashboard.reviews.connect" defaultText="Connect your Google Business Profile to start sending review requests." as="span" className="" />
        </p>
      </div>
    );
  }

  return (
    <div className="card-supporting">
      {/* Header + stats */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Star className="w-5 h-5 text-[#D56753]" />
          <TailorText editKey="dashboard.reviews.request" defaultText="Request a Review" as="h3" className="text-base font-bold text-[#212D40]" />
        </div>
        {stats && stats.total > 0 && (
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span>{stats.total} sent</span>
            <span>{stats.clicked} clicked</span>
            <span className="text-emerald-600 font-medium">{stats.converted} reviews</span>
          </div>
        )}
      </div>

      {/* Send form */}
      <form onSubmit={handleSend} className="space-y-3">
        {/* Client name */}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Client name (optional)"
          className="w-full h-10 px-3 rounded-lg bg-gray-50 border border-gray-200 text-sm text-[#212D40] placeholder:text-gray-400 focus:outline-none focus:border-[#D56753] focus:ring-2 focus:ring-[#D56753]/10"
        />

        {/* Email / SMS toggle + contact input */}
        <div className="flex gap-2">
          {/* Mode toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden shrink-0">
            <button
              type="button"
              onClick={() => { setMode("email"); setContact(""); setError(""); }}
              className={`flex items-center gap-1 px-2.5 py-2 text-xs font-medium transition-colors ${
                mode === "email"
                  ? "bg-[#D56753] text-white"
                  : "bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              Email
            </button>
            <button
              type="button"
              onClick={() => { setMode("sms"); setContact(""); setError(""); }}
              className={`flex items-center gap-1 px-2.5 py-2 text-xs font-medium transition-colors ${
                mode === "sms"
                  ? "bg-[#D56753] text-white"
                  : "bg-white text-gray-500 hover:bg-gray-50"
              }${!smsConfigured ? " opacity-50" : ""}`}
              title={!smsConfigured ? "SMS not configured — add Twilio credentials" : ""}
            >
              <Phone className="w-3.5 h-3.5" />
              SMS
            </button>
          </div>

          {/* Contact input */}
          <input
            type={mode === "email" ? "email" : "tel"}
            value={contact}
            onChange={(e) => { setContact(e.target.value); setError(""); }}
            placeholder={mode === "email" ? "client@email.com" : "+1 (202) 555-1234"}
            required
            className={`flex-1 h-10 px-3 rounded-lg bg-gray-50 border text-sm text-[#212D40] placeholder:text-gray-400 focus:outline-none focus:ring-2 ${
              error
                ? "border-red-400 focus:border-red-400 focus:ring-red-400/10"
                : "border-gray-200 focus:border-[#D56753] focus:ring-[#D56753]/10"
            }`}
          />

          {/* Send button */}
          <button
            type="submit"
            disabled={sending || !contact.trim() || (mode === "sms" && !smsConfigured)}
            className="h-10 px-4 rounded-lg bg-[#D56753] text-white text-sm font-semibold flex items-center gap-1.5 hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : sent ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {sent ? "Sent!" : "Send"}
          </button>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}
        {mode === "sms" && !smsConfigured && (
          <p className="text-xs text-amber-500">
            SMS requires Twilio configuration. Contact your admin to enable.
          </p>
        )}
      </form>

      {/* Recent requests */}
      {recent.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Recent</p>
          {recent.map((r) => {
            const badge = statusBadge(r);
            return (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  {r.status === "clicked" || r.status === "converted" ? (
                    <MousePointerClick className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  ) : (
                    <Send className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                  )}
                  <span className="text-[#212D40] truncate">
                    {r.recipient_name || r.recipient_email || r.recipient_phone}
                  </span>
                  {deliveryIcon(r.delivery_method)}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.class}`}>
                    {badge.label}
                  </span>
                  <span className="text-xs text-gray-400">{timeAgo(r.sent_at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
