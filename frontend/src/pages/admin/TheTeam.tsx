/**
 * The Team — Heartbeat UI (WO12)
 *
 * Mission control view of all agents. Each card shows:
 * - Agent name in plain English
 * - Role description
 * - Last run time (relative)
 * - What it found (80 char truncated summary)
 * - Next run time
 * - Status badge (Active / Idle / Error)
 * - Heartbeat pulse (1Hz Terracotta dot)
 *
 * Data: /api/admin/schedules + /api/admin/agent-outputs
 */

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Brain, ExternalLink } from "lucide-react";
import { fetchSchedules, type Schedule } from "@/api/schedules";
import { apiGet } from "@/api/index";
import type { AgentOutput } from "@/types/agentOutputs";

// ─── Agent display names & role descriptions ────────────────────────

const AGENT_ROLES: Record<string, { name: string; role: string }> = {
  proofline: {
    name: "Proofline Agent",
    role: "Scans reviews and listings for proof of quality across every account.",
  },
  summary: {
    name: "Summary Agent",
    role: "Distills weekly activity into a single briefing for each practice.",
  },
  opportunity: {
    name: "Opportunity Agent",
    role: "Finds gaps between a practice and its top competitors.",
  },
  referral_engine: {
    name: "Referral Engine",
    role: "Tracks referral codes and flags warm attribution moments.",
  },
  cro_optimizer: {
    name: "CRO Optimizer",
    role: "Analyzes conversion paths and recommends site improvements.",
  },
  gbp_optimizer: {
    name: "GBP Optimizer",
    role: "Audits Google Business Profiles for completeness and accuracy.",
  },
  guardian: {
    name: "Guardian Agent",
    role: "Monitors account health and flags anomalies before they escalate.",
  },
  governance_sentinel: {
    name: "Governance Sentinel",
    role: "Enforces quality standards across all agent outputs.",
  },
};

function agentDisplayName(key: string): string {
  return AGENT_ROLES[key]?.name || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function agentRole(key: string): string {
  return AGENT_ROLES[key]?.role || "Automated agent processing data for your accounts.";
}

// ─── Time helpers ───────────────────────────────────────────────────

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

function nextRunLabel(dateStr: string | null): string {
  if (!dateStr) return "not scheduled";
  const d = new Date(dateStr);
  const now = new Date();
  if (d <= now) return "due now";
  const diff = d.getTime() - now.getTime();
  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (hours > 0) return `in ${hours}h ${mins}m`;
  return `in ${mins}m`;
}

// ─── Status badge ───────────────────────────────────────────────────

function statusBadge(schedule: Schedule): {
  label: string;
  dotClass: string;
  textClass: string;
} {
  const run = schedule.latest_run;
  if (!schedule.enabled) {
    return { label: "Idle", dotClass: "bg-amber-400", textClass: "text-amber-600" };
  }
  if (run?.status === "failed") {
    return { label: "Error", dotClass: "bg-red-500", textClass: "text-red-600" };
  }
  return { label: "Active", dotClass: "bg-emerald-500", textClass: "text-emerald-600" };
}

// ─── Output summary ─────────────────────────────────────────────────

function outputSummary(outputs: AgentOutput[], agentKey: string): string {
  const match = outputs.find(
    (o) => o.agent_type === agentKey && o.status === "success",
  );
  if (!match) return "Standing by.";
  const raw = match.agent_output;
  if (!raw) return "Completed. No summary available.";

  // Try to extract a text summary from various output shapes
  const obj = typeof raw === "string" ? tryParse(raw) : raw;
  if (typeof obj === "object" && obj !== null) {
    const text =
      (obj as any).summary ||
      (obj as any).message ||
      (obj as any).result ||
      (obj as any).description;
    if (typeof text === "string") {
      return text.length > 80 ? text.slice(0, 77) + "..." : text;
    }
  }
  return "Completed successfully.";
}

function tryParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

// ─── Agent Card ─────────────────────────────────────────────────────

function AgentCard({
  schedule,
  outputs,
}: {
  schedule: Schedule;
  outputs: AgentOutput[];
}) {
  const badge = statusBadge(schedule);
  const summary = outputSummary(outputs, schedule.agent_key);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-gray-300 hover:shadow-md">
      {/* Header: name + heartbeat + status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {/* Heartbeat pulse */}
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-[heartbeat_1s_ease-in-out_infinite] rounded-full bg-[#D56753] opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-[#D56753]" />
          </span>
          <h3 className="text-base font-bold text-[#212D40] truncate" title={schedule.display_name || agentDisplayName(schedule.agent_key)}>
            {schedule.display_name || agentDisplayName(schedule.agent_key)}
          </h3>
        </div>
        <span
          className={`flex items-center gap-1.5 text-xs font-semibold ${badge.textClass}`}
        >
          <span className={`h-2 w-2 rounded-full ${badge.dotClass}`} />
          {badge.label}
        </span>
      </div>

      {/* Role */}
      <p className="text-sm text-gray-500 leading-snug">
        {schedule.description || agentRole(schedule.agent_key)}
      </p>

      {/* What it found */}
      <p className="text-sm text-[#212D40] font-medium truncate">
        {summary}
      </p>

      {/* Timing row */}
      <div className="flex items-center justify-between text-xs text-gray-400 pt-1 border-t border-gray-100">
        <span>Last ran {timeAgo(schedule.last_run_at)}</span>
        <span>Next: {nextRunLabel(schedule.next_run_at)}</span>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export default function TheTeam() {
  const navigate = useNavigate();

  const { data: schedules = [], isLoading: schedulesLoading } = useQuery({
    queryKey: ["admin-schedules"],
    queryFn: fetchSchedules,
  });

  const { data: outputsData, isLoading: outputsLoading } = useQuery({
    queryKey: ["admin-agent-outputs-latest"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/agent-outputs?status=success&limit=50" });
      return res;
    },
  });

  const outputs: AgentOutput[] = outputsData?.data || [];
  const isLoading = schedulesLoading || outputsLoading;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#212D40] flex items-center gap-3">
            <Brain className="h-6 w-6 text-[#D56753]" />
            The Team
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Every agent, what it did last, and when it runs next.
          </p>
        </div>
        <button
          onClick={() => navigate("/admin/schedules")}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-[#212D40] transition-colors"
        >
          Manage schedules
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-xl bg-gray-100"
            />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && schedules.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 p-16 text-center text-gray-400">
          <Brain className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-base font-medium">No agents scheduled yet.</p>
          <p className="text-sm mt-1">
            Set up agent schedules to see your team here.
          </p>
        </div>
      )}

      {/* Agent cards grid */}
      {!isLoading && schedules.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {schedules.map((schedule) => (
            <AgentCard
              key={schedule.id}
              schedule={schedule}
              outputs={outputs}
            />
          ))}
        </div>
      )}
    </div>
  );
}
