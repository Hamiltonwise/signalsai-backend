/**
 * OrgReviewRequestsTab — Admin view of review request history and conversion funnel.
 */

import { useQuery } from "@tanstack/react-query";
import { Send, MousePointerClick, Star, Loader2 } from "lucide-react";

interface ReviewRequest {
  id: string;
  recipient_email: string;
  recipient_name: string | null;
  status: "sent" | "clicked" | "converted";
  sent_at: string;
  clicked_at: string | null;
  converted_at: string | null;
}

interface ReviewRequestStats {
  total: number;
  clicked: number;
  converted: number;
}

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

function FunnelBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium text-gray-500 w-20">{label}</span>
      <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-16 text-right">
        {count} ({pct}%)
      </span>
    </div>
  );
}

export function OrgReviewRequestsTab({
  organizationId,
}: {
  organizationId: number;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-review-requests", organizationId],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(
        `/api/review-requests?limit=50`,
        {
          headers: token
            ? { Authorization: `Bearer ${token}` }
            : {},
        }
      );
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  const requests: ReviewRequest[] = data?.requests || [];
  const stats: ReviewRequestStats = data?.stats || {
    total: 0,
    clicked: 0,
    converted: 0,
  };

  if (requests.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-400">
        <Star className="h-8 w-8 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-medium">No review requests sent yet.</p>
        <p className="text-xs mt-1">
          Doctors can send review requests from their dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Conversion funnel */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-bold text-[#212D40] mb-4">
          Conversion Funnel
        </h3>
        <div className="space-y-2.5">
          <FunnelBar
            label="Sent"
            count={stats.total}
            total={stats.total}
            color="bg-gray-400"
          />
          <FunnelBar
            label="Clicked"
            count={stats.clicked}
            total={stats.total}
            color="bg-blue-500"
          />
          <FunnelBar
            label="Reviewed"
            count={stats.converted}
            total={stats.total}
            color="bg-emerald-500"
          />
        </div>
      </div>

      {/* Request list */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-bold text-[#212D40]">
            Request History ({stats.total})
          </h3>
        </div>
        <div className="divide-y divide-gray-100">
          {requests.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between px-5 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                {r.status === "converted" ? (
                  <Star className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : r.status === "clicked" ? (
                  <MousePointerClick className="h-4 w-4 text-blue-500 shrink-0" />
                ) : (
                  <Send className="h-4 w-4 text-gray-300 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#212D40] truncate">
                    {r.recipient_name || r.recipient_email}
                  </p>
                  {r.recipient_name && (
                    <p className="text-xs text-gray-400 truncate">
                      {r.recipient_email}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    r.status === "converted"
                      ? "bg-emerald-50 text-emerald-700"
                      : r.status === "clicked"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-gray-50 text-gray-500"
                  }`}
                >
                  {r.status === "converted"
                    ? "Review left"
                    : r.status === "clicked"
                      ? "Clicked"
                      : "Sent"}
                </span>
                <span className="text-xs text-gray-400">
                  {timeAgo(r.sent_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
