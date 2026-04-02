/**
 * Claude Observations -- the note on the counter.
 *
 * "5 smart people already analyzed your business and left you
 * a note on the counter." This is that note.
 *
 * Push intelligence for team dashboards. Role-specific.
 * The product comes to you. No click required.
 *
 * Confidence Code (from Claude's Corner):
 * - Green: sourced, verified, looked up just now
 * - Yellow: reasoning from context, verify before acting
 * - Red: genuine uncertainty, flagged explicitly
 *
 * Design: Linear restraint. Mercury calm. Apple Health one-story-per-card.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Brain,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  Clock,
} from "lucide-react";

type Role = "visionary" | "integrator" | "build";

interface Observation {
  id: string;
  text: string;
  confidence: "green" | "yellow" | "red";
  type: "insight" | "action" | "blocker" | "verified";
  source?: string;
}

// Semantic color pills (Rule 8: tinted backgrounds behind colored text)
const CONFIDENCE_STYLES = {
  green: {
    pill: "bg-emerald-50 text-emerald-700 border border-emerald-200/60",
    dot: "bg-emerald-500",
    label: "Verified",
  },
  yellow: {
    pill: "bg-amber-50 text-amber-700 border border-amber-200/60",
    dot: "bg-amber-400",
    label: "Reasoning",
  },
  red: {
    pill: "bg-red-50 text-red-700 border border-red-200/60",
    dot: "bg-red-500",
    label: "Uncertain",
  },
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
    <div className="card-supporting overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between hover:bg-gray-50/50 -m-6 p-6 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#1A1D23] flex items-center justify-center">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-[#1A1D23]">
              {role === "visionary" ? "What I'd focus on today" :
               role === "integrator" ? "What needs your attention" :
               "System observations"}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {observations.length} observation{observations.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        {expanded
          ? <ChevronDown className="w-4 h-4 text-gray-400" />
          : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>

      {/* Observations */}
      {expanded && (
        <div className="mt-4 space-y-2">
          {observations.map((obs) => {
            const Icon = TYPE_ICONS[obs.type] || Lightbulb;
            const conf = CONFIDENCE_STYLES[obs.confidence];

            return (
              <div
                key={obs.id}
                className={`flex items-start gap-3 px-4 py-3 rounded-xl ${conf.pill}`}
              >
                <Icon className="w-4 h-4 mt-0.5 shrink-0 opacity-60" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-relaxed">{obs.text}</p>
                  {obs.source && (
                    <p className="text-xs opacity-40 mt-1">{obs.source}</p>
                  )}
                </div>
                {/* Confidence indicator -- the dot, not text */}
                <div className="flex items-center gap-1.5 shrink-0 mt-0.5" title={conf.label}>
                  <span className={`w-2 h-2 rounded-full ${conf.dot}`} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
