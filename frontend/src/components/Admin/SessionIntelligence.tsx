/**
 * Session Intelligence -- live context feed for HQ.
 *
 * Reads from GET /api/admin/behavioral-events (last 50, reverse chronological).
 * Each event as one line with time, plain English description, practice name.
 * Color coded by sentiment. Filter bar. Auto-refreshes every 60s.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Eye,
  Search,
  CheckCircle2,
  CreditCard,
  UserPlus,
  AlertTriangle,
  TrendingDown,
  Trophy,
  Heart,
  Send,
  Zap,
  Globe,
  FileText,
  DollarSign,
  Shield,
  Compass,
  Bot,
  type LucideIcon,
} from "lucide-react";
import { apiGet } from "@/api/index";

// --- Event mapping -----------------------------------------------------------

type Sentiment = "green" | "amber" | "red" | "neutral";

interface EventInfo {
  label: string;
  sentiment: Sentiment;
  icon: LucideIcon;
}

const EVENT_MAP: Record<string, EventInfo> = {
  // Positive
  "first_win.achieved": { label: "First win delivered", sentiment: "green", icon: Trophy },
  "billing.subscription_created": { label: "New subscriber", sentiment: "green", icon: CreditCard },
  "billing.payment_succeeded": { label: "Payment received", sentiment: "green", icon: DollarSign },
  "ttfv.yes": { label: "TTFV confirmed", sentiment: "green", icon: CheckCircle2 },
  "milestone.achieved": { label: "Milestone reached", sentiment: "green", icon: Trophy },
  "milestone.detected": { label: "Milestone detected", sentiment: "green", icon: Trophy },
  "referral.submitted": { label: "New GP referral submitted", sentiment: "green", icon: UserPlus },
  "account.created": { label: "Account created", sentiment: "green", icon: UserPlus },
  "review.received": { label: "Review received", sentiment: "green", icon: Heart },
  "week1_win.generated": { label: "Week 1 win generated", sentiment: "green", icon: Zap },

  // Warning
  "gp.drift_detected": { label: "GP drift detected", sentiment: "amber", icon: TrendingDown },
  "cs_pulse.daily_brief": { label: "CS Pulse ran", sentiment: "amber", icon: Heart },
  "competitor.reviews_surge": { label: "Competitor review surge", sentiment: "amber", icon: AlertTriangle },

  // Negative
  "billing.subscription_cancelled": { label: "Cancellation", sentiment: "red", icon: CreditCard },
  "billing.payment_failed": { label: "Payment failed", sentiment: "red", icon: CreditCard },
  "gp.gone_dark": { label: "GP gone dark", sentiment: "red", icon: AlertTriangle },
  "competitor.disruption_detected": { label: "Competitor disruption", sentiment: "red", icon: AlertTriangle },

  // Operational/Neutral
  "marketing.page_view": { label: "Marketing page view", sentiment: "neutral", icon: Eye },
  "checkup.started": { label: "Checkup started", sentiment: "neutral", icon: Search },
  "checkup.scan_started": { label: "Checkup scan started", sentiment: "neutral", icon: Search },
  "checkup.scan_completed": { label: "Checkup scan completed", sentiment: "green", icon: CheckCircle2 },
  "checkup.gate_viewed": { label: "Checkup gate viewed", sentiment: "neutral", icon: Eye },
  "review_request.sent": { label: "Review request sent", sentiment: "green", icon: Send },
  "ops.orphan_detected": { label: "Orphan document found", sentiment: "neutral", icon: FileText },
  "strategy.landscape_update": { label: "Strategy landscape update", sentiment: "neutral", icon: Compass },
  "tech_horizon.signal": { label: "Tech horizon signal", sentiment: "neutral", icon: Compass },
  "tech_horizon.summary": { label: "Tech horizon summary", sentiment: "neutral", icon: Compass },
  "foundation.ops_report": { label: "Foundation ops report", sentiment: "neutral", icon: Shield },
  "personal.property_scan": { label: "Personal property scan", sentiment: "neutral", icon: Globe },
  "personal.financial_brief": { label: "Personal financial brief", sentiment: "neutral", icon: DollarSign },
  "personal.tax_brief": { label: "Personal tax brief", sentiment: "neutral", icon: DollarSign },
  "personal.price_check": { label: "Personal price check", sentiment: "neutral", icon: DollarSign },
  "cfo.monthly_report": { label: "CFO monthly report", sentiment: "neutral", icon: DollarSign },
  "content.ghost_writer_extract": { label: "Content ghost writer extract", sentiment: "neutral", icon: FileText },
  "morning_briefing.assembled": { label: "Morning briefing assembled", sentiment: "green", icon: Bot },
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

function getEventInfo(eventType: string): EventInfo {
  if (EVENT_MAP[eventType]) return EVENT_MAP[eventType];
  // Partial match for event types with prefixes
  for (const [key, val] of Object.entries(EVENT_MAP)) {
    if (eventType.startsWith(key.split(".")[0] + ".")) return val;
  }
  return { label: eventType.replace(/[._]/g, " "), sentiment: "neutral", icon: Activity };
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
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-[#D56753] animate-pulse" />
            <span className="text-xs font-medium text-[#D56753]">Listening</span>
          </div>
          <p className="text-sm">
            {filter === "all"
              ? "Agents are running. First events appear within 24 hours of account activity."
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
              {(() => {
                const IconComp = event.icon || Activity;
                const iconColor = event.sentiment === "green" ? "text-emerald-600"
                  : event.sentiment === "amber" ? "text-amber-600"
                  : event.sentiment === "red" ? "text-red-600"
                  : "text-gray-400";
                return <IconComp className={`h-4 w-4 shrink-0 ${iconColor}`} />;
              })()}
              <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-mono text-gray-400 shrink-0">
                  {timeAgo(event.occurred_at || event.created_at)}
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
