/**
 * Integrator View -- Jo's Ops Console
 *
 * Studio McGee-style makeover. Every element answers: "What needs my attention today?"
 * Mobile-first (max-w-lg). Jo checks on her phone.
 *
 * 1. Personal greeting with agent brief summary
 * 2. Weekly Pulse (are we growing?)
 * 3. Client Health Grid (hero section)
 * 4. Agent Pipeline Status (factory floor view)
 * 5. Blocker Panel (overdue tasks, open circuits, email alerts)
 * 6. Today's Actions (from personal agent brief)
 * 7. Trial Pipeline
 * 8. Revenue Snapshot (compact)
 * 9. This Week's Numbers (compact row)
 * 10. My Flags
 * 11. Dream Team Activity
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { TailorText } from "@/components/TailorText";
import {
  Heart,
  Clock,
  TrendingUp,
  BarChart3,
  CheckCircle2,
  Circle,
  ExternalLink,
  Users,
  Zap,
  FileCheck,
  Send,
  Flag,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  ClipboardList,
  Bot,
  AlertTriangle,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import {
  adminListOrganizations,
  type AdminOrganization,
} from "@/api/admin-organizations";
import {
  fetchDreamTeamTasks,
} from "@/api/dream-team";
import { apiGet, apiPost, apiPatch } from "@/api/index";
import { useAuth } from "@/hooks/useAuth";
import { KillSwitchBanner } from "@/components/Admin/KillSwitchBanner";
import { useBusinessMetrics } from "@/hooks/useBusinessMetrics";

// ---- Constants ---------------------------------------------------------------

const TEST_ORG_PATTERNS = /test|preflight|pre-mortem|smoke/i;

// ---- Types -------------------------------------------------------------------

interface ClientHealthEntry {
  id: number;
  name: string;
  health: "green" | "amber" | "red";
  score?: number;
  risk?: string;
  last_login?: string;
  recommended_action?: string;
}

interface BriefSection {
  title: string;
  items: string[];
}

interface PersonalBrief {
  headline: string;
  sections: BriefSection[];
  signoff: string;
  urgentCount: number;
}

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

interface EmailHealthData {
  deliveryRate: number;
  openRate: number;
  bounceRate: number;
  complaintRate: number;
  totalEmails: number;
}

interface EmailMetricsData {
  totals: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    complained: number;
  };
}

// ---- Helpers -----------------------------------------------------------------

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function daysBetween(from: string, to: Date): number {
  return Math.floor(
    (to.getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function filterTestOrgs<T extends { name: string }>(items: T[]): T[] {
  return items.filter((item) => !TEST_ORG_PATTERNS.test(item.name));
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// ---- Shared UI ---------------------------------------------------------------

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white rounded-2xl p-6 border border-gray-100 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionLabel({
  icon: Icon,
  label,
  count,
  iconColor = "text-gray-400",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
  iconColor?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className={`h-4 w-4 ${iconColor}`} />
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        {label}
      </p>
      {count !== undefined && count > 0 && (
        <span className="ml-auto text-xs font-bold text-[#D56753] bg-[#D56753]/10 px-2 py-0.5 rounded-full">
          {count}
        </span>
      )}
    </div>
  );
}

function PipelineDot({ status }: { status: "green" | "amber" | "red" | "gray" }) {
  const colors: Record<string, string> = {
    green: "bg-emerald-500",
    amber: "bg-amber-400",
    red: "bg-red-500",
    gray: "bg-gray-300",
  };
  return <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${colors[status]}`} />;
}

// ---- Section 0: Sandbox Changelog (What's New) + Deploy Status ---------------

function SandboxChangelog() {
  const { data: buildEvents, isLoading } = useQuery({
    queryKey: ["integrator-build-events"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/behavioral-events?limit=200" });
      if (!res || res.success === false) return [];
      const events = (res?.events || []) as Array<{
        event_type: string;
        created_at: string;
        properties?: any;
      }>;
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return events.filter(
        (e) =>
          (e.event_type.startsWith("build.") ||
            e.event_type.startsWith("deploy.") ||
            e.event_type.startsWith("commit.")) &&
          new Date(e.created_at).getTime() > weekAgo
      );
    },
    retry: false,
    staleTime: 60_000,
  });

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const latestDeploy = buildEvents?.find(
    (e) => e.event_type.startsWith("deploy.") || e.event_type.startsWith("build.")
  );

  return (
    <div className="space-y-3">
      {/* Deploy status indicator */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50/50 border border-emerald-100">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" style={{ animationDuration: "3s" }} />
        <span className="text-xs font-semibold text-emerald-700">Pipeline: GREEN</span>
        <span className="text-xs text-gray-400 ml-auto">
          {latestDeploy
            ? `Last push: ${formatDate(latestDeploy.created_at)}`
            : "No deploys this week"}
        </span>
      </div>

      {/* Build log */}
      {isLoading ? (
        <div className="h-12 animate-pulse rounded-xl bg-gray-50" />
      ) : buildEvents && buildEvents.length > 0 ? (
        <ul className="space-y-1.5">
          {buildEvents.slice(0, 8).map((evt, i) => {
            const summary =
              evt.properties?.message ||
              evt.properties?.summary ||
              evt.event_type.replace(/^(build\.|deploy\.|commit\.)/, "");
            return (
              <li key={i} className="flex items-start gap-2 text-xs text-[#212D40]">
                <span className="text-gray-400 shrink-0 w-12">{formatDate(evt.created_at)}</span>
                <span className="leading-relaxed">{summary}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-gray-400 italic">
          Build log connects when the agent pipeline activates.
        </p>
      )}
    </div>
  );
}

// ---- Section 1: Greeting -----------------------------------------------------

function Greeting({
  firstName,
  brief,
  isLoading,
}: {
  firstName: string;
  brief: PersonalBrief | null;
  isLoading: boolean;
}) {
  const greeting = getGreeting();
  const urgentCount = brief?.urgentCount ?? 0;

  let subtitle: string;
  if (isLoading) {
    subtitle = "Checking in with your agents...";
  } else if (urgentCount > 0) {
    subtitle = `${urgentCount} thing${urgentCount !== 1 ? "s" : ""} need${urgentCount === 1 ? "s" : ""} you today.`;
  } else {
    subtitle = "All clear. Your agents are handling it.";
  }

  return (
    <div className="pb-1">
      <h1 className="text-2xl font-bold text-[#212D40] tracking-tight">
        {greeting}, {firstName}.
      </h1>
      <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
      {brief?.headline && !isLoading && (
        <p className="text-sm text-gray-600 mt-2 leading-relaxed">
          {brief.headline}
        </p>
      )}
    </div>
  );
}

// ---- NEW: Weekly Pulse -------------------------------------------------------

function WeeklyPulse({ orgs }: { orgs: AdminOrganization[] }) {
  const filtered = filterTestOrgs(orgs);

  // Fetch behavioral events for checkups and referrals this week
  const { data: eventsData } = useQuery({
    queryKey: ["integrator-weekly-pulse-events"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/behavioral-events?limit=500" });
      return res?.success !== false ? ((res?.events || []) as Array<{ event_type: string; created_at: string; properties?: any }>) : [];
    },
    retry: false,
    staleTime: 60_000,
  });

  const events = eventsData ?? [];
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

  // Current week signups
  const newSignupsThisWeek = filtered.filter(
    (o) => new Date(o.created_at).getTime() > weekAgo
  ).length;
  const newSignupsLastWeek = filtered.filter(
    (o) => {
      const t = new Date(o.created_at).getTime();
      return t > twoWeeksAgo && t <= weekAgo;
    }
  ).length;

  // MRR from single source of truth
  const { data: metrics } = useBusinessMetrics();
  const mrr = metrics?.mrr.total ?? 0;

  // Checkups and referrals from events
  const thisWeekEvents = events.filter((e) => new Date(e.created_at).getTime() > weekAgo);
  const checkupsThisWeek = thisWeekEvents.filter(
    (e) => e.event_type === "checkup.completed" || e.event_type === "checkup.generated"
  ).length;
  const referralsThisWeek = thisWeekEvents.filter(
    (e) => e.event_type === "referral.generated" || e.event_type === "referral.sent"
  ).length;

  // Growth indicator
  const isGrowing = newSignupsThisWeek >= newSignupsLastWeek && newSignupsThisWeek > 0;
  const growthRate = newSignupsLastWeek > 0
    ? Math.round(((newSignupsThisWeek - newSignupsLastWeek) / newSignupsLastWeek) * 100)
    : newSignupsThisWeek > 0
      ? 100
      : 0;

  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  return (
    <div className="space-y-4">
      {/* Hero: Are we growing? */}
      <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${
        isGrowing ? "bg-emerald-50/50 border-emerald-100" : "bg-amber-50/50 border-amber-100"
      }`}>
        {isGrowing ? (
          <ArrowUpRight className="w-5 h-5 text-emerald-600" />
        ) : growthRate < 0 ? (
          <ArrowDownRight className="w-5 h-5 text-red-500" />
        ) : (
          <Minus className="w-5 h-5 text-amber-500" />
        )}
        <div>
          <p className={`text-sm font-bold ${isGrowing ? "text-emerald-700" : "text-amber-700"}`}>
            {isGrowing ? "YES" : "NOT YET"}
            {growthRate !== 0 && (
              <span className="text-xs font-medium ml-1.5">
                ({growthRate > 0 ? "+" : ""}{growthRate}% signups vs last week)
              </span>
            )}
          </p>
          <p className="text-xs text-gray-500">Are we growing?</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="text-center py-3 px-2 rounded-xl bg-gray-50/50 border border-gray-100">
          <p className="text-lg font-bold text-[#212D40]">{formatter.format(mrr)}</p>
          <p className="text-xs text-gray-400 uppercase font-medium tracking-wider mt-0.5">MRR</p>
        </div>
        <div className="text-center py-3 px-2 rounded-xl bg-gray-50/50 border border-gray-100">
          <p className="text-lg font-bold text-[#212D40]">{newSignupsThisWeek}</p>
          <p className="text-xs text-gray-400 uppercase font-medium tracking-wider mt-0.5">New Signups</p>
        </div>
        <div className="text-center py-3 px-2 rounded-xl bg-gray-50/50 border border-gray-100">
          <p className="text-lg font-bold text-[#212D40]">{checkupsThisWeek}</p>
          <p className="text-xs text-gray-400 uppercase font-medium tracking-wider mt-0.5">Checkups</p>
        </div>
        <div className="text-center py-3 px-2 rounded-xl bg-gray-50/50 border border-gray-100">
          <p className="text-lg font-bold text-[#212D40]">{referralsThisWeek}</p>
          <p className="text-xs text-gray-400 uppercase font-medium tracking-wider mt-0.5">Referrals</p>
        </div>
      </div>
    </div>
  );
}

// ---- NEW: Agent Pipeline Status (factory floor view) -------------------------

function AgentPipelineStatus() {
  const { data: mcData, isLoading } = useQuery<MissionControlData>({
    queryKey: ["mission-control-integrator"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/mission-control" });
      return res?.success ? res : null;
    },
    refetchInterval: 60_000,
    retry: false,
    staleTime: 30_000,
  });

  const { data: emailHealth } = useQuery<EmailHealthData>({
    queryKey: ["email-health-integrator"],
    queryFn: async () => {
      const res = await apiGet({ path: "/webhooks/mailgun/health" });
      return res?.success ? res : null;
    },
    retry: false,
    staleTime: 120_000,
  });

  const { data: emailMetrics } = useQuery<EmailMetricsData>({
    queryKey: ["email-metrics-integrator"],
    queryFn: async () => {
      const res = await apiGet({ path: "/webhooks/mailgun/metrics" });
      return res?.success ? res : null;
    },
    retry: false,
    staleTime: 120_000,
  });

  const { data: healthRaw } = useQuery({
    queryKey: ["admin-client-health-pipeline"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/client-health" });
      return res?.success !== false
        ? ((res?.clients || res?.entries || []) as ClientHealthEntry[])
        : [];
    },
    retry: false,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl border border-gray-200 bg-gray-50" />
        ))}
      </div>
    );
  }

  const summary = mcData?.summary;

  // Client health this week
  const clients = healthRaw ?? [];
  const greenClients = clients.filter((c) => c.health === "green").length;
  const amberClients = clients.filter((c) => c.health === "amber").length;
  const redClients = clients.filter((c) => c.health === "red").length;

  const clientStatus: "green" | "amber" | "red" = redClients > 0 ? "red" : amberClients > 0 ? "amber" : "green";

  // Email pipeline
  const emailsSent = emailMetrics?.totals?.delivered ?? 0;
  const openRate = emailHealth?.openRate ?? 0;
  const bounceRate = emailHealth?.bounceRate ?? 0;
  const emailStatus: "green" | "amber" | "red" = bounceRate > 5 ? "red" : bounceRate > 2 ? "amber" : "green";

  // Agent pipeline status
  const failedAgents = summary?.failed ?? 0;
  const degradedAgents = summary?.degraded ?? 0;
  const agentStatus: "green" | "amber" | "red" = failedAgents > 0 ? "red" : degradedAgents > 0 ? "amber" : "green";

  // Content pipeline: agents in Growth Engine team
  const growthTeam = mcData?.byTeam?.["Growth Engine"] ?? [];
  const growthFailed = growthTeam.filter((a) => a.status === "failed").length;
  const growthActive = growthTeam.filter((a) => a.weeklyRuns > 0).length;
  const contentStatus: "green" | "amber" | "red" = growthFailed > 0 ? "red" : growthActive === 0 ? "gray" as "amber" : "green";

  const pipelines = [
    {
      label: `Client health: ${greenClients} green, ${amberClients} amber, ${redClients} red`,
      status: clientStatus,
    },
    {
      label: emailsSent > 0
        ? `Email delivery: ${emailsSent} sent, ${openRate}% opened${bounceRate > 2 ? `, ${bounceRate}% bounced` : ""}`
        : "Email delivery: no events yet",
      status: emailsSent > 0 ? emailStatus : "gray" as "green",
    },
    {
      label: `Agent fleet: ${summary?.nominal ?? 0} nominal, ${degradedAgents} degraded, ${failedAgents} failed`,
      status: agentStatus,
    },
    {
      label: `Growth engine: ${growthActive} active, ${growthFailed} failed this week`,
      status: contentStatus,
    },
  ];

  return (
    <div className="space-y-2">
      {pipelines.map((p, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 bg-gray-50/50"
        >
          <PipelineDot status={p.status} />
          <p className="text-sm text-[#212D40]">{p.label}</p>
        </div>
      ))}
    </div>
  );
}

// ---- NEW: Blocker Panel ------------------------------------------------------

function BlockerPanel() {
  const { data: mcData } = useQuery<MissionControlData>({
    queryKey: ["mission-control-integrator"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/mission-control" });
      return res?.success ? res : null;
    },
    refetchInterval: 60_000,
    retry: false,
    staleTime: 30_000,
  });

  const { data: taskData } = useQuery({
    queryKey: ["dream-team-tasks-integrator"],
    queryFn: () => fetchDreamTeamTasks(),
    retry: false,
    staleTime: 60_000,
  });

  const { data: emailHealth } = useQuery<EmailHealthData>({
    queryKey: ["email-health-integrator"],
    queryFn: async () => {
      const res = await apiGet({ path: "/webhooks/mailgun/health" });
      return res?.success ? res : null;
    },
    retry: false,
    staleTime: 120_000,
  });

  const blockers: Array<{ text: string; severity: "red" | "amber" }> = [];

  // Overdue/stuck tasks
  const tasks = taskData?.tasks ?? [];
  const overdueTasks = tasks.filter(
    (t) => t.status !== "done" && t.due_date && new Date(t.due_date) < new Date()
  );
  if (overdueTasks.length > 0) {
    blockers.push({
      text: `${overdueTasks.length} overdue task${overdueTasks.length !== 1 ? "s" : ""}: ${overdueTasks.slice(0, 2).map((t) => t.title).join(", ")}${overdueTasks.length > 2 ? "..." : ""}`,
      severity: "red",
    });
  }

  // Stuck tasks (open > 7 days, no progress)
  const stuckTasks = tasks.filter(
    (t) =>
      t.status === "open" &&
      daysBetween(t.created_at, new Date()) > 7
  );
  if (stuckTasks.length > 0) {
    blockers.push({
      text: `${stuckTasks.length} task${stuckTasks.length !== 1 ? "s" : ""} open for 7+ days`,
      severity: "amber",
    });
  }

  // Open circuits
  const agents = (mcData?.agents ?? []) as Array<{ circuitState: string; displayName: string }>;
  const openCircuits = agents.filter((a) => a.circuitState === "open");
  if (openCircuits.length > 0) {
    blockers.push({
      text: `${openCircuits.length} agent circuit${openCircuits.length !== 1 ? "s" : ""} tripped: ${openCircuits.slice(0, 3).map((a: { displayName: string }) => a.displayName).join(", ")}`,
      severity: "red",
    });
  }

  // Email deliverability
  const bounceRate = emailHealth?.bounceRate ?? 0;
  if (bounceRate > 2) {
    blockers.push({
      text: `Email bounce rate at ${bounceRate}% (threshold: 2%)`,
      severity: bounceRate > 5 ? "red" : "amber",
    });
  }

  const complaintRate = emailHealth?.complaintRate ?? 0;
  if (complaintRate > 0.1) {
    blockers.push({
      text: `Email complaint rate at ${complaintRate}%`,
      severity: "red",
    });
  }

  if (blockers.length === 0) {
    return (
      <div className="flex items-center gap-3 px-4 py-4">
        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
        <p className="text-sm text-gray-500">No blockers. Everything is flowing.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {blockers.map((b, i) => (
        <div
          key={i}
          className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${
            b.severity === "red"
              ? "border-red-200 bg-red-50/50"
              : "border-amber-200 bg-amber-50/50"
          }`}
        >
          <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${
            b.severity === "red" ? "text-red-500" : "text-amber-500"
          }`} />
          <p className={`text-sm ${
            b.severity === "red" ? "text-red-700" : "text-amber-700"
          }`}>
            {b.text}
          </p>
        </div>
      ))}
    </div>
  );
}

// ---- Section 2: Client Health Grid -------------------------------------------

function HealthDot({ health }: { health: string }) {
  const colors: Record<string, string> = {
    red: "bg-red-500",
    amber: "bg-amber-400",
    green: "bg-emerald-500",
  };
  return (
    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${colors[health] ?? colors.green}`} />
  );
}

