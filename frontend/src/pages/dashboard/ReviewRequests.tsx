/**
 * Review Requests — /dashboard/reviews
 *
 * How a doctor sends review requests to patients after appointments.
 * Three sections: Send, Sent Today, Review Velocity.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Send,
  Mail,
  Phone,
  CheckCircle2,
  Loader2,
  Star,
  MousePointerClick,
} from "lucide-react";
import {
  sendReviewRequest,
  listReviewRequests,
  type ReviewRequest,
} from "@/api/reviewRequests";
import { apiGet, apiPatch } from "@/api/index";
import { useAuth } from "@/hooks/useAuth";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function statusLabel(s: ReviewRequest["status"]) {
  if (s === "converted") return { text: "Reviewed", color: "text-emerald-700 bg-emerald-50" };
  if (s === "clicked") return { text: "Opened", color: "text-blue-700 bg-blue-50" };
  return { text: "Sent", color: "text-gray-500 bg-gray-100" };
}

export default function ReviewRequests() {
  const { userProfile } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"email" | "sms">("email");
  const [contact, setContact] = useState("");
  const [patientName, setPatientName] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const { data } = useQuery({
    queryKey: ["review-requests"],
    queryFn: () => listReviewRequests({ limit: 20 }),
    staleTime: 30_000,
  });

  const requests = data?.requests || [];
  const stats = data?.stats;
  const todayRequests = requests.filter((r) => {
    const d = new Date(r.sent_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });

  // Simple velocity: total reviews converted / weeks since first request
  const totalConverted = stats?.converted || 0;
  const firstReq = requests.length > 0 ? requests[requests.length - 1] : null;
  const weeksSinceFirst = firstReq
    ? Math.max(1, Math.round((Date.now() - new Date(firstReq.sent_at).getTime()) / (7 * 86_400_000)))
    : 0;
  const rawVelocity = weeksSinceFirst > 0 ? (totalConverted / weeksSinceFirst) : 0;
  const velocity = Number.isFinite(rawVelocity) ? rawVelocity : 0;

  const handleSend = async () => {
    if (!contact.trim() || sending) return;

    if (tab === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact.trim())) {
      setError("Enter a valid email address");
      return;
    }
    if (tab === "sms" && !/^\+?[1-9]\d{6,14}$/.test(contact.replace(/[\s()-]/g, ""))) {
      setError("Enter a valid phone number");
      return;
    }

    setError("");
    setSending(true);

    try {
      const result = await sendReviewRequest({
        recipientEmail: tab === "email" ? contact.trim() : undefined,
        recipientPhone: tab === "sms" ? contact.replace(/[\s()-]/g, "").trim() : undefined,
        recipientName: patientName.trim() || undefined,
        placeId: "default", // Will use org's placeId from backend
        practiceName: userProfile?.practiceName || "Your Practice",
      });

      if (result.success) {
        setSent(true);
        setContact("");
        setPatientName("");
        queryClient.invalidateQueries({ queryKey: ["review-requests"] });
        setTimeout(() => setSent(false), 3000);
      } else {
        setError(result.error || "Failed to send");
      }
    } catch {
      setError("We couldn't send that request. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8 space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-[#212D40]">Review Requests</h1>
        <p className="text-sm text-gray-500 mt-0.5">Send patients a direct link to leave a Google review.</p>
      </div>

      {/* Section 1: Send */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <Star className="h-5 w-5 text-[#D56753]" />
          <h2 className="text-sm font-bold text-[#212D40]">Send a request</h2>
        </div>

        {/* Tab toggle */}
        <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1 mb-4 w-fit">
          <button
            onClick={() => { setTab("email"); setContact(""); setError(""); }}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              tab === "email" ? "bg-white text-[#212D40] shadow-sm" : "text-gray-500"
            }`}
          >
            <Mail className="h-3.5 w-3.5" />
            Send via email
          </button>
          <button
            onClick={() => { setTab("sms"); setContact(""); setError(""); }}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              tab === "sms" ? "bg-white text-[#212D40] shadow-sm" : "text-gray-500"
            }`}
          >
            <Phone className="h-3.5 w-3.5" />
            Send via SMS
          </button>
        </div>

        <div className="space-y-3">
          <input
            type="text"
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            placeholder="Patient name (optional)"
            className="w-full h-10 px-3 rounded-lg bg-gray-50 border border-gray-200 text-sm text-[#212D40] placeholder:text-gray-400 focus:outline-none focus:border-[#D56753] focus:ring-2 focus:ring-[#D56753]/10"
          />
          <div className="flex gap-2">
            <input
              type={tab === "email" ? "email" : "tel"}
              value={contact}
              onChange={(e) => { setContact(e.target.value); setError(""); }}
              placeholder={tab === "email" ? "patient@email.com" : "+1 (202) 555-1234"}
              className={`flex-1 h-10 px-3 rounded-lg bg-gray-50 border text-sm text-[#212D40] placeholder:text-gray-400 focus:outline-none focus:ring-2 ${
                error ? "border-red-400 focus:ring-red-400/10" : "border-gray-200 focus:border-[#D56753] focus:ring-[#D56753]/10"
              }`}
            />
            <button
              onClick={handleSend}
              disabled={!contact.trim() || sending}
              className="h-10 px-4 rounded-lg bg-[#D56753] text-white text-sm font-semibold flex items-center gap-1.5 hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : sent ? <CheckCircle2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              {sent ? "Sent!" : "Send review request"}
            </button>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <p className="text-[10px] text-gray-400">Up to 20 requests per day</p>
        </div>
      </div>

      {/* Section 2: Sent Today */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-bold text-[#212D40] mb-4">Sent today</h2>
        {todayRequests.length === 0 ? (
          <p className="text-sm text-gray-400">No requests sent today. Start by sending one above.</p>
        ) : (
          <div className="space-y-2">
            {todayRequests.map((r) => {
              const badge = statusLabel(r.status);
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
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.color}`}>
                      {badge.text}
                    </span>
                    <span className="text-xs text-gray-400">{timeAgo(r.sent_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 3: Review Velocity */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-bold text-[#212D40] mb-3">Review velocity</h2>
        {velocity > 0 ? (
          <>
            <p className="text-3xl font-black text-[#212D40]">
              {velocity.toFixed(1)} <span className="text-base font-medium text-gray-400">per week</span>
            </p>
            <p className="text-sm text-gray-500 mt-2">
              You've earned {totalConverted} review{totalConverted !== 1 ? "s" : ""} so far at ~{velocity.toFixed(1)}/week.
            </p>
          </>
        ) : (
          <>
            <p className="text-3xl font-black text-gray-300">0</p>
            <p className="text-sm text-gray-400 mt-2">
              Send your first request above to start tracking.
            </p>
          </>
        )}
      </div>

      {/* Section 4: Review Response Drafts (WO-49) */}
      <ReviewDraftsSection />
    </div>
  );
}

// ─── Review Response Drafts (WO-49) ─────────────────────────────────

interface ReviewNotification {
  id: string;
  reviewer_name: string;
  star_rating: number;
  review_text: string;
  ai_response: string | null;
  status: string;
  review_published_at: string | null;
  created_at: string;
}

function ReviewDraftsSection() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["review-drafts"],
    queryFn: async () => {
      const res = await apiGet({ path: "/user/review-drafts" });
      return res?.success ? res.reviews : [];
    },
    staleTime: 5 * 60_000,
  });

  const reviews: ReviewNotification[] = (data || []).filter(
    (r: ReviewNotification) => r.status === "new" && r.ai_response
  );

  if (reviews.length === 0) return null;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-bold text-[#212D40]">Review responses ready</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Alloro drafted responses for your recent reviews. Approve, edit, or skip.
        </p>
      </div>
      {reviews.map((review) => (
        <ReviewDraftCard
          key={review.id}
          review={review}
          onUpdate={() => queryClient.invalidateQueries({ queryKey: ["review-drafts"] })}
        />
      ))}
    </div>
  );
}

function ReviewDraftCard({
  review,
  onUpdate,
}: {
  review: ReviewNotification;
  onUpdate: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedResponse, setEditedResponse] = useState(review.ai_response || "");
  const [acting, setActing] = useState(false);

  const stars = "★".repeat(review.star_rating) + "☆".repeat(5 - review.star_rating);
  const isLowRating = review.star_rating <= 2;

  async function handleAction(action: "approve" | "skip") {
    setActing(true);
    try {
      await apiPatch({
        path: `/user/review-drafts/${review.id}`,
        passedData: { action, editedResponse: isEditing ? editedResponse : undefined },
      });
      onUpdate();
    } catch {
      // fail silently
    } finally {
      setActing(false);
    }
  }

  // Low-rating reviews: no auto-draft, needs personal response
  if (isLowRating) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm text-amber-500">{stars}</span>
              <span className="text-sm font-semibold text-[#212D40]">{review.reviewer_name}</span>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">{review.review_text}</p>
            <p className="text-xs text-red-600 mt-2 font-medium">
              This review needs a personal response. Auto-draft is not recommended for {review.star_rating}-star reviews.
            </p>
          </div>
          <button
            onClick={() => handleAction("skip")}
            className="text-xs text-gray-400 hover:text-gray-600 shrink-0"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      {/* Review header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm text-amber-500">{stars}</span>
            <span className="text-sm font-semibold text-[#212D40]">{review.reviewer_name}</span>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">{review.review_text}</p>
        </div>
      </div>

      {/* Draft response */}
      <div className="bg-gray-50 rounded-lg p-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
          Draft response
        </p>
        {isEditing ? (
          <textarea
            value={editedResponse}
            onChange={(e) => setEditedResponse(e.target.value)}
            rows={3}
            className="w-full text-sm text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-[#D56753]/30"
          />
        ) : (
          <p className="text-sm text-gray-700 leading-relaxed">{editedResponse}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => handleAction("approve")}
          disabled={acting}
          className="px-3 py-1.5 text-xs font-semibold text-white bg-[#D56753] rounded-lg hover:bg-[#C25544] disabled:opacity-40 transition-colors flex items-center gap-1"
        >
          <CheckCircle2 className="h-3 w-3" />
          {acting ? "Posting..." : "Approve"}
        </button>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          {isEditing ? "Done editing" : "Edit"}
        </button>
        <button
          onClick={() => handleAction("skip")}
          className="px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
