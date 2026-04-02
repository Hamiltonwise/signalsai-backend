/**
 * ClientTimeline -- the full story of a client's journey with Alloro.
 *
 * Reads from behavioral_events for a specific org.
 * Vertical timeline, newest at top. Each event in plain English.
 * When Corey opens this before a call, he knows their entire history in 30 seconds.
 */

import { useQuery } from "@tanstack/react-query";
import {
  UserPlus,
  Search,
  CheckCircle2,
  CreditCard,
  Trophy,
  AlertTriangle,
  Flag,
  Mail,
  Star,
  Activity,
} from "lucide-react";
import { apiGet } from "@/api/index";

// --- Types -------------------------------------------------------------------

interface TimelineEvent {
  id: string;
  event_type: string;
  properties: any;
  org_name: string | null;
  created_at: string;
}

type Sentiment = "green" | "amber" | "red" | "neutral";

interface EventConfig {
  icon: typeof Activity;
  label: (props: any) => string;
  sentiment: Sentiment;
  actionLabel?: string;
  actionPath?: string;
}

const EVENT_CONFIG: Record<string, EventConfig> = {
  "account.created": {
    icon: UserPlus,
    label: () => "Joined Alloro",
    sentiment: "green",
  },
  "checkup.started": {
    icon: Search,
    label: (p) => `Ran a Checkup${p?.practice_name ? ` for ${p.practice_name}` : ""}`,
    sentiment: "neutral",
  },
  "checkup.scan_completed": {
    icon: Search,
    label: (p) => `Checkup complete${p?.score ? `. Score: ${p.score}` : ""}`,
    sentiment: "neutral",
  },
  "checkup.email_captured": {
    icon: Mail,
    label: () => "Email captured from Checkup gate",
    sentiment: "green",
  },
  "ttfv.yes": {
    icon: CheckCircle2,
    label: () => "Confirmed they learned something new",
    sentiment: "green",
  },
  "ttfv.no": {
    icon: AlertTriangle,
    label: () => "Said they didn't learn anything new",
    sentiment: "red",
  },
  "billing.subscription_created": {
    icon: CreditCard,
    label: () => "Became a paying client",
    sentiment: "green",
  },
  "billing.subscription_cancelled": {
    icon: CreditCard,
    label: () => "Cancelled subscription",
    sentiment: "red",
  },
  "first_win.achieved": {
    icon: Trophy,
    label: (p) => `First win${p?.description ? `: ${p.description}` : " delivered"}`,
    sentiment: "green",
  },
  "gp.gone_dark": {
    icon: AlertTriangle,
    label: (p) => `GP gone dark${p?.gp_name ? `: ${p.gp_name}` : ""}`,
    sentiment: "red",
  },
  "gp.drift_detected": {
    icon: AlertTriangle,
    label: (p) => `GP drift detected${p?.gp_name ? `: ${p.gp_name}` : ""}`,
    sentiment: "amber",
  },
  "milestone.achieved": {
    icon: Flag,
    label: (p) => `Milestone${p?.headline ? `: ${p.headline}` : " reached"}`,
    sentiment: "green",
  },
  "monday_email.sent": {
    icon: Mail,
    label: () => "Monday email delivered",
    sentiment: "neutral",
  },
  "monday_email.replied": {
    icon: Mail,
    label: () => "Replied to Monday email",
    sentiment: "green",
  },
  "feedback.nps": {
    icon: Star,
    label: (p) => `NPS score: ${p?.score ?? "submitted"}`,
    sentiment: "neutral",
  },
  "referral.submitted": {
    icon: UserPlus,
    label: (p) => `GP referral from ${p?.referrer_name || "a referring doctor"}`,
    sentiment: "green",
  },
  "competitor.disruption_detected": {
    icon: AlertTriangle,
    label: (p) => `Competitor disruption${p?.competitor_name ? `: ${p.competitor_name}` : ""}`,
    sentiment: "red",
  },
};

const SENTIMENT_COLORS: Record<Sentiment, { dot: string; line: string; bg: string }> = {
  green: { dot: "bg-emerald-500", line: "border-emerald-200", bg: "bg-emerald-50" },
  amber: { dot: "bg-amber-400", line: "border-amber-200", bg: "bg-amber-50" },
  red: { dot: "bg-red-500", line: "border-red-200", bg: "bg-red-50" },
  neutral: { dot: "bg-gray-300", line: "border-gray-200", bg: "bg-gray-50" },
};

function getConfig(eventType: string): EventConfig {
  if (EVENT_CONFIG[eventType]) return EVENT_CONFIG[eventType];
  // Prefix match
  for (const [key, val] of Object.entries(EVENT_CONFIG)) {
    if (eventType.startsWith(key.split(".")[0] + ".")) return val;
  }
  return {
    icon: Activity,
    label: () => eventType.replace(/[._]/g, " "),
    sentiment: "neutral",
  };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(dateStr);
}

// --- Main Component ----------------------------------------------------------

export default function ClientTimeline({ orgId }: { orgId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["client-timeline", orgId],
    queryFn: async () => {
      const res = await apiGet({ path: `/admin/behavioral-events?org_id=${orgId}&limit=100&hours_ago=8760` });
      return res?.success ? (res.events as TimelineEvent[]) : [];
    },
    staleTime: 60_000,
    retry: false,
  });

  const events = data || [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl border border-gray-200 bg-white" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-400">
        <Activity className="h-8 w-8 mx-auto mb-3 opacity-40" />
        <p className="text-sm">No events recorded for this client yet.</p>
        <p className="text-xs mt-1">Events appear as the system interacts with their account.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical timeline line */}
      <div className="absolute left-5 top-0 bottom-0 w-px bg-gray-200" />

      <div className="space-y-1">
        {events.map((event, i) => {
          const props = typeof event.properties === "string"
            ? (() => { try { return JSON.parse(event.properties); } catch { return {}; } })()
            : (event.properties || {});
          const config = getConfig(event.event_type);
          const colors = SENTIMENT_COLORS[config.sentiment];
          const Icon = config.icon;

          return (
            <div key={event.id || i} className="relative flex items-start gap-4 pl-2">
              {/* Timeline dot */}
              <div className={`relative z-10 w-7 h-7 rounded-full ${colors.bg} border-2 ${colors.line} flex items-center justify-center shrink-0 mt-1`}>
                <Icon className={`h-3.5 w-3.5 ${
                  config.sentiment === "green" ? "text-emerald-600" :
                  config.sentiment === "amber" ? "text-amber-600" :
                  config.sentiment === "red" ? "text-red-600" :
                  "text-gray-400"
                }`} />
              </div>

              {/* Event card */}
              <div className="flex-1 min-w-0 pb-4">
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-[#212D40]">
                      {config.label(props)}
                    </p>
                    <span className="text-xs text-gray-400 shrink-0 tabular-nums">
                      {timeAgo(event.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatDate(event.created_at)} at {formatTime(event.created_at)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
