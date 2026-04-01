/**
 * Build View -- Dave's Terminal
 *
 * System health at a glance. Dark theme, monospace, feels like a real terminal.
 * 1. System Status (top, full width)
 * 2. Agent Execution Log (main area)
 * 3. Recent Errors (below)
 * 4. Deploy Status (bottom)
 * 5. Dave's Tasks (bottom)
 */

import { useQuery } from "@tanstack/react-query";
import {
  Terminal,
  Server,
  Activity,
  AlertTriangle,
  GitBranch,
  ListTodo,
} from "lucide-react";
import { fetchSchedules, type Schedule } from "@/api/schedules";
import {
  fetchDreamTeamTasks,
  type DreamTeamTask,
} from "@/api/dream-team";
import { apiGet } from "@/api/index";

// ---- Helpers ---------------------------------------------------------------

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatNextRun(dateStr: string | null): string {
  if (!dateStr) return "unscheduled";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  if (diffMs < 0) return "overdue";
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 60) return `in ${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `in ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `in ${diffDays}d`;
}

function daysOpen(dateStr: string): number {
  return Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
  );
}

// ---- Interfaces ------------------------------------------------------------

interface HealthCheckResponse {
  status?: string;
  database?: string;
  redis?: string;
  timestamp?: string;
  uptime?: number;
}

interface BehavioralEvent {
  event_type: string;
  org_name?: string;
  created_at: string;
  count?: number;
}

// ---- Shared UI -------------------------------------------------------------

function TermPanel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-gray-800 bg-[#161b22] p-5 ${className}`}
    >
      {children}
    </div>
  );
}

function TermHeader({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="h-4 w-4 text-green-500" />
      <p className="text-xs font-bold uppercase tracking-wider text-green-600">
        {label}
      </p>
    </div>
  );
}

