/**
 * AAE 2026 Conference Dashboard -- /admin/aae
 *
 * Corey's live view during and after AAE.
 * Reads behavioral_events where properties.source = 'aae2026'.
 * Auto-refreshes every 30 seconds.
 */

import { useState, useEffect, useCallback } from "react";
import {
  BarChart3,
  Users,
  Percent,
  MapPin,
  RefreshCw,
  Calendar,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────

interface AAEEvent {
  id: string;
  event_type: string;
  properties: Record<string, unknown>;
  created_at: string;
}

interface AAEMetrics {
  checkupsRun: number;
  accountsCreated: number;
  conversionRate: number;
  topCity: string | null;
  feed: FeedItem[];
}

interface FeedItem {
  id: string;
  practiceName: string;
  city: string;
  score: number;
  timeAgo: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function computeMetrics(events: AAEEvent[]): AAEMetrics {
  const checkups = events.filter(
    (e) => e.event_type === "checkup.completed"
  );
  const accounts = events.filter(
    (e) => e.event_type === "account.created"
  );

  // Top city
  const cityCounts: Record<string, number> = {};
  for (const e of checkups) {
    const city = (e.properties?.city as string) || "Unknown";
    cityCounts[city] = (cityCounts[city] || 0) + 1;
  }
  const topCity =
    Object.entries(cityCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Feed from completed checkups
  const feed: FeedItem[] = checkups.slice(0, 50).map((e) => ({
    id: e.id,
    practiceName: (e.properties?.practice_name as string) || "Unknown Practice",
    city: (e.properties?.city as string) || "Unknown",
    score: (e.properties?.score as number) || 0,
    timeAgo: timeAgo(e.created_at),
  }));

  const rate =
    checkups.length > 0
      ? Math.round((accounts.length / checkups.length) * 100)
      : 0;

  return {
    checkupsRun: checkups.length,
    accountsCreated: accounts.length,
    conversionRate: rate,
    topCity,
    feed,
  };
}

// ─── Component ──────────────────────────────────────────────────────

export default function AAEDashboard() {
  const [metrics, setMetrics] = useState<AAEMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/events?source=aae2026");
      if (!res.ok) throw new Error("fetch failed");
      const data: AAEEvent[] = await res.json();
      setMetrics(computeMetrics(data));
    } catch {
      // On error, keep existing metrics (or null for empty state)
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 30_000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  // ─── Empty State ────────────────────────────────────────────────

  if (!loading && (!metrics || metrics.checkupsRun === 0)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-5">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#D56753]/10 mb-5">
            <Calendar className="w-7 h-7 text-[#D56753]" />
          </div>
          <h2 className="text-xl font-extrabold text-[#212D40]">
            AAE is April 15-18 in Salt Lake City.
          </h2>
          <p className="mt-3 text-sm text-slate-500 leading-relaxed">
            This dashboard activates when the first Checkup runs with
            source=aae2026.
          </p>
        </div>
      </div>
    );
  }

  // ─── Loading State ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-[#D56753] animate-spin" />
      </div>
    );
  }

  const m = metrics!;

  // ─── Dashboard ──────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#212D40]">
            AAE 2026 Live
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Auto-refreshes every 30s. Last:{" "}
            {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <button
          onClick={fetchEvents}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          title="Refresh now"
        >
          <RefreshCw className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          icon={BarChart3}
          label="Checkups Run"
          value={String(m.checkupsRun)}
        />
        <MetricCard
          icon={Users}
          label="Accounts Created"
          value={String(m.accountsCreated)}
        />
        <MetricCard
          icon={Percent}
          label="Conversion"
          value={`${m.conversionRate}%`}
        />
        <MetricCard
          icon={MapPin}
          label="Top Market"
          value={m.topCity || "--"}
        />
      </div>

      {/* Live Feed */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <p className="text-xs font-bold uppercase tracking-wider text-[#D56753] mb-4">
          Live Feed
        </p>
        {m.feed.length === 0 ? (
          <p className="text-sm text-slate-400">
            No checkups yet. Waiting for first scan.
          </p>
        ) : (
          <div className="space-y-2">
            {m.feed.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#212D40] truncate">
                    {item.practiceName}, {item.city}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {item.timeAgo}
                  </p>
                </div>
                <span
                  className={`text-lg font-black shrink-0 ml-3 ${
                    item.score < 70 ? "text-[#D56753]" : "text-[#212D40]"
                  }`}
                >
                  {item.score}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Metric Card ────────────────────────────────────────────────────

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-[#D56753]" />
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {label}
        </p>
      </div>
      <p className="text-2xl font-black text-[#212D40]">{value}</p>
    </div>
  );
}

// T1 adds /admin/aae route to App.tsx
// T1 adds "AAE 2026" to HQ sidebar with Calendar icon
