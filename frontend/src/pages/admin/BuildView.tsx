/**
 * Build View -- Dave's Terminal
 *
 * System health at a glance. Dark theme, monospace, feels like a real terminal.
 * 0. Greeting + Health Score (prominent)
 * 1. System Status (top, full width)
 * 2. Agent Health Grid (mission control, technical)
 * 3. Cost Dashboard (token usage by tier)
 * 4. Email Delivery Health (technical)
 * 5. Recent Errors (below)
 * 6. Deploy Status (bottom)
 * 7. Dave's Tasks (bottom)
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TailorText } from "@/components/TailorText";
import {
  Terminal,
  Server,
  AlertTriangle,
  GitBranch,
  ListTodo,
  Gauge,
  Cpu,
  DollarSign,
  Mail,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { fetchSchedules, type Schedule } from "@/api/schedules";
import {
  fetchDreamTeamTasks,
  type DreamTeamTask,
} from "@/api/dream-team";
import { apiGet } from "@/api/index";
import { useAuth } from "@/hooks/useAuth";

// ---- Types -------------------------------------------------------------------

interface AgentStatusEntry {
  name: string;
  displayName: string;
  tier: "fast" | "standard" | "judgment";
  status: "nominal" | "degraded" | "failed" | "idle";
  lastRun: string | null;
  lastRunDuration?: number;
  lastResult: "success" | "failure" | "skipped" | null;
  nextScheduledRun: string | null;
  circuitState: "closed" | "open" | "half-open";
  weeklyRuns: number;
  weeklyFailures: number;
  tokensUsedThisWeek: number;
  costThisWeek: number;
  team: string;
}

interface MissionControlData {
  agents: AgentStatusEntry[];
  byTeam: Record<string, AgentStatusEntry[]>;
  summary: {
    total: number;
    nominal: number;
    degraded: number;
    failed: number;
    idle: number;
    totalWeeklyCost: number;
    totalWeeklyTokens: number;
  };
}

interface CostTrendData {
  thisWeek: { total: number; byTier: Record<string, number>; byAgent: Record<string, number> };
  lastWeek: { total: number; byTier: Record<string, number>; byAgent: Record<string, number> };
  changePercent: number;
}

interface EmailHealthData {
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  complaintRate: number;
  totalEmails: number;
  period: string;
}

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

export function formatNextRun(dateStr: string | null): string {
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

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function formatCost(cost: number): string {
  if (cost < 0.01) return "$0.00";
  return `$${cost.toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${(tokens / 1_000_000).toFixed(2)}M`;
}

// ---- Interfaces (existing) ---------------------------------------------------

interface HealthCheckResponse {
  status?: string;
  database?: string;
  redis?: string;
  timestamp?: string;
  uptime?: number;
}

interface DetailedCheckResult {
  status: "ok" | "error";
  latency_ms?: number;
  queued_jobs?: number;
  failed_jobs?: number;
  error?: string;
}

interface DetailedHealthResponse {
  status?: string;
  timestamp?: string;
  checks?: {
    database?: DetailedCheckResult;
    redis?: DetailedCheckResult;
    bullmq?: DetailedCheckResult;
    places_api?: DetailedCheckResult;
    claude_api?: DetailedCheckResult;
  };
  uptime_seconds?: number;
}

interface BriefSection {
  title: string;
  items: string[];
}

interface PersonalBriefResponse {
  success: boolean;
  data?: {
    role: string;
    generatedAt: string;
    headline: string;
    sections: BriefSection[];
    signoff: string;
    urgentCount: number;
  };
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

function AgentDot({ status }: { status: "nominal" | "degraded" | "failed" | "idle" }) {
  const colors: Record<string, string> = {
    nominal: "bg-green-500",
    degraded: "bg-amber-400",
    failed: "bg-red-500",
    idle: "bg-gray-500",
  };
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${colors[status]} ${
        status === "failed" ? "animate-pulse" : ""
      }`}
    />
  );
}

// ---- Panel 1: System Status ------------------------------------------------

function SystemStatusPanel() {
  // Basic health for backend status
  const { data: healthRaw, isLoading } = useQuery({
    queryKey: ["backend-health-build"],
    queryFn: async () => {
      const res = await apiGet({ path: "/health" });
      return res as HealthCheckResponse;
    },
    refetchInterval: 30_000,
    retry: false,
  });

  // Detailed health for Redis latency, BullMQ queue stats
  const { data: detailedRaw } = useQuery({
    queryKey: ["backend-health-detailed"],
    queryFn: async () => {
      const res = await apiGet({ path: "/health/detailed" });
      return res as DetailedHealthResponse;
    },
    refetchInterval: 30_000,
    retry: false,
  });

  const health = healthRaw ?? {};
  const detailed = detailedRaw?.checks ?? {};
  const backendUp =
    health.status === "ok" || health.status === "healthy";
  const dbUp =
    health.database === "connected" || health.database === "ok";

  // Redis: prefer detailed endpoint for latency info
  const redisCheck = detailed.redis;
  const redisUp = redisCheck
    ? redisCheck.status === "ok"
    : health.redis === "connected" || health.redis === "ok";
  const redisKnown = redisCheck !== undefined || health.redis !== undefined;
  const redisLatency = redisCheck?.latency_ms;

  // BullMQ: live data from detailed endpoint
  const bullmqCheck = detailed.bullmq;
  const bullmqUp = bullmqCheck?.status === "ok";
  const bullmqKnown = bullmqCheck !== undefined;
  const queuedJobs = bullmqCheck?.queued_jobs ?? 0;
  const failedJobs = bullmqCheck?.failed_jobs ?? 0;

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
                <TailorText editKey="hq.build.status.backend" defaultText="Backend" as="p" className="text-sm text-green-400 font-medium" />
                <p className="text-[10px] text-gray-500">
                  {backendUp ? "Healthy" : "Down"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <StatusDot status={dbUp ? "ok" : "fail"} />
              <div>
                <TailorText editKey="hq.build.status.database" defaultText="Database" as="p" className="text-sm text-green-400 font-medium" />
                <p className="text-[10px] text-gray-500">
                  {dbUp ? "Connected" : "Error"}
                  {detailed.database?.latency_ms != null ? ` (${detailed.database.latency_ms}ms)` : ""}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <StatusDot status={redisKnown ? (redisUp ? "ok" : "fail") : "unknown"} />
              <div>
                <TailorText editKey="hq.build.status.redis" defaultText="Redis" as="p" className="text-sm text-green-400 font-medium" />
                <p className="text-[10px] text-gray-500">
                  {redisKnown
                    ? redisUp
                      ? `Connected${redisLatency != null ? ` (${redisLatency}ms)` : ""}`
                      : "Disconnected"
                    : "Checking..."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <StatusDot status={bullmqKnown ? (bullmqUp ? (failedJobs > 0 ? "fail" : "ok") : "fail") : "unknown"} />
              <div>
                <TailorText editKey="hq.build.status.bullmq" defaultText="BullMQ" as="p" className="text-sm text-green-400 font-medium" />
                <p className={`text-[10px] ${failedJobs > 0 ? "text-red-400" : "text-gray-500"}`}>
                  {bullmqKnown
                    ? bullmqUp
                      ? `${queuedJobs} queued, ${failedJobs} failed`
                      : "Unavailable"
                    : "Checking..."}
                </p>
              </div>
            </div>
          </div>

          {(health.timestamp || detailedRaw?.timestamp) && (
            <p className="text-[10px] text-gray-600">
              Last check: {new Date(detailedRaw?.timestamp || health.timestamp || "").toLocaleTimeString()}
              {detailedRaw?.uptime_seconds
                ? ` . Uptime: ${Math.floor(detailedRaw.uptime_seconds / 3600)}h`
                : health.uptime
                  ? ` . Uptime: ${Math.floor(health.uptime / 3600)}h`
                  : ""}
            </p>
          )}
        </div>
      )}
    </TermPanel>
  );
}

// ---- NEW: Agent Health Grid (technical mission control) ----------------------

function AgentHealthGrid() {
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  const { data: mcData, isLoading } = useQuery<MissionControlData>({
    queryKey: ["mission-control-build"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/mission-control" });
      return res?.success ? res : null;
    },
    refetchInterval: 30_000,
    retry: false,
    staleTime: 15_000,
  });

  if (isLoading) {
    return (
      <TermPanel>
        <TermHeader icon={Cpu} label="Agent Health Grid" />
        <p className="text-sm text-gray-500">Loading agents...</p>
      </TermPanel>
    );
  }

  const agents = mcData?.agents ?? [];
  const summary = mcData?.summary;
  const byTeam = mcData?.byTeam ?? {};

  // Sort agents: failed first, then degraded, then nominal, then idle
  const statusOrder: Record<string, number> = { failed: 0, degraded: 1, nominal: 2, idle: 3 };
  const sorted = [...agents].sort(
    (a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3)
  );

  const circuitLabel: Record<string, { text: string; color: string }> = {
    closed: { text: "OK", color: "text-green-500" },
    "half-open": { text: "RECOVERING", color: "text-amber-400" },
    open: { text: "TRIPPED", color: "text-red-400" },
  };

  return (
    <TermPanel>
      <TermHeader icon={Cpu} label="Agent Health Grid" />

      {/* Summary bar */}
      {summary && (
        <div className="flex items-center gap-4 mb-4 text-xs font-mono">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-green-400">{summary.nominal} nominal</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-amber-400">{summary.degraded} degraded</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-red-400">{summary.failed} failed</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-gray-500" />
            <span className="text-gray-500">{summary.idle} idle</span>
          </span>
        </div>
      )}

      {/* Team-grouped view */}
      <div className="space-y-1">
        {Object.entries(byTeam).map(([team, teamAgents]) => {
          const teamFailed = teamAgents.filter((a) => a.status === "failed").length;
          const teamDegraded = teamAgents.filter((a) => a.status === "degraded").length;
          const isExpanded = expandedTeam === team;
          const teamSorted = [...teamAgents].sort(
            (a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3)
          );

          // Team status dot
          const teamStatus: "ok" | "fail" | "unknown" = teamFailed > 0 ? "fail" : teamDegraded > 0 ? "unknown" : "ok";

          return (
            <div key={team}>
              <button
                onClick={() => setExpandedTeam(isExpanded ? null : team)}
                className="w-full flex items-center gap-2 py-2 px-2 rounded hover:bg-gray-800/50 transition-colors"
              >
                <StatusDot status={teamStatus} />
                <span className="text-sm text-green-400 font-medium flex-1 text-left">{team}</span>
                <span className="text-[10px] text-gray-500 font-mono">{teamAgents.length} agents</span>
                {isExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5 text-gray-600" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-gray-600" />
                )}
              </button>

              {isExpanded && (
                <div className="ml-4 mb-2 space-y-0.5">
                  {/* Column headers */}
                  <div className="grid grid-cols-[1fr_60px_60px_70px_60px] gap-2 text-[10px] text-gray-600 uppercase font-bold pb-1 border-b border-gray-800 px-2">
                    <span>Agent</span>
                    <span>Last Run</span>
                    <span>Duration</span>
                    <span>Circuit</span>
                    <span>Status</span>
                  </div>

                  {teamSorted.map((agent) => {
                    const circuit = circuitLabel[agent.circuitState] ?? circuitLabel.closed;
                    return (
                      <div
                        key={agent.name}
                        className="grid grid-cols-[1fr_60px_60px_70px_60px] gap-2 items-center py-1.5 px-2 border-b border-gray-800/30 last:border-0"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <AgentDot status={agent.status} />
                          <span className="text-xs text-green-400 truncate">{agent.displayName}</span>
                        </div>
                        <span className="text-[10px] text-gray-500 font-mono">
                          {timeAgo(agent.lastRun)}
                        </span>
                        <span className="text-[10px] text-gray-500 font-mono">
                          {formatDuration(agent.lastRunDuration)}
                        </span>
                        <span className={`text-[10px] font-mono font-bold ${circuit.color}`}>
                          {circuit.text}
                        </span>
                        <span className={`text-[10px] font-mono ${
                          agent.status === "failed"
                            ? "text-red-400"
                            : agent.status === "degraded"
                              ? "text-amber-400"
                              : agent.status === "nominal"
                                ? "text-green-500"
                                : "text-gray-500"
                        }`}>
                          {agent.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick failed list (always visible if any failed) */}
      {sorted.filter((a) => a.status === "failed").length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-800">
          <p className="text-[10px] text-red-500 uppercase font-bold mb-2">Failed Agents</p>
          {sorted.filter((a) => a.status === "failed").map((agent) => (
            <div key={agent.name} className="flex items-center gap-2 py-1">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs text-red-400">{agent.displayName}</span>
              <span className="text-[10px] text-gray-600 font-mono ml-auto">
                {agent.weeklyFailures} failures this week
              </span>
            </div>
          ))}
        </div>
      )}
    </TermPanel>
  );
}

// ---- NEW: Cost Dashboard -----------------------------------------------------

function CostDashboard() {
  const { data: mcData } = useQuery<MissionControlData>({
    queryKey: ["mission-control-build"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/mission-control" });
      return res?.success ? res : null;
    },
    refetchInterval: 30_000,
    retry: false,
    staleTime: 15_000,
  });

  const { data: costTrend } = useQuery<CostTrendData>({
    queryKey: ["cost-trend-build"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/mission-control/costs?period=trend" });
      return res?.success ? res : null;
    },
    retry: false,
    staleTime: 120_000,
  });

  const agents = mcData?.agents ?? [];
  const summary = mcData?.summary;

  // Aggregate tokens by tier
  const tierTotals: Record<string, { tokens: number; cost: number; count: number }> = {
    fast: { tokens: 0, cost: 0, count: 0 },
    standard: { tokens: 0, cost: 0, count: 0 },
    judgment: { tokens: 0, cost: 0, count: 0 },
  };

  for (const agent of agents) {
    const tier = agent.tier;
    if (tierTotals[tier]) {
      tierTotals[tier].tokens += agent.tokensUsedThisWeek;
      tierTotals[tier].cost += agent.costThisWeek;
      tierTotals[tier].count++;
    }
  }

  // Top cost agents (sorted descending)
  const topAgents = [...agents]
    .filter((a) => a.costThisWeek > 0)
    .sort((a, b) => b.costThisWeek - a.costThisWeek)
    .slice(0, 10);

  const tierLabel: Record<string, string> = {
    fast: "Haiku (fast)",
    standard: "Sonnet (standard)",
    judgment: "Opus (judgment)",
  };

  const changePercent = costTrend?.changePercent;

  return (
    <TermPanel>
      <TermHeader icon={DollarSign} label="Cost Dashboard (This Week)" />

      <div className="space-y-4">
        {/* Total + trend */}
        <div className="flex items-baseline gap-3">
          <span className="text-xl font-bold text-green-400 font-mono">
            {formatCost(summary?.totalWeeklyCost ?? 0)}
          </span>
          <span className="text-xs text-gray-500 font-mono">
            {formatTokens(summary?.totalWeeklyTokens ?? 0)} tokens
          </span>
          {changePercent !== undefined && (
            <span className={`text-xs font-mono font-bold ${
              changePercent > 20 ? "text-red-400" : changePercent < -10 ? "text-green-400" : "text-gray-400"
            }`}>
              {changePercent > 0 ? "+" : ""}{changePercent.toFixed(0)}% vs last week
            </span>
          )}
        </div>

        {/* By tier */}
        <div className="grid grid-cols-3 gap-3">
          {(["fast", "standard", "judgment"] as const).map((tier) => {
            const data = tierTotals[tier];
            return (
              <div key={tier} className="rounded-lg bg-[#0d1117] border border-gray-800 p-3">
                <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">{tierLabel[tier]}</p>
                <p className="text-sm text-green-400 font-mono font-bold">{formatCost(data.cost)}</p>
                <p className="text-[10px] text-gray-600 font-mono">{formatTokens(data.tokens)} tkn</p>
                <p className="text-[10px] text-gray-600">{data.count} agents</p>
              </div>
            );
          })}
        </div>

        {/* Top cost agents table */}
        {topAgents.length > 0 && (
          <div>
            <p className="text-[10px] text-gray-500 uppercase font-bold mb-2">Cost Per Agent</p>
            <div className="space-y-0.5">
              <div className="grid grid-cols-[1fr_80px_80px_60px] gap-2 text-[10px] text-gray-600 uppercase font-bold pb-1 border-b border-gray-800">
                <span>Agent</span>
                <span>Cost</span>
                <span>Tokens</span>
                <span>Tier</span>
              </div>
              {topAgents.map((agent) => (
                <div key={agent.name} className="grid grid-cols-[1fr_80px_80px_60px] gap-2 items-center py-1 border-b border-gray-800/30 last:border-0">
                  <span className="text-xs text-green-400 truncate">{agent.displayName}</span>
                  <span className="text-xs text-gray-400 font-mono">{formatCost(agent.costThisWeek)}</span>
                  <span className="text-xs text-gray-500 font-mono">{formatTokens(agent.tokensUsedThisWeek)}</span>
                  <span className={`text-[10px] font-mono ${
                    agent.tier === "judgment" ? "text-purple-400" : agent.tier === "fast" ? "text-blue-400" : "text-gray-400"
                  }`}>
                    {agent.tier}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {topAgents.length === 0 && (
          <p className="text-xs text-gray-600 font-mono">No cost data recorded this week.</p>
        )}
      </div>
    </TermPanel>
  );
}

// ---- NEW: Email Delivery Health (technical) ----------------------------------

function EmailDeliveryHealth() {
  const { data: healthData, isLoading } = useQuery<EmailHealthData>({
    queryKey: ["email-health-build"],
    queryFn: async () => {
      const res = await apiGet({ path: "/webhooks/mailgun/health" });
      return res?.success ? res : null;
    },
    retry: false,
    staleTime: 120_000,
  });

  const { data: webhookHealth } = useQuery({
    queryKey: ["webhook-health-build"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/webhooks/health" });
      return res?.success ? (res?.webhooks || []) : [];
    },
    retry: false,
    staleTime: 120_000,
  });

  const mailgunWebhook = (webhookHealth ?? []).find((w: any) => w.name === "Mailgun");

  return (
    <TermPanel>
      <TermHeader icon={Mail} label="Email Delivery Health" />

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : !healthData ? (
        <p className="text-xs text-gray-600 font-mono">No email data available. Mailgun events have not been received yet.</p>
      ) : (
        <div className="space-y-4">
          {/* Key metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: "Delivery Rate",
                value: `${healthData.deliveryRate}%`,
                status: healthData.deliveryRate >= 98 ? "ok" : healthData.deliveryRate >= 95 ? "unknown" : "fail",
              },
              {
                label: "Bounce Rate",
                value: `${healthData.bounceRate}%`,
                status: healthData.bounceRate <= 2 ? "ok" : healthData.bounceRate <= 5 ? "unknown" : "fail",
              },
              {
                label: "Complaint Rate",
                value: `${healthData.complaintRate}%`,
                status: healthData.complaintRate <= 0.1 ? "ok" : healthData.complaintRate <= 0.3 ? "unknown" : "fail",
              },
              {
                label: "Open Rate",
                value: `${healthData.openRate}%`,
                status: healthData.openRate >= 20 ? "ok" : healthData.openRate >= 10 ? "unknown" : "fail",
              },
            ].map((metric) => (
              <div key={metric.label} className="flex items-center gap-2">
                <StatusDot status={metric.status as "ok" | "fail" | "unknown"} />
                <div>
                  <p className="text-sm text-green-400 font-medium font-mono">{metric.value}</p>
                  <p className="text-[10px] text-gray-500">{metric.label}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-lg bg-[#0d1117] border border-gray-800 p-3">
            <p className="text-[10px] text-gray-500 font-mono mb-1">
              Total emails (30d): {healthData.totalEmails}
            </p>
            <p className="text-[10px] text-gray-500 font-mono mb-1">
              Click rate: {healthData.clickRate}%
            </p>
            {mailgunWebhook && (
              <p className="text-[10px] text-gray-500 font-mono">
                Mailgun webhook: {mailgunWebhook.status === "active" ? "active" : mailgunWebhook.status}
                {mailgunWebhook.last_received_at ? ` . last event: ${timeAgo(mailgunWebhook.last_received_at)}` : ""}
                {mailgunWebhook.env_var_configured ? "" : " . API KEY NOT SET"}
              </p>
            )}
          </div>

          {/* Alerts */}
          {healthData.bounceRate > 2 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-800/50 bg-red-900/10">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <p className="text-xs text-red-400 font-mono">
                Bounce rate exceeds 2% threshold. Check for invalid addresses or domain issues.
              </p>
            </div>
          )}
          {healthData.complaintRate > 0.1 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-800/50 bg-red-900/10">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <p className="text-xs text-red-400 font-mono">
                Complaint rate elevated. Risk of domain reputation damage.
              </p>
            </div>
          )}
        </div>
      )}
    </TermPanel>
  );
}

// ---- Panel 3: Recent Errors ------------------------------------------------

interface AgentErrorEntry {
  id: number;
  agent_type: string;
  org_name: string | null;
  error_message: string | null;
  status: string;
  created_at: string;
}

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

  // Also fetch agent_results with error status
  const { data: agentErrorData } = useQuery({
    queryKey: ["agent-errors-build"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/agent-activity" });
      if (res?.success === false) return [];
      const all = (res?.results || []) as AgentErrorEntry[];
      return all.filter(
        (r) => r.status === "error" || r.status === "failed"
      );
    },
    retry: false,
    staleTime: 60_000,
  });

  const events = errorData ?? [];
  const agentErrors = agentErrorData ?? [];

  // Group behavioral events by event_type
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

  const hasContent = entries.length > 0 || agentErrors.length > 0;

  return (
    <TermPanel>
      <TermHeader icon={AlertTriangle} label="Recent Errors (24h)" />

      {!hasContent ? (
        <TailorText editKey="hq.build.errors.noErrors" defaultText="$ tail -f /var/log/errors ... No errors in the last 24h." as="p" className="text-sm text-green-500" />
      ) : (
        <div className="space-y-4">
          {/* Agent execution errors */}
          {agentErrors.length > 0 && (
            <div>
              <p className="text-[10px] text-red-500 uppercase font-bold mb-2">Agent Execution Errors</p>
              <div className="space-y-1">
                {agentErrors.map((err) => (
                  <div
                    key={err.id}
                    className="flex items-start gap-3 rounded-lg px-3 py-2 border border-red-800/50 bg-red-900/10"
                  >
                    <StatusDot status="fail" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-red-400 font-medium truncate">
                        {err.agent_type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {err.error_message || "Unknown error"}
                        {err.org_name ? ` . ${err.org_name}` : ""}
                      </p>
                    </div>
                    <span className="text-xs text-gray-600 shrink-0">
                      {timeAgo(err.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Behavioral event errors */}
          {entries.length > 0 && (
            <div>
              {agentErrors.length > 0 && (
                <p className="text-[10px] text-gray-500 uppercase font-bold mb-2">Behavioral Events</p>
              )}
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
            </div>
          )}
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
          <TailorText editKey="hq.build.deploy.sandboxLabel" defaultText="Active development" as="span" className="text-xs text-gray-600" />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-sm text-blue-400 font-medium">main</span>
          </div>
          <TailorText editKey="hq.build.deploy.mainLabel" defaultText="Production" as="span" className="text-xs text-gray-600" />
        </div>

        <div className="rounded-lg bg-[#0d1117] border border-gray-800 p-3">
          <p className="text-xs text-gray-500 font-mono">
            $ git log --oneline -1
          </p>
          <TailorText editKey="hq.build.deploy.mergeNote" defaultText="sandbox is ahead of production. Merge requires Dave review." as="p" className="text-xs text-green-400 font-mono mt-1" />
        </div>

        <div>
          <TailorText editKey="hq.build.deploy.pendingMigrations" defaultText="Pending Migrations" as="p" className="text-[10px] text-gray-600 uppercase font-bold mb-2" />
          <p className="text-xs text-gray-500 font-mono">
            $ npx knex migrate:status
          </p>
          <TailorText editKey="hq.build.deploy.migrationsStatus" defaultText="All migrations applied. Run `npx knex migrate:latest` to verify." as="p" className="text-xs text-green-500 font-mono mt-1" />
        </div>
      </div>
    </TermPanel>
  );
}

// ---- Panel 5: Dave's Tasks -------------------------------------------------

function DaveTasksPanel({
  tasks,
  briefSections,
}: {
  tasks: DreamTeamTask[];
  briefSections: BriefSection[];
}) {
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

  // Extract task-like items from personal agent brief sections
  const briefTaskItems = briefSections
    .filter(
      (s) =>
        s.title.toLowerCase().includes("task") ||
        s.title.toLowerCase().includes("queue") ||
        s.title.toLowerCase().includes("action") ||
        s.title.toLowerCase().includes("deploy") ||
        s.title.toLowerCase().includes("migration")
    )
    .flatMap((s) => s.items);

  const hasContent = daveTasks.length > 0 || briefTaskItems.length > 0;

  return (
    <TermPanel>
      <TermHeader icon={ListTodo} label="Dave's Tasks" />

      {!hasContent ? (
        <TailorText editKey="hq.build.daveTasks.empty" defaultText="Queue empty. Standing by." as="p" className="text-sm text-green-500" />
      ) : (
        <div className="space-y-2">
          {/* Brief-sourced task items */}
          {briefTaskItems.map((item, i) => (
            <div
              key={`brief-${i}`}
              className="flex items-center justify-between rounded-lg px-3 py-2.5 border border-blue-800/50 bg-blue-900/10"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-blue-400 truncate">
                  {item}
                </p>
                <p className="text-[10px] text-gray-600">from agent brief</p>
              </div>
              <span className="shrink-0 ml-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-900/50 text-blue-400">
                brief
              </span>
            </div>
          ))}

          {/* dream_team_tasks items */}
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

// ---- Health Score Gauge -----------------------------------------------------

function parseHealthScore(signoff: string): number | null {
  // Signoff format: "System health score: 87/100 ..."
  const match = signoff.match(/health score:\s*(\d+)\/100/i);
  return match ? parseInt(match[1], 10) : null;
}

function HealthScoreGauge({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <div className="flex items-center gap-2">
        <Gauge className="h-5 w-5 text-gray-600" />
        <span className="text-sm text-gray-600">Loading...</span>
      </div>
    );
  }

  const color =
    score >= 80
      ? "text-green-400"
      : score >= 50
        ? "text-amber-400"
        : "text-red-400";

  const borderColor =
    score >= 80
      ? "border-green-500/30"
      : score >= 50
        ? "border-amber-500/30"
        : "border-red-500/30";

  const bgColor =
    score >= 80
      ? "bg-green-500/10"
      : score >= 50
        ? "bg-amber-500/10"
        : "bg-red-500/10";

  return (
    <div className={`flex items-center gap-3 rounded-lg border ${borderColor} ${bgColor} px-4 py-2`}>
      <Gauge className={`h-5 w-5 ${color}`} />
      <div className="flex items-baseline gap-1.5">
        <span className={`text-2xl font-bold tabular-nums ${color}`}>
          {score}
        </span>
        <span className="text-sm text-gray-500">/100</span>
      </div>
      <TailorText
        editKey="hq.build.healthScore.label"
        defaultText="System Health"
        as="span"
        className="text-xs text-gray-500 ml-1"
      />
    </div>
  );
}

// ---- Main ------------------------------------------------------------------

export default function BuildView() {
  const { userProfile } = useAuth();

  const { data: scheduleData } = useQuery({
    queryKey: ["admin-schedules"],
    queryFn: fetchSchedules,
  });

  const schedules: Schedule[] = Array.isArray(scheduleData)
    ? scheduleData
    : [];
  void schedules;

  const { data: taskData } = useQuery({
    queryKey: ["dream-team-tasks-build"],
    queryFn: () => fetchDreamTeamTasks(),
    retry: false,
    staleTime: 60_000,
  });
  const tasks: DreamTeamTask[] = taskData?.tasks ?? [];

  // Personal agent brief for build role
  const { data: briefRaw } = useQuery({
    queryKey: ["personal-agent-brief-build"],
    queryFn: async () => {
      const res = await apiGet({ path: "/personal-agent/brief?role=build" });
      return res as PersonalBriefResponse;
    },
    refetchInterval: 60_000,
    retry: false,
    staleTime: 30_000,
  });

  const briefData = briefRaw?.success ? briefRaw.data : null;
  const healthScore = briefData?.signoff
    ? parseHealthScore(briefData.signoff)
    : null;
  const briefSections = briefData?.sections ?? [];

  // Greeting: use first name from auth profile
  const firstName = userProfile?.firstName || "Dave";

  return (
    <div className="min-h-screen bg-[#0d1117] text-green-400 font-mono">
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        {/* Terminal header with greeting and health score */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-gray-500">
              Hey {firstName}.
            </p>
            <div className="flex items-center gap-3">
              <Terminal className="h-5 w-5 text-green-500" />
              <TailorText editKey="hq.build.header.prompt" defaultText="alloro@prod:~$" as="h1" className="text-lg font-bold text-green-400" />
              <TailorText editKey="hq.build.header.subtitle" defaultText="Build Console" as="span" className="text-xs text-gray-600" />
            </div>
          </div>

          {/* Health score gauge, the ONE prominent element */}
          <HealthScoreGauge score={healthScore} />
        </div>

        {/* Agent headline from brief */}
        {briefData?.headline && (
          <div className="rounded-lg border border-gray-800 bg-[#161b22] px-5 py-3">
            <p className="text-sm text-green-300">{briefData.headline}</p>
          </div>
        )}

        {/* Panel 1: System Status */}
        <SystemStatusPanel />

        {/* Panel 2: Agent Health Grid (NEW - technical mission control) */}
        <AgentHealthGrid />

        {/* Panel 3: Cost Dashboard (NEW) */}
        <CostDashboard />

        {/* Panel 4: Email Delivery Health (NEW) */}
        <EmailDeliveryHealth />

        {/* Panel 5: Recent Errors */}
        <RecentErrorsPanel />

        {/* Panels 6 + 7: Deploy Status | Dave's Tasks */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DeployStatusPanel />
          <DaveTasksPanel tasks={tasks} briefSections={briefSections} />
        </div>
      </div>
    </div>
  );
}