function StatusDot({ status }: { status: "ok" | "fail" | "unknown" }) {
  const colors = {
    ok: "bg-green-500",
    fail: "bg-red-500",
    unknown: "bg-gray-500",
  };

  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${colors[status]} ${
        status === "ok" ? "" : status === "fail" ? "animate-pulse" : ""
      }`}
    />
  );
}

// ---- Panel 1: System Status ------------------------------------------------

function SystemStatusPanel() {
  const { data: healthRaw, isLoading } = useQuery({
    queryKey: ["backend-health-build"],
    queryFn: async () => {
      const res = await apiGet({ path: "/health" });
      return res as HealthCheckResponse;
    },
    refetchInterval: 30_000,
    retry: false,
  });

  const health = healthRaw ?? {};
  const backendUp =
    health.status === "ok" || health.status === "healthy";
  const dbUp =
    health.database === "connected" || health.database === "ok";
  const redisUp =
    health.redis === "connected" || health.redis === "ok";
  const redisKnown = health.redis !== undefined;

  return (
    <TermPanel>
      <TermHeader icon={Server} label="System Status" />

      {isLoading ? (
        <p className="text-sm text-gray-500">Checking...</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="flex items-center gap-2">
              <StatusDot status={backendUp ? "ok" : "fail"} />
              <div>
                <p className="text-sm text-green-400 font-medium">Backend</p>
                <p className="text-[10px] text-gray-500">
                  {backendUp ? "Healthy" : "Down"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <StatusDot status={dbUp ? "ok" : "fail"} />
              <div>
                <p className="text-sm text-green-400 font-medium">Database</p>
                <p className="text-[10px] text-gray-500">
                  {dbUp ? "Connected" : "Error"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <StatusDot status={redisKnown ? (redisUp ? "ok" : "fail") : "unknown"} />
              <div>
                <p className="text-sm text-green-400 font-medium">Redis</p>
                <p className="text-[10px] text-gray-500">
                  {redisKnown ? (redisUp ? "Connected" : "Disconnected") : "Verify on EC2"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <StatusDot status="unknown" />
              <div>
                <p className="text-sm text-green-400 font-medium">BullMQ</p>
                <p className="text-[10px] text-gray-500">Verify on EC2</p>
              </div>
            </div>
          </div>

          {health.timestamp && (
            <p className="text-[10px] text-gray-600">
              Last check: {new Date(health.timestamp).toLocaleTimeString()}
              {health.uptime
                ? ` . Uptime: ${Math.floor(health.uptime / 3600)}h`
                : ""}
            </p>
          )}
        </div>
      )}
    </TermPanel>
  );
}

// ---- Panel 2: Agent Execution Log ------------------------------------------

function AgentExecutionLog({ schedules }: { schedules: Schedule[] }) {
  // Sort: failed first, then by next run time
  const sorted = [...schedules].sort((a, b) => {
    const aFailed = a.latest_run?.status === "failed" ? 0 : 1;
    const bFailed = b.latest_run?.status === "failed" ? 0 : 1;
    if (aFailed !== bFailed) return aFailed - bFailed;

    const aNext = a.next_run_at ? new Date(a.next_run_at).getTime() : Infinity;
    const bNext = b.next_run_at ? new Date(b.next_run_at).getTime() : Infinity;
    return aNext - bNext;
  });

  return (
    <TermPanel>
      <TermHeader icon={Activity} label="Agent Execution Log" />

      {sorted.length === 0 ? (
        <p className="text-sm text-gray-500">No agents scheduled.</p>
      ) : (
        <div className="space-y-1">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_80px_80px_100px] gap-2 text-[10px] text-gray-600 uppercase font-bold pb-1 border-b border-gray-800">
            <span>Agent</span>
            <span>Last Run</span>
            <span>Status</span>
            <span>Next Run</span>
          </div>

          {sorted.map((s) => {
            const run = s.latest_run;
            const status: "ok" | "fail" | "unknown" = !run
              ? "unknown"
              : run.status === "completed"
                ? "ok"
                : run.status === "failed"
                  ? "fail"
                  : "unknown";

            const statusLabel = !run
              ? "never run"
              : run.status === "running"
                ? "running"
                : run.status === "completed"
                  ? "ok"
                  : "failed";

            return (
              <div
                key={s.id}
                className="grid grid-cols-[1fr_80px_80px_100px] gap-2 items-center py-1.5 border-b border-gray-800/50 last:border-0"
              >
                <span className="text-sm text-green-400 truncate">
                  {s.display_name}
                </span>
                <span className="text-xs text-gray-500">
                  {timeAgo(s.last_run_at)}
                </span>
                <span className="flex items-center gap-1.5">
                  <StatusDot status={status} />
                  <span
                    className={`text-xs ${
                      status === "ok"
                        ? "text-green-500"
                        : status === "fail"
                          ? "text-red-400"
                          : "text-gray-500"
                    }`}
                  >
                    {statusLabel}
                  </span>
                </span>
                <span className="text-xs text-gray-500">
                  {formatNextRun(s.next_run_at)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </TermPanel>
  );
}

// ---- Panel 3: Recent Errors ------------------------------------------------

function RecentErrorsPanel() {
  const { data: errorData } = useQuery({
    queryKey: ["recent-errors-build"],
    queryFn: async () => {
      // Try to fetch error events from behavioral_events
      const res = await apiGet({
        path: "/admin/behavioral-events?event_type=error&limit=50",
      });
      return res?.success !== false
        ? ((res?.events || []) as BehavioralEvent[])
        : [];
    },
    retry: false,
    staleTime: 60_000,
  });

  const events = errorData ?? [];

  // Group by event_type
  const grouped = events.reduce<Record<string, { count: number; latest: string; orgName?: string }>>(
    (acc, e) => {
      const key = e.event_type;
      if (!acc[key]) {
        acc[key] = { count: 0, latest: e.created_at, orgName: e.org_name };
      }
      acc[key].count += e.count ?? 1;
      if (e.created_at > acc[key].latest) {
        acc[key].latest = e.created_at;
      }
      return acc;
    },
    {}
  );

  const entries = Object.entries(grouped).sort(
    (a, b) => b[1].count - a[1].count
  );

  return (
    <TermPanel>
      <TermHeader icon={AlertTriangle} label="Recent Errors (24h)" />

      {entries.length === 0 ? (
        <p className="text-sm text-green-500">
          $ tail -f /var/log/errors ... No errors in the last 24h.
        </p>
      ) : (
        <div className="space-y-1">
          <div className="grid grid-cols-[1fr_80px_80px] gap-2 text-[10px] text-gray-600 uppercase font-bold pb-1 border-b border-gray-800">
            <span>Event Type</span>
            <span>Count</span>
            <span>Last Seen</span>
          </div>

          {entries.map(([type, info]) => (
            <div
              key={type}
              className="grid grid-cols-[1fr_80px_80px] gap-2 items-center py-1.5 border-b border-gray-800/50 last:border-0"
            >
              <span className="text-sm text-red-400 truncate">{type}</span>
              <span className="text-xs text-gray-400 font-mono">
                x{info.count}
              </span>
              <span className="text-xs text-gray-500">
                {timeAgo(info.latest)}
              </span>
            </div>
          ))}
        </div>
      )}
    </TermPanel>
  );
}

// ---- Panel 4: Deploy Status ------------------------------------------------

function DeployStatusPanel() {
  return (
    <TermPanel>
      <TermHeader icon={GitBranch} label="Deploy Status" />

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm text-green-400 font-medium">sandbox</span>
          </div>
          <span className="text-xs text-gray-600">Active development</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-sm text-blue-400 font-medium">main</span>
          </div>
          <span className="text-xs text-gray-600">Production</span>
        </div>

        <div className="rounded-lg bg-[#0d1117] border border-gray-800 p-3">
          <p className="text-xs text-gray-500 font-mono">
            $ git log --oneline -1
          </p>
          <p className="text-xs text-green-400 font-mono mt-1">
            sandbox is ahead of production. Merge requires Dave review.
          </p>
        </div>

        <div>
          <p className="text-[10px] text-gray-600 uppercase font-bold mb-2">
            Pending Migrations
          </p>
          <p className="text-xs text-gray-500 font-mono">
            $ npx knex migrate:status
          </p>
          <p className="text-xs text-green-500 font-mono mt-1">
            All migrations applied. Run `npx knex migrate:latest` to verify.
          </p>
        </div>
      </div>
    </TermPanel>
  );
}

// ---- Panel 5: Dave's Tasks -------------------------------------------------

function DaveTasksPanel({ tasks }: { tasks: DreamTeamTask[] }) {
  const daveTasks = tasks
    .filter(
      (t) =>
        t.owner_name.toLowerCase() === "dave" && t.status !== "done"
    )
    .sort((a, b) => {
      const pOrder: Record<string, number> = {
        urgent: 0,
        high: 1,
        normal: 2,
        low: 3,
      };
      return (
        (pOrder[a.priority] ?? 2) - (pOrder[b.priority] ?? 2)
      );
    });

  return (
    <TermPanel>
      <TermHeader icon={ListTodo} label="Dave's Tasks" />

      {daveTasks.length === 0 ? (
        <p className="text-sm text-green-500">Queue empty. Standing by.</p>
      ) : (
        <div className="space-y-2">
          {daveTasks.map((t) => {
            const age = daysOpen(t.created_at);
            const isOverdue =
              t.due_date && new Date(t.due_date) < new Date();

            return (
              <div
                key={t.id}
                className={`flex items-center justify-between rounded-lg px-3 py-2.5 border ${
                  isOverdue
                    ? "border-red-800 bg-red-900/20"
                    : "border-gray-800 bg-[#0d1117]"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-medium truncate ${
                      isOverdue ? "text-red-400" : "text-green-400"
                    }`}
                  >
                    {t.title}
                  </p>
                  <p className="text-[10px] text-gray-600">
                    {age}d open
                    {t.due_date
                      ? ` . due ${new Date(t.due_date).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric" }
                        )}`
                      : ""}
                    {isOverdue ? " . OVERDUE" : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 ml-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                    t.priority === "urgent"
                      ? "bg-red-900/50 text-red-400"
                      : t.priority === "high"
                        ? "bg-amber-900/50 text-amber-400"
                        : "bg-gray-800 text-gray-500"
                  }`}
                >
                  {t.priority}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </TermPanel>
  );
}

