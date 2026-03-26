/**
 * Session Intelligence -- live context feed for HQ.
 *
 * Reads from GET /api/admin/behavioral-events (last 50, reverse chronological).
 * Each event as one line with time, plain English description, practice name.
 * Color coded by sentiment. Filter bar. Auto-refreshes every 60s.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { apiGet } from "@/api/index";

// --- Event mapping -----------------------------------------------------------

type Sentiment = "green" | "amber" | "red" | "neutral";

const EVENT_MAP: Record<string, { label: string; sentiment: Sentiment }> = {
  "first_win.achieved": { label: "First win delivered", sentiment: "green" },
  "billing.subscription_created": { label: "New subscriber", sentiment: "green" },
  "billing.subscription_cancelled": { label: "Cancellation", sentiment: "red" },
  "ttfv.yes": { label: "TTFV confirmed", sentiment: "green" },
  "gp.gone_dark": { label: "GP gone dark alert", sentiment: "red" },
  "gp.drift_detected": { label: "GP drift detected", sentiment: "amber" },
  "milestone.achieved": { label: "Milestone reached", sentiment: "green" },
  "cs_pulse.daily_brief": { label: "CS Pulse ran", sentiment: "amber" },
  "referral.submitted": { label: "New GP referral submitted", sentiment: "green" },
  "competitor.disruption_detected": { label: "Competitor disruption", sentiment: "red" },
};

const SENTIMENT_DOT: Record<Sentiment, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-400",
  red: "bg-red-500",
  neutral: "bg-gray-300",
};

const SENTIMENT_BG: Record<Sentiment, string> = {
  green: "bg-emerald-50 border-emerald-200",
  amber: "bg-amber-50 border-amber-200",
  red: "bg-red-50 border-red-200",
  neutral: "bg-gray-50 border-gray-200",
};

function getEventInfo(eventType: string): { label: string; sentiment: Sentiment } {
  if (EVENT_MAP[eventType]) return EVENT_MAP[eventType];
  // Partial match for event types with prefixes
  for (const [key, val] of Object.entries(EVENT_MAP)) {
    if (eventType.startsWith(key.split(".")[0] + ".")) return val;
  }
  return { label: eventType.replace(/[._]/g, " "), sentiment: "neutral" };
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

// --- Types -------------------------------------------------------------------

interface BehavioralEvent {
  id: string;
  event_type: string;
  properties: any;
  org_name: string | null;
  created_at: string;
}

type FilterType = "all" | "green" | "amber" | "red";

// --- Main Component ----------------------------------------------------------

export default function SessionIntelligence() {
  const [filter, setFilter] = useState<FilterType>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-behavioral-events"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/behavioral-events?limit=50" });
      return res?.success ? (res.events as BehavioralEvent[]) : [];
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const events = (data || []).map((e) => ({
    ...e,
    ...getEventInfo(e.event_type),
  }));

  const filtered = filter === "all"
    ? events
    : events.filter((e) => e.sentiment === filter);

  const counts = {
    all: events.length,
    green: events.filter((e) => e.sentiment === "green").length,
    amber: events.filter((e) => e.sentiment === "amber").length,
    red: events.filter((e) => e.sentiment === "red").length,
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#D56753]/10 flex items-center justify-center">
          <Activity className="h-4 w-4 text-[#D56753]" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[#212D40]">Live Feed</h1>
          <p className="text-xs text-gray-400">Auto-refreshes every 60 seconds</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2">
        {(["all", "green", "amber", "red"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all capitalize ${
              filter === f
                ? f === "all"
                  ? "border-[#212D40] bg-[#212D40] text-white"
                  : f === "green"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : f === "amber"
                      ? "border-amber-500 bg-amber-50 text-amber-700"
                      : "border-red-500 bg-red-50 text-red-700"
                : "border-gray-200 text-gray-500 hover:border-gray-300"
            }`}
          >
            {f !== "all" && (
              <span className={`w-2 h-2 rounded-full ${SENTIMENT_DOT[f]}`} />
            )}
            {f} ({counts[f]})
          </button>
        ))}
      </div>

      {/* Event feed */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl border border-gray-200 bg-white" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-400">
          <p className="text-sm">
            {filter === "all"
              ? "No events recorded yet. Events appear as the system runs."
              : `No ${filter} events in the last 50.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((event) => (
            <div
              key={event.id}
              className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${SENTIMENT_BG[event.sentiment]}`}
            >
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${SENTIMENT_DOT[event.sentiment]}`} />
              <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-mono text-gray-400 shrink-0">
                  {timeAgo(event.created_at)}
                </span>
                <span className="text-sm font-semibold text-[#212D40]">
                  {event.label}
                </span>
                {event.org_name && (
                  <span className="text-xs text-gray-500 truncate">
                    {event.org_name}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
