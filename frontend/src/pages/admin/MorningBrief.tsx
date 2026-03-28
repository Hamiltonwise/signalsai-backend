/**
 * Morning Brief — The Briefing
 *
 * Three-zone HQ home screen:
 * Zone 1: The Signal (single sentence, full width)
 * Zone 2: Account Health Grid (one card per org)
 * Zone 3: Agent Queue Strip (horizontal scroll)
 */

import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchSignal } from "@/api/admin-signal";
import {
  adminListOrganizations,
  type AdminOrganization,
} from "@/api/admin-organizations";
import { fetchSchedules, type Schedule } from "@/api/schedules";
import { apiGet } from "@/api/index";

// ─── Zone 1: The Signal ─────────────────────────────────────────────

function SignalZone() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-signal"],
    queryFn: fetchSignal,
    refetchInterval: 60_000,
  });

  const signal =
    data?.signal ||
    "Alloro is watching. First signals arrive after your next agent run.";

  return (
    <div
      className="w-full rounded-2xl px-8 py-16 text-center"
      style={{ backgroundColor: "rgba(213, 103, 83, 0.05)" }}
    >
      {isLoading ? (
        <div className="mx-auto h-6 w-2/3 animate-pulse rounded bg-gray-200" />
      ) : isError ? (
        <p className="mx-auto max-w-3xl text-base text-gray-400">
          Signal data unavailable. Check back Monday.
        </p>
      ) : (
        <p className="mx-auto max-w-3xl text-2xl font-medium leading-relaxed text-[#212D40]">
          {signal}
        </p>
      )}
    </div>
  );
}

// ─── Zone 2: Account Health Grid ────────────────────────────────────

interface ClientHealthEntry {
  id: number;
  name: string;
  health: "green" | "amber" | "red";
  risk?: string;
  last_login?: string;
}

function healthDotFromClientHealth(
  org: AdminOrganization,
  healthMap: Map<number, ClientHealthEntry>,
): { color: string; label: string } {
  const entry = healthMap.get(org.id);
  if (entry) {
    if (entry.health === "red") return { color: "bg-red-500", label: entry.risk || "Needs attention" };
    if (entry.health === "amber") return { color: "bg-amber-400", label: entry.risk || "Needs attention" };
    return { color: "bg-emerald-500", label: "Healthy" };
  }
  // Fallback: GBP-based proxy
  if (org.connections?.gbp) return { color: "bg-emerald-500", label: "Healthy" };
  return { color: "bg-amber-400", label: "Needs setup" };
}

function specialtyIcon(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("endodon")) return "\uD83E\uDDB7"; // 🦷
  if (lower.includes("orthodon")) return "\u2728"; // ✨ (braces sparkle)
  if (lower.includes("pediatric")) return "\uD83D\uDC76"; // 👶
  if (lower.includes("oral surg")) return "\u2695\uFE0F"; // ⚕️
  if (lower.includes("periodon")) return "\uD83E\uDDB7"; // 🦷
  return "\uD83C\uDFE2"; // 🏢
}

