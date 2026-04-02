/**
 * Claude Observations -- push intelligence for team dashboards.
 *
 * Shows role-specific observations sourced from real data.
 * The product comes to you. No click required.
 *
 * Roles:
 * - visionary: strategic observations, customer intelligence, competitive moves
 * - integrator: operational flags, customer health signals, process gaps
 * - build: infrastructure blockers, migration status, technical debt
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Brain, ChevronDown, ChevronRight, AlertTriangle, Lightbulb, CheckCircle2, Clock } from "lucide-react";

type Role = "visionary" | "integrator" | "build";

interface Observation {
  id: string;
  text: string;
  confidence: "green" | "yellow" | "red";
  type: "insight" | "action" | "blocker" | "verified";
  source?: string;
}

const CONFIDENCE_STYLES = {
  green: "bg-emerald-50 border-emerald-200 text-emerald-700",
  yellow: "bg-amber-50 border-amber-200 text-amber-700",
  red: "bg-red-50 border-red-200 text-red-700",
};

const TYPE_ICONS = {
  insight: Lightbulb,
  action: Clock,
  blocker: AlertTriangle,
  verified: CheckCircle2,
};

async function fetchObservations(role: Role): Promise<{ observations: Observation[] }> {
  const res = await fetch(`/api/admin/claude-observations?role=${role}`);
  if (!res.ok) return { observations: [] };
  return res.json();
}

export default function ClaudeObservations({ role }: { role: Role }) {
  const [expanded, setExpanded] = useState(true);

  const { data } = useQuery({
    queryKey: ["claude-observations", role],
    queryFn: () => fetchObservations(role),
    staleTime: 5 * 60_000,
  });

  const observations = data?.observations || [];

  if (observations.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#D56753] to-orange-600 flex items-center justify-center">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-slate-800">Here's What I'd Focus On</p>
            <p className="text-xs text-slate-400 uppercase tracking-wider">
              {observations.length} item{observations.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="px-5 pb-4 space-y-2">
          {observations.map((obs) => {
            const Icon = TYPE_ICONS[obs.type] || Lightbulb;
            return (
              <div
                key={obs.id}
                className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border text-sm ${CONFIDENCE_STYLES[obs.confidence]}`}
              >
                <Icon className="w-4 h-4 mt-0.5 shrink-0 opacity-70" />
                <div className="flex-1 min-w-0">
                  <p className="leading-relaxed">{obs.text}</p>
                  {obs.source && (
                    <p className="text-xs opacity-50 mt-1">{obs.source}</p>
                  )}
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider opacity-50 shrink-0 mt-0.5">
                  {obs.confidence}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