function ClientHealthCard({ entry }: { entry: ClientHealthEntry }) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-colors">
      <HealthDot health={entry.health} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[#212D40] truncate">{entry.name}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {entry.risk || (entry.last_login ? `Last login ${timeAgo(entry.last_login)}` : "No login yet")}
        </p>
      </div>
      <button
        onClick={() => navigate(`/admin/organizations/${entry.id}`)}
        className="shrink-0 text-xs font-medium text-[#D56753] hover:text-[#c05545] bg-[#D56753]/8 hover:bg-[#D56753]/15 px-3 py-1.5 rounded-lg transition-colors"
      >
        {entry.recommended_action === "Send check-in" ? (
          <span className="flex items-center gap-1"><Send className="w-3 h-3" /> <TailorText editKey="hq.integrator.health.checkIn" defaultText="Check in" /></span>
        ) : (
          <span className="flex items-center gap-1"><ExternalLink className="w-3 h-3" /> <TailorText editKey="hq.integrator.health.view" defaultText="View" /></span>
        )}
      </button>
    </div>
  );
}

function ClientHealthGrid() {
  const { data: healthRaw, isLoading } = useQuery({
    queryKey: ["admin-client-health-integrator"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/client-health" });
      return res?.success !== false
        ? ((res?.clients || res?.entries || []) as ClientHealthEntry[])
        : [];
    },
    retry: false,
    staleTime: 60_000,
  });

  const { data: orgData } = useQuery({
    queryKey: ["admin-organizations"],
    queryFn: adminListOrganizations,
  });

  const orgs: AdminOrganization[] =
    (orgData as any)?.organizations ?? (Array.isArray(orgData) ? orgData : []);

  // Build health entries, falling back to org data if health endpoint is sparse
  const healthMap = new Map<number, ClientHealthEntry>();
  (healthRaw ?? []).forEach((c) => healthMap.set(c.id, c));

  const allEntries: ClientHealthEntry[] = filterTestOrgs(orgs).map((org) => {
    const existing = healthMap.get(org.id);
    if (existing) return existing;
    return {
      id: org.id,
      name: org.name,
      health: org.connections?.gbp ? ("green" as const) : ("amber" as const),
      risk: org.connections?.gbp ? undefined : "No data connection",
      recommended_action: org.connections?.gbp ? undefined : "Push onboarding",
    };
  });

  const redEntries = allEntries.filter((e) => e.health === "red");
  const amberEntries = allEntries.filter((e) => e.health === "amber");
  const greenEntries = allEntries.filter((e) => e.health === "green");

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl border border-gray-200 bg-gray-50" />
        ))}
      </div>
    );
  }

  if (allEntries.length === 0) {
    return (
      <TailorText
        editKey="hq.integrator.health.noClients"
        defaultText="No clients yet. When someone signs up, their health will appear here."
        as="p"
        className="text-sm text-gray-400 text-center py-6"
      />
    );
  }

  return (
    <div>
      {/* Summary bar */}
      <div className="flex items-center gap-5 mb-4 text-sm font-medium">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <span className="text-gray-600">{redEntries.length}</span>
          <TailorText editKey="hq.integrator.health.red" defaultText="red" className="text-gray-400" />
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span className="text-gray-600">{amberEntries.length}</span>
          <TailorText editKey="hq.integrator.health.amber" defaultText="amber" className="text-gray-400" />
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="text-gray-600">{greenEntries.length}</span>
          <TailorText editKey="hq.integrator.health.green" defaultText="green" className="text-gray-400" />
        </span>
      </div>

      {/* Red and amber clients expanded */}
      <div className="space-y-2">
        {[...redEntries, ...amberEntries].map((entry) => (
          <ClientHealthCard key={entry.id} entry={entry} />
        ))}
      </div>

      {/* Green clients collapsed */}
      {greenEntries.length > 0 && (
        <div className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50/50 border border-emerald-100">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <p className="text-sm text-emerald-700 font-medium">
            {greenEntries.length} healthy client{greenEntries.length !== 1 ? "s" : ""}
          </p>
          <TailorText
            editKey="hq.integrator.health.greenNote"
            defaultText="on track"
            as="span"
            className="text-xs text-emerald-500"
          />
        </div>
      )}
    </div>
  );
}

