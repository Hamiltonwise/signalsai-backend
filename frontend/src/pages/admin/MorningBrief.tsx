/**
 * Morning Brief — The Briefing
 *
 * Three-zone HQ home screen:
 * Zone 1: The Signal (single sentence, full width)
 * Zone 2: Account Health Grid (one card per org)
 * Zone 3: Agent Queue Strip (horizontal scroll)
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchSignal } from "@/api/admin-signal";
import {
  adminListOrganizations,
  type AdminOrganization,
} from "@/api/admin-organizations";
import { fetchSchedules, type Schedule } from "@/api/schedules";

// ─── Zone 1: The Signal ─────────────────────────────────────────────

function SignalZone() {
  const { data, isLoading } = useQuery({
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
      ) : (
        <p className="mx-auto max-w-3xl text-2xl font-medium leading-relaxed text-[#212D40]">
          {signal}
        </p>
      )}
    </div>
  );
}

// ─── Zone 2: Account Health Grid ────────────────────────────────────

function healthDot(org: AdminOrganization): {
  color: string;
  label: string;
} {
  // Without agent_results data on the org list response, we use
  // creation recency as a proxy. Future: enrich the orgs endpoint
  // with latest agent run timestamp.
  const created = new Date(org.created_at);
  const now = new Date();
  const hoursAgo = (now.getTime() - created.getTime()) / (1000 * 60 * 60);

  if (org.connections?.gbp) {
    return { color: "bg-emerald-500", label: "Healthy" };
  }
  if (hoursAgo < 48) {
    return { color: "bg-amber-400", label: "Needs attention" };
  }
  return { color: "bg-red-500", label: "Urgent" };
}

function OrgCard({ org }: { org: AdminOrganization }) {
  const navigate = useNavigate();
  const dot = healthDot(org);

  return (
    <button
      onClick={() => navigate(`/admin/organizations/${org.id}`)}
      className="flex w-full flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm transition-all hover:border-gray-300 hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-[#212D40] truncate pr-3">
          {org.name}
        </h3>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`h-2.5 w-2.5 rounded-full ${dot.color}`}
            title={dot.label}
          />
        </div>
      </div>
      <p className="text-sm text-gray-500 truncate">
        {org.subscription_tier
          ? `${org.subscription_tier} tier`
          : "No tier assigned"}{" "}
        &middot; {org.userCount} user{org.userCount !== 1 ? "s" : ""}
      </p>
      <p className="text-xs text-gray-400">
        {org.connections?.gbp
          ? "GBP connected"
          : "Connecting to data\u2026 First briefing arrives after next agent run."}
      </p>
    </button>
  );
}

function AccountHealthGrid() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-organizations"],
    queryFn: adminListOrganizations,
  });

  const orgs = data?.organizations || [];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-xl bg-gray-100"
          />
        ))}
      </div>
    );
  }

  if (orgs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-400">
        No accounts yet. First cards appear when organizations are created.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {orgs.map((org) => (
        <OrgCard key={org.id} org={org} />
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
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function statusBadge(schedule: Schedule): { text: string; className: string } {
  const run = schedule.latest_run;
  if (!run) return { text: "No runs yet", className: "text-gray-400" };
  if (run.status === "completed")
    return { text: "Completed", className: "text-emerald-600" };
  if (run.status === "running")
    return { text: "Running", className: "text-blue-500" };
  return { text: "Failed", className: "text-red-500" };
}

function AgentQueueStrip() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-schedules"],
    queryFn: fetchSchedules,
  });

  const schedules = data || [];

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 w-72 shrink-0 animate-pulse rounded-xl bg-gray-100"
          />
        ))}
      </div>
    );
  }

  if (schedules.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-gray-400">
        No agents scheduled yet. Set up agents in Schedules.
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {schedules.map((schedule) => {
        const badge = statusBadge(schedule);
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
            className="flex w-72 shrink-0 flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <p className="text-sm font-semibold text-[#212D40] truncate">
              {schedule.display_name}
            </p>
            <div className="flex items-center gap-2 text-xs">
              <span className={badge.className}>{badge.text}</span>
              <span className="text-gray-300">&middot;</span>
              <span className="text-gray-400">
                ran {formatTimeAgo(schedule.last_run_at)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-400">
              {signalCount !== null && (
                <span>
                  {signalCount} signal{signalCount !== 1 ? "s" : ""} found
                </span>
              )}
              <span className="ml-auto">
                next: {formatNextRun(schedule.next_run_at)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export default function MorningBrief() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-8">
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
