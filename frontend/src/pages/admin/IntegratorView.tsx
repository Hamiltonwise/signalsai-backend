/**
 * Integrator View -- Jo's Ops Console
 *
 * 4-minute check-in from phone. Every client accounted for. Mobile-first.
 * 1. Client Health Grid (RED first, then AMBER, then GREEN)
 * 2. Trial Pipeline
 * 3. Task Queue
 * 4. Blockers
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Heart,
  Clock,
  ListTodo,
  AlertOctagon,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  adminListOrganizations,
  type AdminOrganization,
} from "@/api/admin-organizations";
import {
  fetchDreamTeamTasks,
  type DreamTeamTask,
} from "@/api/dream-team";
import { apiGet } from "@/api/index";
import { useAuth } from "@/hooks/useAuth";

// ---- Helpers ---------------------------------------------------------------

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

function daysOpen(dateStr: string): number {
  return Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function daysBetween(from: string, to: Date): number {
  return Math.floor(
    (to.getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24)
  );
}

// ---- Interfaces ------------------------------------------------------------

interface ClientHealthEntry {
  id: number;
  name: string;
  health: "green" | "amber" | "red";
  score?: number;
  risk?: string;
  last_login?: string;
  recommended_action?: string;
}

// ---- Shared UI -------------------------------------------------------------

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

function PanelHeader({
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
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
        {label}
      </p>
      {count !== undefined && count > 0 && (
        <span className="ml-auto text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
          {count}
        </span>
      )}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    urgent: "bg-red-100 text-red-700",
    high: "bg-amber-100 text-amber-700",
    normal: "bg-blue-100 text-blue-700",
    low: "bg-gray-100 text-gray-500",
  };

  return (
    <span
      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
        colors[priority] ?? colors.normal
      }`}
    >
      {priority}
    </span>
  );
}

function HealthBadge({ health }: { health: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    red: { bg: "bg-red-100", text: "text-red-700", label: "RED" },
    amber: { bg: "bg-amber-100", text: "text-amber-700", label: "AMBER" },
    green: { bg: "bg-emerald-100", text: "text-emerald-700", label: "GREEN" },
  };
  const c = config[health] ?? config.green;

  return (
    <span
      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}
    >
      {c.label}
    </span>
  );
}

// ---- Panel 1: Client Health Grid -------------------------------------------

function ClientHealthRow({ entry }: { entry: ClientHealthEntry }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <span
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            entry.health === "red"
              ? "bg-red-500"
              : entry.health === "amber"
                ? "bg-amber-400"
                : "bg-emerald-500"
          }`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#212D40] truncate">
            {entry.name}
          </p>
        </div>
        <HealthBadge health={entry.health} />
        <span className="text-[10px] text-gray-400 shrink-0">
          {entry.last_login ? timeAgo(entry.last_login) : "no login"}
        </span>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-gray-300 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-3 pt-0 border-t border-gray-50">
          <div className="flex flex-col gap-1.5 pt-2">
            {entry.risk && (
              <p className="text-xs text-gray-500">
                <span className="font-medium text-gray-600">Risk:</span> {entry.risk}
              </p>
            )}
            {entry.recommended_action && (
              <p className="text-xs text-gray-500">
                <span className="font-medium text-gray-600">Action:</span>{" "}
                {entry.recommended_action}
              </p>
            )}
            {entry.score !== undefined && (
              <p className="text-xs text-gray-500">
                <span className="font-medium text-gray-600">Score:</span>{" "}
                {entry.score}/100
              </p>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/admin/organizations/${entry.id}`);
              }}
              className="text-xs text-[#D56753] font-medium hover:underline self-start mt-1"
            >
              View details
            </button>
          </div>
        </div>
      )}
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

  const entries: ClientHealthEntry[] = orgs.map((org) => {
    const existing = healthMap.get(org.id);
    if (existing) return existing;
    return {
      id: org.id,
      name: org.name,
      health: org.connections?.gbp ? ("green" as const) : ("amber" as const),
      risk: org.connections?.gbp ? undefined : "No data connection",
      recommended_action: org.connections?.gbp
        ? undefined
        : "Push onboarding",
    };
  });

  // Sort: RED first, then AMBER, then GREEN
  const order: Record<string, number> = { red: 0, amber: 1, green: 2 };
  entries.sort(
    (a, b) => (order[a.health] ?? 2) - (order[b.health] ?? 2)
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-14 animate-pulse rounded-xl border border-gray-200 bg-gray-50"
          />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-6">
        No clients yet.
      </p>
    );
  }

  const redCount = entries.filter((e) => e.health === "red").length;
  const amberCount = entries.filter((e) => e.health === "amber").length;
  const greenCount = entries.filter((e) => e.health === "green").length;

  return (
    <div>
      {/* Summary bar */}
      <div className="flex items-center gap-4 mb-3 text-xs font-medium">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          {redCount} red
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          {amberCount} amber
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          {greenCount} green
        </span>
      </div>

      <div className="space-y-2">
        {entries.map((entry) => (
          <ClientHealthRow key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}

// ---- Panel 2: Trial Pipeline -----------------------------------------------

function TrialPipeline({ orgs }: { orgs: AdminOrganization[] }) {
  // Orgs in trial: subscription_status = trial or no tier but have account
  const trialOrgs = orgs.filter(
    (o) =>
      o.subscription_status === "trial" ||
      (!o.subscription_tier && o.subscription_status !== "active")
  );

  if (trialOrgs.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-4">
        No active trials.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {trialOrgs.map((org) => {
        const daysIn = daysBetween(org.created_at, new Date());
        const hasConnection = org.connections?.gbp;
        const engagement = hasConnection ? "high" : daysIn < 3 ? "medium" : "low";
        const likelihood = hasConnection
          ? "high"
          : daysIn < 7
            ? "medium"
            : "low";

        const likelihoodColors: Record<string, string> = {
          high: "text-emerald-600 bg-emerald-50",
          medium: "text-amber-600 bg-amber-50",
          low: "text-red-600 bg-red-50",
        };

        return (
          <div
            key={org.id}
            className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#212D40] truncate">
                {org.name}
              </p>
              <p className="text-[11px] text-gray-400">
                Day {daysIn} . {engagement} engagement
              </p>
            </div>
            <span
              className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                likelihoodColors[likelihood]
              }`}
            >
              {likelihood}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---- Panel 3: Task Queue ---------------------------------------------------

function TaskQueue({ tasks }: { tasks: DreamTeamTask[] }) {
  const sorted = [...tasks]
    .filter((t) => t.status !== "done")
    .sort((a, b) => {
      const pOrder: Record<string, number> = {
        urgent: 0,
        high: 1,
        normal: 2,
        low: 3,
      };
      const pDiff =
        (pOrder[a.priority] ?? 2) - (pOrder[b.priority] ?? 2);
      if (pDiff !== 0) return pDiff;
      return (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-4">
        All tasks complete.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.map((t) => {
        const isOverdue =
          t.due_date && new Date(t.due_date) < new Date();
        const age = daysOpen(t.created_at);

        return (
          <div
            key={t.id}
            className={`flex items-center justify-between rounded-xl px-4 py-3 border ${
              isOverdue
                ? "border-red-200 bg-red-50/50"
                : "border-gray-100 bg-gray-50"
            }`}
          >
            <div className="min-w-0 flex-1">
              <p
                className={`text-sm font-semibold truncate ${
                  isOverdue ? "text-red-700" : "text-[#212D40]"
                }`}
              >
                {t.title}
              </p>
              <p className="text-[11px] text-gray-400">
                {t.owner_name} . {age}d open
                {isOverdue && " . OVERDUE"}
              </p>
            </div>
            <PriorityBadge priority={t.priority} />
          </div>
        );
      })}
    </div>
  );
}

// ---- Panel 4: Blockers -----------------------------------------------------

function BlockersPanel({ tasks }: { tasks: DreamTeamTask[] }) {
  const now = new Date();
  const blockers = tasks.filter((t) => {
    if (t.status === "done") return false;
    const isOverdue = t.due_date && new Date(t.due_date) < now;
    const isStale = daysOpen(t.created_at) > 7;
    return isOverdue || isStale;
  });

  const oldest =
    blockers.length > 0
      ? Math.max(...blockers.map((t) => daysOpen(t.created_at)))
      : 0;

  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${
        blockers.length > 0
          ? "border-red-200 bg-red-50/30"
          : "border-gray-200 bg-white"
      }`}
    >
      <PanelHeader
        icon={AlertOctagon}
        label="Blockers"
        iconColor={blockers.length > 0 ? "text-red-500" : "text-gray-400"}
      />

      {blockers.length === 0 ? (
        <p className="text-sm text-emerald-600 font-medium">
          No blockers. Everything is moving.
        </p>
      ) : (
        <>
          <p className="text-sm font-semibold text-red-700 mb-3">
            {blockers.length} blocker{blockers.length !== 1 ? "s" : ""}. Oldest:{" "}
            {oldest} days.
          </p>
          <div className="space-y-2">
            {blockers.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-lg bg-white border border-red-100 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[#212D40] truncate">
                    {t.title}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {t.owner_name} . {daysOpen(t.created_at)}d
                  </p>
                </div>
                <PriorityBadge priority={t.priority} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---- Main ------------------------------------------------------------------

export default function IntegratorView() {
  const { userProfile } = useAuth();
  const firstName = userProfile?.firstName || "there";

  const { data: orgData } = useQuery({
    queryKey: ["admin-organizations"],
    queryFn: adminListOrganizations,
  });

  const orgs: AdminOrganization[] =
    (orgData as any)?.organizations ?? (Array.isArray(orgData) ? orgData : []);

  const { data: taskData } = useQuery({
    queryKey: ["dream-team-tasks-integrator"],
    queryFn: () => fetchDreamTeamTasks(),
    retry: false,
    staleTime: 60_000,
  });
  const tasks: DreamTeamTask[] = taskData?.tasks ?? [];

  // Quick stats for greeting
  const activeClients = orgs.filter((o: any) => o.subscriptionStatus === "active" || o.subscription_status === "active").length;
  const openTasks = tasks.filter((t) => t.status !== "done").length;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="mx-auto max-w-lg px-4 py-6 space-y-5">
      {/* Personal greeting */}
      <div className="pb-2">
        <h1 className="text-xl font-black text-[#212D40] tracking-tight">
          {greeting}, Jo.
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {activeClients > 0
            ? `${activeClients} active client${activeClients !== 1 ? "s" : ""}${openTasks > 0 ? `, ${openTasks} open task${openTasks !== 1 ? "s" : ""}` : ". All clear."}`
            : "Your ops console is ready. Clients will appear here as they sign up."}
        </p>
      </div>

      {/* Panel 1: Client Health Grid */}
      <Panel>
        <PanelHeader
          icon={Heart}
          label="Client Health"
          count={orgs.length}
          iconColor="text-[#D56753]"
        />
        <ClientHealthGrid />
      </Panel>

      {/* Panel 2: Trial Pipeline */}
      <Panel>
        <PanelHeader
          icon={Clock}
          label="Trial Pipeline"
          iconColor="text-blue-500"
        />
        <TrialPipeline orgs={orgs} />
      </Panel>

      {/* Panel 3: Task Queue */}
      <Panel>
        <PanelHeader
          icon={ListTodo}
          label="Task Queue"
          count={tasks.filter((t) => t.status !== "done").length}
          iconColor="text-amber-500"
        />
        <TaskQueue tasks={tasks} />
      </Panel>

      {/* Panel 4: Blockers */}
      <BlockersPanel tasks={tasks} />
    </div>
  );
}
