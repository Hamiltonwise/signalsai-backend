/**
 * ReviewRequestCard — Doctor-facing card for sending review requests to patients.
 *
 * Shows a simple email input, send button, recent history, and conversion stats.
 * Appears on the Doctor Dashboard below the referral card.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, Send, CheckCircle2, Loader2, MousePointerClick } from "lucide-react";
import {
  sendReviewRequest,
  listReviewRequests,
  type ReviewRequest,
} from "../../api/reviewRequests";

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

function statusBadge(status: ReviewRequest["status"]) {
  switch (status) {
    case "converted":
      return { label: "Review left", class: "bg-emerald-50 text-emerald-700" };
    case "clicked":
      return { label: "Link clicked", class: "bg-blue-50 text-blue-700" };
    default:
      return { label: "Sent", class: "bg-gray-50 text-gray-500" };
  }
}

export default function ReviewRequestCard({
  placeId,
  practiceName,
}: {
  placeId: string | null;
  practiceName: string;
}) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
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
  const recent = data?.requests?.slice(0, 3) || [];

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !placeId || sending) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(email.trim())) {
      setError("Enter a valid email address");
      return;
    }

    setError("");
    setSending(true);

    try {
      const result = await sendReviewRequest({
        recipientEmail: email.trim(),
        recipientName: name.trim() || undefined,
        placeId,
        practiceName,
      });

      if (result.success) {
        setSent(true);
        setEmail("");
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
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Star className="w-5 h-5 text-[#D56753]" />
          <h3 className="text-base font-bold text-[#212D40]">Get More Reviews</h3>
        </div>
        <p className="text-sm text-gray-500">
          Connect your Google Business Profile to start sending review requests.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Star className="w-5 h-5 text-[#D56753]" />
          <h3 className="text-base font-bold text-[#212D40]">Request a Review</h3>
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
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Patient name (optional)"
            className="flex-1 h-10 px-3 rounded-lg bg-gray-50 border border-gray-200 text-sm text-[#212D40] placeholder:text-gray-400 focus:outline-none focus:border-[#D56753] focus:ring-2 focus:ring-[#D56753]/10"
          />
        </div>
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            placeholder="Patient email"
            required
            className={`flex-1 h-10 px-3 rounded-lg bg-gray-50 border text-sm text-[#212D40] placeholder:text-gray-400 focus:outline-none focus:ring-2 ${
              error
                ? "border-red-400 focus:border-red-400 focus:ring-red-400/10"
                : "border-gray-200 focus:border-[#D56753] focus:ring-[#D56753]/10"
            }`}
          />
          <button
            type="submit"
            disabled={sending || !email.trim()}
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
      </form>

      {/* Recent requests */}
      {recent.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Recent</p>
          {recent.map((r) => {
            const badge = statusBadge(r.status);
            return (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  {r.status === "clicked" || r.status === "converted" ? (
                    <MousePointerClick className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  ) : (
                    <Send className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                  )}
                  <span className="text-[#212D40] truncate">
                    {r.recipient_name || r.recipient_email}
                  </span>
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