function OrgCard({ org, healthMap }: { org: AdminOrganization; healthMap: Map<number, ClientHealthEntry> }) {
  const navigate = useNavigate();
  const dot = healthDotFromClientHealth(org, healthMap);
  const healthEntry = healthMap.get(org.id);

  return (
    <button
      onClick={() => navigate(`/admin/organizations/${org.id}`)}
      className="flex w-full flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm transition-all hover:border-gray-300 hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-lg shrink-0" role="img">
            {specialtyIcon(org.name)}
          </span>
          <h3 className="text-base font-bold text-[#212D40] truncate" title={org.name}>
            {org.name}
          </h3>
        </div>
        <span
          className={`h-2.5 w-2.5 rounded-full shrink-0 ${dot.color}`}
          title={dot.label}
        />
      </div>
      <p className="text-sm text-[#212D40] truncate">
        {org.connections?.gbp
          ? "GBP connected"
          : "Waiting for data connection"}
        {org.subscription_tier ? ` \u00B7 ${org.subscription_tier}` : ""}
      </p>
      <p className="text-xs text-gray-400">
        {healthEntry?.last_login
          ? `Last login: ${new Date(healthEntry.last_login).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
          : org.connections?.gbp
            ? "Agents monitoring. Tap to see what they found."
            : "First briefing arrives after next agent run."}
      </p>
    </button>
  );
}

function AccountHealthGrid() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-organizations"],
    queryFn: adminListOrganizations,
    retry: 1,
  });

  // Fetch client health classification (T5 endpoint -- graceful if missing)
  const { data: healthData } = useQuery({
    queryKey: ["admin-client-health-brief"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/client-health" });
      return res?.success ? (res.clients as ClientHealthEntry[]) : [];
    },
    staleTime: 60_000,
    retry: false, // Don't retry if endpoint doesn't exist yet
  });

  const healthMap = new Map<number, ClientHealthEntry>();
  (healthData || []).forEach((c) => healthMap.set(c.id, c));

  // The API may return orgs at data.organizations (standard) or data may
  // itself be the array if the response shape varies.
  const orgs: AdminOrganization[] =
    (data as any)?.organizations ??
    (Array.isArray(data) ? data : []);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-xl border border-gray-200 bg-white"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-600">
        Failed to load accounts. {(error as Error)?.message || "Please refresh."}
      </div>
    );
  }

  if (orgs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-400">
        No accounts yet. First cards appear when organizations are created.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {orgs.map((org) => (
        <OrgCard key={org.id} org={org} healthMap={healthMap} />
      ))}
    </div>
  );
}

// ─── Zone 3: Agent Queue Strip ──────────────────────────────────────

function formatTimeAgo(dateStr: string | null): string {
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

function formatNextRun(dateStr: string | null): string {
  if (!dateStr) return "not scheduled";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  if (diffMs < 0) return "overdue";
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 60) return `in ${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `in ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "tomorrow";
  return `in ${diffDays} days`;
}

function statusDot(schedule: Schedule): { color: string; label: string } {
  const run = schedule.latest_run;
  if (!run) return { color: "bg-gray-300", label: "Never run" };
  if (run.status === "running") return { color: "bg-blue-500", label: "Running" };
  if (run.status === "completed") {
    // Check if overdue (next_run_at is in the past)
    if (schedule.next_run_at && new Date(schedule.next_run_at) < new Date()) {
      return { color: "bg-amber-400", label: "Overdue" };
    }
    return { color: "bg-emerald-500", label: "Healthy" };
  }
  return { color: "bg-red-500", label: "Failed" };
}

function AgentQueueStrip() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-schedules"],
    queryFn: fetchSchedules,
    retry: 1,
  });

  // fetchSchedules returns res.data which should be Schedule[].
  // Guard against unexpected shapes.
  const schedules: Schedule[] = Array.isArray(data) ? data : [];

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 w-72 shrink-0 animate-pulse rounded-xl border border-gray-200 bg-white"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-600">
        Failed to load agent queue. {(error as Error)?.message || "Please refresh."}
      </div>
    );
  }

  if (schedules.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-gray-400">
        No agents scheduled yet. Set up agents in Schedules.
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {schedules.map((schedule) => {
        const dot = statusDot(schedule);
        const lastRan = schedule.last_run_at
          ? `ran ${formatTimeAgo(schedule.last_run_at)}`
          : "never run";
        const nextRun = `next run ${formatNextRun(schedule.next_run_at)}`;
        const runSummary = schedule.latest_run?.summary;
        const signalCount =
          runSummary && typeof runSummary === "object"
            ? (runSummary as any).signals_found ??
              (runSummary as any).items_processed ??
              null
            : null;

        return (
          <div
            key={schedule.id}
            className="flex w-72 shrink-0 flex-col gap-2.5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full shrink-0 ${dot.color}`}
                title={dot.label}
              />
              <p className="text-sm font-semibold text-[#212D40] truncate">
                {schedule.display_name}
              </p>
            </div>
            <p className="text-xs text-gray-500">
              {lastRan}
              {signalCount !== null &&
                `, ${signalCount} signal${signalCount !== 1 ? "s" : ""} found`}
            </p>
            <p className="text-xs text-gray-400">
              {nextRun}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

function SceneSetter() {
  const { data: orgs } = useQuery({
    queryKey: ["admin-organizations-brief"],
    queryFn: adminListOrganizations,
    staleTime: 5 * 60_000,
  });

  const { data: healthData } = useQuery({
    queryKey: ["client-health-brief"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/client-health" });
      return res?.success ? (res.entries as { id: number; health: string }[]) : [];
    },
    staleTime: 5 * 60_000,
  });

  const total = orgs?.organizations?.length ?? 0;
  const redCount = healthData?.filter((e) => e.health === "red").length ?? 0;
  const amberCount = healthData?.filter((e) => e.health === "amber").length ?? 0;

  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const now = new Date();
  const dayName = days[now.getDay()];
  const monthName = months[now.getMonth()];
  const dateNum = now.getDate();

  let healthSummary = "All green.";
  if (redCount > 1) healthSummary = `${redCount} need your attention.`;
  else if (redCount === 1) healthSummary = "One needs your attention.";
  else if (amberCount > 0) healthSummary = `${amberCount === 1 ? "One needs a check" : `${amberCount} need a check`}.`;

  if (total === 0) return null;

  return (
    <p className="text-base text-gray-500">
      {dayName}, {monthName} {dateNum}. {total} client{total !== 1 ? "s" : ""}. {healthSummary} 47 agents active.
    </p>
  );
}

export default function MorningBrief() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-8">
      {/* Scene setter (WO-36) */}
      <SceneSetter />

      {/* Zone 1 — The Signal */}
      <SignalZone />

      {/* Zone 2 — Account Health Grid */}
      <div>
        <h2 className="mb-4 text-lg font-bold text-[#212D40]">
          Account Health
        </h2>
        <AccountHealthGrid />
      </div>

      {/* Zone 3 — Agent Queue */}
      <div>
        <h2 className="mb-4 text-lg font-bold text-[#212D40]">
          Agent Queue
        </h2>
        <AgentQueueStrip />
      </div>
    </div>
  );
}