// ---- Main ------------------------------------------------------------------

export default function BuildView() {
  const { data: scheduleData } = useQuery({
    queryKey: ["admin-schedules"],
    queryFn: fetchSchedules,
  });

  const schedules: Schedule[] = Array.isArray(scheduleData)
    ? scheduleData
    : [];

  const { data: taskData } = useQuery({
    queryKey: ["dream-team-tasks-build"],
    queryFn: () => fetchDreamTeamTasks(),
    retry: false,
    staleTime: 60_000,
  });
  const tasks: DreamTeamTask[] = taskData?.tasks ?? [];

  return (
    <div className="min-h-screen bg-[#0d1117] text-green-400 font-mono">
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        {/* Terminal header */}
        <div className="flex items-center gap-3 mb-2">
          <Terminal className="h-5 w-5 text-green-500" />
          <h1 className="text-lg font-bold text-green-400">
            alloro@prod:~$
          </h1>
          <span className="text-xs text-gray-600">Build Console</span>
        </div>

        {/* Panel 1: System Status */}
        <SystemStatusPanel />

        {/* Panel 2: Agent Execution Log */}
        <AgentExecutionLog schedules={schedules} />

        {/* Panel 3: Recent Errors */}
        <RecentErrorsPanel />

        {/* Panels 4 + 5: Deploy Status | Dave's Tasks */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DeployStatusPanel />
          <DaveTasksPanel tasks={tasks} />
        </div>
      </div>
    </div>
  );
}
