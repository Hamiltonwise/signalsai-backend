/**
 * Team Pulse -- The War Room Glance
 *
 * Five cards, one per critical agent. Shows at the top of the
 * Org Chart tab. One glance tells you: who ran, what they found,
 * who's governed, who needs attention.
 *
 * This is the "how did they know that?" moment for the internal product.
 */

import { useQuery } from "@tanstack/react-query";
import {
  ShieldCheck,
  ShieldAlert,
  Eye,
  Activity,
  Clock,
  Zap,
} from "lucide-react";
import { fetchPulse, type PulseAgent } from "@/api/agent-canon";

// ── Health indicator ───────────────────────────────────────────────

const HEALTH_RING: Record<string, string> = {
  green: "ring-emerald-400 bg-emerald-50",
  yellow: "ring-amber-400 bg-amber-50",
  red: "ring-red-400 bg-red-50",
  gray: "ring-gray-300 bg-gray-50",
};

const HEALTH_DOT: Record<string, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-400",
  red: "bg-red-500",
  gray: "bg-gray-300",
};

// ── Time ago helper ────────────────────────────────────────────────

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Progress bar ───────────────────────────────────────────────────

function GoldQuestionBar({ passed, total }: { passed: number; total: number }) {
  if (total === 0) {
    return <span className="text-xs text-gray-400">No questions</span>;
  }
  const pct = Math.round((passed / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            pct === 100 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-red-400"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 tabular-nums shrink-0">{passed}/{total}</span>
    </div>
  );
}

// ── Single agent pulse card ────────────────────────────────────────

function PulseCard({ agent }: { agent: PulseAgent }) {
  const isRunning = agent.lastRunStatus === "running";

  return (
    <div className={`rounded-xl border ring-1 ${HEALTH_RING[agent.health]} p-4 space-y-3 transition-all hover:shadow-sm`}>
      {/* Header: name + badges */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${HEALTH_DOT[agent.health]}`} />
          <h3 className="text-sm font-semibold text-[#1A1D23] truncate">{agent.displayName}</h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {agent.gateVerdict === "PASS" && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
              <ShieldCheck className="h-3 w-3" />
              PASS
            </span>
          )}
          {agent.gateVerdict === "PENDING" && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
              <Eye className="h-3 w-3" />
              OBSERVE
            </span>
          )}
          {agent.gateVerdict === "FAIL" && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700">
              <ShieldAlert className="h-3 w-3" />
              FAIL
            </span>
          )}
        </div>
      </div>

      {/* Last activity */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          {isRunning ? (
            <Activity className="h-3 w-3 text-blue-500 animate-pulse" />
          ) : (
            <Clock className="h-3 w-3" />
          )}
          <span>
            {isRunning ? "Running now" : timeAgo(agent.lastRunAt)}
          </span>
          {agent.totalRuns > 0 && (
            <span className="text-gray-400">
              ({agent.totalRuns} total runs)
            </span>
          )}
        </div>

        {/* Output summary */}
        {agent.lastRunSummary && (
          <div className="flex items-start gap-1.5">
            <Zap className="h-3 w-3 text-[#D56753] shrink-0 mt-0.5" />
            <p className="text-xs text-[#1A1D23] leading-relaxed">{agent.lastRunSummary}</p>
          </div>
        )}
        {!agent.lastRunSummary && agent.totalRuns === 0 && (
          <p className="text-xs text-gray-400 italic">Awaiting first run</p>
        )}
      </div>

      {/* Gold question progress */}
      <GoldQuestionBar passed={agent.goldQuestionsPassed} total={agent.goldQuestionsTotal} />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────

export default function TeamPulse() {
  const { data, isLoading } = useQuery({
    queryKey: ["team-pulse"],
    queryFn: fetchPulse,
    refetchInterval: 30_000,
    retry: 1,
  });

  const pulse = data?.pulse || [];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-8">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
    );
  }

  if (pulse.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-[#D56753]" />
        <h2 className="text-sm font-semibold text-[#1A1D23] uppercase tracking-wider">Team Pulse</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {pulse.map((agent) => (
          <PulseCard key={agent.slug} agent={agent} />
        ))}
      </div>
    </div>
  );
}
