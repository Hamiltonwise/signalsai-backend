/**
 * BuildView -- Dave's HQ.
 *
 * CTO view: infrastructure health, deployment status, what to do next.
 * Musk Step 4 (accelerate): show the critical path, remove ambiguity.
 * Bezos: two-pizza team, single-threaded ownership.
 *
 * Six zones:
 * 1. System Health (one answer: green or what's broken)
 * 2. Dave's Queue (open tasks, sorted by priority)
 * 3. Webhook / Integration Health (live from webhook_receipts)
 * 4. Infrastructure Checklist (env vars, services, connections)
 * 5. Deploy Status (changelog)
 * 6. Pending Migrations
 */

import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  Server,
  Database,
  GitBranch,
  Activity,
} from "lucide-react";
import { apiGet } from "@/api/index";
import ChangelogCard from "./ChangelogCard";

interface DreamTeamTask {
  id: number;
  title: string;
  owner: string;
  status: string;
  priority: string;
  due_date?: string;
}

interface WebhookStatus {
  name: string;
  endpoint: string;
  last_received_at: string | null;
  last_event_type: string | null;
  status: "active" | "stale" | "never_received";
  env_var_configured: boolean;
}

export default function BuildView() {
  const { data: healthData } = useQuery({
    queryKey: ["api-health"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/health");
        return res.ok ? await res.json() : null;
      } catch { return null; }
    },
    staleTime: 30_000,
  });

  const { data: tasksData } = useQuery({
    queryKey: ["dream-team-tasks-dave"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/dream-team/tasks?owner=dave" });
      return res?.success ? (res.tasks as DreamTeamTask[]) : [];
    },
    staleTime: 60_000,
  });

  const { data: webhookData } = useQuery({
    queryKey: ["webhook-health"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/webhooks/health" });
      return res?.success ? (res.webhooks as WebhookStatus[]) : [];
    },
    staleTime: 60_000,
  });

  const apiHealthy = healthData?.status === "ok";
  const tasks = (tasksData || []).filter((t) => t.status !== "done" && t.status !== "completed");
  const urgentTasks = tasks.filter((t) => t.priority === "urgent" || t.priority === "high");
  const webhooks = webhookData || [];
  const webhooksActive = webhooks.filter((w) => w.status === "active").length;
  const webhooksStale = webhooks.filter((w) => w.status === "stale").length;
  const webhooksNever = webhooks.filter((w) => w.status === "never_received").length;

  const systemGreen = apiHealthy && webhooksStale === 0 && urgentTasks.length === 0;

  return (
    <div className="space-y-6 max-w-3xl">

      {/* Zone 1: System Health -- one answer */}
      <div className={`rounded-2xl p-5 ${systemGreen ? "bg-emerald-50 border border-emerald-200" : "bg-amber-50 border border-amber-200"}`}>
        <div className="flex items-center gap-3">
          {systemGreen ? (
            <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0" />
          )}
          <div>
            <p className={`text-lg font-semibold ${systemGreen ? "text-emerald-700" : "text-amber-700"}`}>
              {systemGreen
                ? "All systems green."
                : !apiHealthy
                  ? "API health check failed."
                  : webhooksStale > 0
                    ? `${webhooksStale} stale webhook${webhooksStale !== 1 ? "s" : ""}. ${urgentTasks.length} urgent.`
                    : `${urgentTasks.length} urgent task${urgentTasks.length !== 1 ? "s" : ""}.`}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {tasks.length} open task{tasks.length !== 1 ? "s" : ""}. {webhooksActive}/{webhooks.length} webhooks active.
            </p>
          </div>
        </div>
      </div>

      {/* Zone 2: Dave's Queue */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <GitBranch className="h-4 w-4 text-[#D56753]" />
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Your Queue ({tasks.length})</p>
        </div>
        {tasks.length === 0 ? (
          <p className="text-sm text-emerald-600">Queue clear.</p>
        ) : (
          <div className="space-y-2">
            {tasks.slice(0, 10).map((t) => (
              <div key={t.id} className="flex items-start gap-2 py-1.5 border-b border-gray-100 last:border-0">
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                  t.priority === "urgent" ? "bg-red-500" : t.priority === "high" ? "bg-amber-500" : "bg-gray-300"
                }`} />
                <p className="text-sm font-medium text-[#1A1D23] truncate flex-1">{t.title}</p>
                <span className={`text-xs px-1.5 py-0.5 rounded font-semibold shrink-0 ${
                  t.priority === "urgent" ? "bg-red-100 text-red-600" : t.priority === "high" ? "bg-amber-100 text-amber-600" : "bg-gray-100 text-gray-500"
                }`}>{t.priority || "normal"}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Zone 3: Webhook / Integration Health (live data) */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4 text-purple-500" />
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Integrations ({webhooksActive} active, {webhooksStale} stale, {webhooksNever} pending)
          </p>
        </div>
        {webhooks.length === 0 ? (
          <p className="text-sm text-gray-400">Loading webhook data...</p>
        ) : (
          <div className="space-y-2 text-sm">
            {webhooks.map((w) => (
              <div key={w.name} className="flex items-start gap-2">
                {w.status === "active" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                ) : w.status === "stale" ? (
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                ) : (
                  <Clock className="h-4 w-4 text-gray-300 mt-0.5 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[#1A1D23]">{w.name}</span>
                    {!w.env_var_configured && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-semibold">No env var</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    {w.last_received_at
                      ? `Last: ${formatTimeAgo(w.last_received_at)}${w.last_event_type ? ` (${w.last_event_type})` : ""}`
                      : "Never received"}
                    <span className="ml-2 text-gray-300">{w.endpoint}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Zone 4: Infrastructure Checklist */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Server className="h-4 w-4 text-blue-500" />
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Infrastructure</p>
        </div>
        <div className="space-y-2 text-sm">
          <InfraRow label="API Server" ok={apiHealthy} detail={apiHealthy ? "Responding" : "Not responding"} />
          <InfraRow label="Database" ok={apiHealthy} detail={apiHealthy ? "Connected" : "Unknown"} />
          <InfraRow label="Redis / BullMQ" ok={null} detail="Verify: redis-cli ping on EC2" />
          <InfraRow label="Sentry" ok={false} detail="SENTRY_DSN not set" />
          <InfraRow label="Google Places" ok={null} detail="Rotate key (exposed Mar 23)" />
        </div>
      </div>

      {/* Zone 5: Deploy Status */}
      <ChangelogCard />

      {/* Zone 6: Pending Migrations */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Database className="h-4 w-4 text-purple-500" />
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Pending Migrations</p>
        </div>
        <p className="font-mono text-xs text-gray-600">npx knex migrate:latest</p>
        <p className="text-xs text-gray-400 mt-2">Run on EC2 after pulling latest. Includes: week1_win, checkup_invitations, champion fields.</p>
      </div>
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function InfraRow({ label, ok, detail }: { label: string; ok: boolean | null; detail: string }) {
  return (
    <div className="flex items-start gap-2">
      {ok === true ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
        : ok === false ? <Clock className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
        : <Clock className="h-4 w-4 text-gray-300 mt-0.5 shrink-0" />}
      <div>
        <span className="font-medium text-[#1A1D23]">{label}</span>
        <span className="text-xs text-gray-400 ml-2">{detail}</span>
      </div>
    </div>
  );
}