// ---- Section 3: Today's Actions ----------------------------------------------

function ActionItem({
  text,
  onComplete,
}: {
  text: string;
  onComplete: (text: string) => void;
}) {
  const [checked, setChecked] = useState(false);

  const handleCheck = () => {
    if (!checked) {
      setChecked(true);
      onComplete(text);
    }
  };

  return (
    <button
      onClick={handleCheck}
      className={`flex items-start gap-3 w-full text-left px-4 py-3 rounded-xl border transition-all ${
        checked
          ? "border-emerald-100 bg-emerald-50/30 opacity-60"
          : "border-gray-100 bg-gray-50/50 hover:bg-gray-50"
      }`}
    >
      {checked ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
      ) : (
        <Circle className="w-4 h-4 text-gray-300 mt-0.5 shrink-0" />
      )}
      <span className={`text-sm leading-relaxed ${checked ? "text-gray-400 line-through" : "text-[#212D40]"}`}>
        {text}
      </span>
    </button>
  );
}

function TodaysActions({ brief }: { brief: PersonalBrief | null }) {
  const logAction = useMutation({
    mutationFn: async (actionText: string) => {
      try {
        await apiPost({
          path: "/behavioral-events",
          passedData: {
            event_type: "integrator.action_completed",
            properties: { action: actionText, completed_at: new Date().toISOString() },
          },
        });
      } catch {
        // Non-critical, don't block UI
      }
    },
  });

  // Collect all items from all brief sections
  const allItems: string[] = [];
  if (brief?.sections) {
    for (const section of brief.sections) {
      for (const item of section.items) {
        allItems.push(item);
      }
    }
  }

  if (allItems.length === 0) {
    return (
      <div className="flex items-center gap-3 px-4 py-4">
        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
        <TailorText
          editKey="hq.integrator.actions.empty"
          defaultText="Nothing pending. Your agents handled everything overnight."
          as="p"
          className="text-sm text-gray-500"
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {allItems.map((item, i) => (
        <ActionItem
          key={`${i}-${item.slice(0, 20)}`}
          text={item}
          onComplete={(text) => logAction.mutate(text)}
        />
      ))}
    </div>
  );
}

// ---- Section 4: Trial Pipeline -----------------------------------------------

function TrialPipeline({ orgs }: { orgs: AdminOrganization[] }) {
  const filtered = filterTestOrgs(orgs);
  const trialOrgs = filtered.filter(
    (o) =>
      o.subscription_status === "trial" ||
      (!o.subscription_tier && o.subscription_status !== "active")
  );

  if (trialOrgs.length === 0) {
    return (
      <div className="flex items-center gap-3 px-4 py-4">
        <Clock className="w-5 h-5 text-gray-300" />
        <TailorText
          editKey="hq.integrator.trials.empty"
          defaultText="No active trials. When someone starts one, you will see their progress here."
          as="p"
          className="text-sm text-gray-400"
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {trialOrgs.map((org) => {
        const daysIn = daysBetween(org.created_at, new Date());
        const trialLength = 14;
        const daysRemaining = Math.max(0, trialLength - daysIn);
        const hasConnection = org.connections?.gbp;
        const likelihood = hasConnection ? "high" : daysIn < 7 ? "medium" : "low";

        const likelihoodConfig: Record<string, { color: string; bg: string; label: string }> = {
          high: { color: "text-emerald-700", bg: "bg-emerald-50", label: "Likely" },
          medium: { color: "text-amber-700", bg: "bg-amber-50", label: "Possible" },
          low: { color: "text-red-700", bg: "bg-red-50", label: "At risk" },
        };
        const lc = likelihoodConfig[likelihood] ?? likelihoodConfig.medium;

        return (
          <div
            key={org.id}
            className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#212D40] truncate">{org.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} remaining
                {hasConnection ? " . Connected" : " . Not connected"}
              </p>
            </div>
            <span className={`shrink-0 text-xs font-bold uppercase px-2.5 py-1 rounded-full ${lc.bg} ${lc.color}`}>
              {lc.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---- Section 5: Revenue Snapshot ---------------------------------------------

function RevenueSnapshot({ orgs }: { orgs: AdminOrganization[] }) {
  const filtered = filterTestOrgs(orgs);
  const activeOrgs = filtered.filter((o) => o.subscription_status === "active");

  // MRR from single source of truth
  const { data: metrics } = useBusinessMetrics();
  const mrr = metrics?.mrr.total ?? 0;

  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs text-gray-400 uppercase font-semibold tracking-wider">
          <TailorText editKey="hq.integrator.revenue.label" defaultText="Monthly recurring" />
        </p>
        <p className="text-2xl font-bold text-[#212D40] mt-1">{formatter.format(mrr)}</p>
      </div>
      <div className="text-right">
        <p className="text-xs text-gray-400">
          <TailorText editKey="hq.integrator.revenue.activeLabel" defaultText="Active clients" />
        </p>
        <p className="text-lg font-bold text-[#212D40] mt-1">{activeOrgs.length}</p>
      </div>
    </div>
  );
}

// ---- Section 6: This Week's Numbers ------------------------------------------

function WeeklyNumbers({ orgs }: { orgs: AdminOrganization[] }) {
  const filtered = filterTestOrgs(orgs);

  // Count recent signups (last 7 days)
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const newSignups = filtered.filter(
    (o) => new Date(o.created_at).getTime() > weekAgo
  ).length;

  const stats = [
    { label: "New signups", value: newSignups, icon: Users },
    { label: "Active clients", value: filtered.filter((o) => o.subscription_status === "active").length, icon: FileCheck },
    { label: "Connected", value: filtered.filter((o) => o.connections?.gbp).length, icon: Zap },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {stats.map((stat) => (
        <div key={stat.label} className="text-center py-3 px-2 rounded-xl bg-gray-50/50 border border-gray-100">
          <stat.icon className="w-4 h-4 text-gray-400 mx-auto mb-1.5" />
          <p className="text-lg font-bold text-[#212D40]">{stat.value}</p>
          <p className="text-xs text-gray-400 uppercase font-medium tracking-wider mt-0.5">
            <TailorText editKey={`hq.integrator.weekly.${stat.label.toLowerCase().replace(/\s/g, "_")}`} defaultText={stat.label} />
          </p>
        </div>
      ))}
    </div>
  );
}

// ---- Feature 1: Blue Tape Button (Flag This) --------------------------------

function BlueTapeButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState<string | null>(null);

  const flagMutation = useMutation({
    mutationFn: async (msg: string) => {
      const res = await apiPost({
        path: "/admin/ceo-chat",
        passedData: { message: msg },
      });
      return res;
    },
    onSuccess: (data: any) => {
      setResponse(data?.response || "Flagged. The team will see this.");
    },
    onError: () => {
      setResponse("Something went wrong. Try again in a moment.");
    },
  });

  const queryClient = useQueryClient();

  const handleSubmit = () => {
    if (!message.trim()) return;
    flagMutation.mutate(message.trim());
  };

  const handleDismiss = () => {
    setIsOpen(false);
    setMessage("");
    setResponse(null);
    flagMutation.reset();
    // Refresh the task list after flagging
    queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
  };

  return (
    <>
      {/* Floating action button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[#D56753] text-white shadow-lg hover:bg-[#c05545] transition-colors flex items-center justify-center"
        aria-label="Flag this"
      >
        <Flag className="w-6 h-6" />
      </button>

      {/* Slide-up panel */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={handleDismiss}
          />

          {/* Panel */}
          <div className="relative w-full max-w-lg bg-white rounded-t-2xl shadow-xl p-6 animate-in slide-in-from-bottom duration-200">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Flag className="w-4 h-4 text-[#D56753]" />
                <h3 className="text-sm font-semibold text-[#212D40] uppercase tracking-wider">
                  Flag something
                </h3>
              </div>
              <button
                onClick={handleDismiss}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Input area */}
            {!response && (
              <>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What needs attention? Bug, idea, client concern..."
                  className="w-full border border-gray-200 rounded-xl p-3 text-sm text-[#212D40] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#D56753]/30 focus:border-[#D56753] resize-none"
                  rows={3}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      handleSubmit();
                    }
                  }}
                />
                <button
                  onClick={handleSubmit}
                  disabled={!message.trim() || flagMutation.isPending}
                  className="mt-3 w-full bg-[#D56753] text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-[#c05545] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {flagMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Routing...
                    </>
                  ) : (
                    <>
                      <Flag className="w-4 h-4" />
                      Flag it
                    </>
                  )}
                </button>
              </>
            )}

            {/* Response area */}
            {response && (
              <div className="space-y-3">
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <p className="text-sm text-[#212D40] leading-relaxed">{response}</p>
                </div>
                <button
                  onClick={handleDismiss}
                  className="w-full text-sm font-medium text-gray-500 hover:text-gray-700 py-2 transition-colors"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ---- Feature 2: My Flags / Task Board ----------------------------------------

interface TaskEntry {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  task_type?: string;
  blast_radius?: string;
  source_type: string;
  owner_name: string;
  created_at: string;
}

function BlastRadiusBadge({ radius }: { radius?: string }) {
  if (!radius) return null;
  const config: Record<string, { bg: string; text: string; label: string }> = {
    green: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Green" },
    yellow: { bg: "bg-amber-50", text: "text-amber-700", label: "Yellow" },
    red: { bg: "bg-red-50", text: "text-red-700", label: "Red" },
  };
  const c = config[radius] || config.green;
  return (
    <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

function PriorityDot({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    urgent: "bg-red-500",
    high: "bg-amber-500",
    normal: "bg-gray-300",
    low: "bg-gray-200",
  };
  return (
    <span
      className={`w-2 h-2 rounded-full shrink-0 ${colors[priority] ?? colors.normal}`}
      title={`Priority: ${priority}`}
    />
  );
}

function StatusSelect({
  taskId,
  currentStatus,
}: {
  taskId: string;
  currentStatus: string;
}) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (newStatus: string) => {
      return apiPatch({
        path: `/admin/tasks/${taskId}`,
        passedData: { status: newStatus },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
    },
  });

  const statusOptions = [
    { value: "open", label: "Open" },
    { value: "in_progress", label: "In Progress" },
    { value: "resolved", label: "Resolved" },
  ];

  return (
    <select
      value={currentStatus}
      onChange={(e) => mutation.mutate(e.target.value)}
      disabled={mutation.isPending}
      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-[#212D40] focus:outline-none focus:ring-1 focus:ring-[#D56753]/30 cursor-pointer"
    >
      {statusOptions.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function TaskCard({ task }: { task: TaskEntry }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-gray-100 bg-gray-50/50">
      <PriorityDot priority={task.priority} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-[#212D40]">{task.title}</p>
          <BlastRadiusBadge radius={task.blast_radius} />
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {task.owner_name} &middot; {timeAgo(task.created_at)}
        </p>
      </div>
      <StatusSelect taskId={task.id} currentStatus={task.status} />
    </div>
  );
}

function MyFlags() {
  const [showResolved, setShowResolved] = useState(false);

  const { data: taskData, isLoading } = useQuery({
    queryKey: ["admin-tasks"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/tasks" });
      return res?.success !== false ? ((res?.tasks || []) as TaskEntry[]) : [];
    },
    retry: false,
    staleTime: 30_000,
  });

  const tasks = taskData ?? [];
  const activeTasks = tasks.filter(
    (t) => t.status === "open" || t.status === "in_progress"
  );
  const resolvedTasks = tasks.filter((t) => t.status === "resolved");

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl border border-gray-200 bg-gray-50" />
        ))}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex items-center gap-3 px-4 py-4">
        <ClipboardList className="w-5 h-5 text-gray-300" />
        <p className="text-sm text-gray-400">
          No flags. When you or your team flag something through The Board, it appears here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {activeTasks.map((task) => (
        <TaskCard key={task.id} task={task} />
      ))}

      {activeTasks.length === 0 && resolvedTasks.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          <p className="text-sm text-gray-500">All flags resolved.</p>
        </div>
      )}

      {resolvedTasks.length > 0 && (
        <button
          onClick={() => setShowResolved(!showResolved)}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors px-4 pt-2"
        >
          {showResolved ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
          {resolvedTasks.length} resolved
        </button>
      )}

      {showResolved &&
        resolvedTasks.map((task) => (
          <div key={task.id} className="opacity-50">
            <TaskCard task={task} />
          </div>
        ))}
    </div>
  );
}

// ---- Feature 3: Dream Team Activity Feed ------------------------------------

interface AgentActivityEntry {
  id: number;
  agent_type: string;
  organization_id: number | null;
  org_name: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

function agentLabel(agentType: string): string {
  return agentType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function AgentStatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string }> = {
    success: { bg: "bg-emerald-50", text: "text-emerald-700" },
    pending: { bg: "bg-amber-50", text: "text-amber-700" },
    error: { bg: "bg-red-50", text: "text-red-700" },
  };
  const c = config[status] || { bg: "bg-gray-50", text: "text-gray-600" };
  return (
    <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
      {status}
    </span>
  );
}

function DreamTeamActivity() {
  const { data: activityData, isLoading } = useQuery({
    queryKey: ["admin-agent-activity"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/agent-activity" });
      return res?.success !== false
        ? ((res?.results || []) as AgentActivityEntry[])
        : [];
    },
    retry: false,
    staleTime: 30_000,
  });

  const entries = activityData ?? [];

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl border border-gray-200 bg-gray-50" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex items-center gap-3 px-4 py-4">
        <Bot className="w-5 h-5 text-gray-300" />
        <p className="text-sm text-gray-400">
          Your agents are standing by. When they run, their work appears here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.slice(0, 10).map((entry) => (
        <div
          key={entry.id}
          className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 bg-gray-50/50"
        >
          <Bot className="w-4 h-4 text-[#D56753] shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[#212D40] truncate">
              {agentLabel(entry.agent_type)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {entry.org_name || "System"} . {timeAgo(entry.created_at)}
            </p>
          </div>
          <AgentStatusBadge status={entry.status} />
        </div>
      ))}
    </div>
  );
}

// ---- Main --------------------------------------------------------------------

export default function IntegratorView() {
  const { userProfile } = useAuth();
  const firstName = userProfile?.firstName || "there";

  // Fetch organizations
  const { data: orgData } = useQuery({
    queryKey: ["admin-organizations"],
    queryFn: adminListOrganizations,
  });
  const orgs: AdminOrganization[] =
    (orgData as any)?.organizations ?? (Array.isArray(orgData) ? orgData : []);

  // Fetch personal agent brief
  const { data: briefData, isLoading: briefLoading } = useQuery({
    queryKey: ["personal-agent-brief-integrator"],
    queryFn: async () => {
      const res = await apiGet({ path: "/personal-agent/brief?role=integrator" });
      if (res?.success && res?.data) {
        return res.data as { role: string; generatedAt: string } & PersonalBrief;
      }
      return null;
    },
    retry: false,
    staleTime: 5 * 60_000,
  });

  const brief: PersonalBrief | null = briefData
    ? {
        headline: briefData.headline,
        sections: briefData.sections,
        signoff: briefData.signoff,
        urgentCount: briefData.urgentCount,
      }
    : null;

  return (
    <>
    <KillSwitchBanner />
    <div className="mx-auto max-w-lg px-4 py-8 space-y-6">
      {/* Greeting */}
      <Greeting firstName={firstName} brief={brief} isLoading={briefLoading} />

      {/* What's New: Sandbox Changelog + Deploy Status */}
      <Card>
        <SectionLabel
          icon={Zap}
          label="What's New"
          iconColor="text-[#D56753]"
        />
        <SandboxChangelog />
      </Card>

      {/* Weekly Pulse: Are we growing? */}
      <Card>
        <SectionLabel
          icon={TrendingUp}
          label="Weekly Pulse"
          iconColor="text-emerald-500"
        />
        <WeeklyPulse orgs={orgs} />
      </Card>

      {/* Client Health Grid (hero section) */}
      <Card>
        <SectionLabel
          icon={Heart}
          label="Client Health"
          iconColor="text-[#D56753]"
        />
        <ClientHealthGrid />
      </Card>

      {/* Agent Pipeline Status */}
      <Card>
        <SectionLabel
          icon={Activity}
          label="Agent Pipeline"
          iconColor="text-blue-500"
        />
        <AgentPipelineStatus />
      </Card>

      {/* Blockers */}
      <Card>
        <SectionLabel
          icon={AlertTriangle}
          label="Blockers"
          iconColor="text-red-500"
        />
        <BlockerPanel />
      </Card>

      {/* Today's Actions */}
      <Card>
        <SectionLabel
          icon={CheckCircle2}
          label="Today's Actions"
          count={brief?.sections?.reduce((sum, s) => sum + s.items.length, 0) ?? 0}
          iconColor="text-amber-500"
        />
        <TodaysActions brief={brief} />
      </Card>

      {/* Trial Pipeline */}
      <Card>
        <SectionLabel
          icon={Clock}
          label="Trial Pipeline"
          iconColor="text-blue-500"
        />
        <TrialPipeline orgs={orgs} />
      </Card>

      {/* Dream Team Activity */}
      <Card>
        <SectionLabel
          icon={Bot}
          label="Dream Team Activity"
          iconColor="text-[#D56753]"
        />
        <DreamTeamActivity />
      </Card>

      {/* My Flags */}
      <Card>
        <SectionLabel
          icon={Flag}
          label="My Flags"
          iconColor="text-[#D56753]"
        />
        <MyFlags />
      </Card>

      {/* Revenue Snapshot (compact) */}
      <Card>
        <SectionLabel
          icon={BarChart3}
          label="Revenue"
          iconColor="text-emerald-500"
        />
        <RevenueSnapshot orgs={orgs} />
      </Card>

      {/* This Week's Numbers */}
      <Card>
        <SectionLabel
          icon={BarChart3}
          label="This Week"
          iconColor="text-gray-400"
        />
        <WeeklyNumbers orgs={orgs} />
      </Card>

      {/* Blue Tape FAB */}
      <BlueTapeButton />
    </div>
    </>
  );
}
