import { useQuery } from "@tanstack/react-query";
import { fetchClientTasks } from "../../api/tasks";
import type { ActionItem } from "../../types/tasks";

/**
 * useActionQueue — reads tasks via `fetchClientTasks(orgId, locationId)`,
 * filters to SUMMARY (USER cat) + REFERRAL_ENGINE_ANALYSIS (ALLORO cat),
 * sorts by `metadata.priority_score` desc, drops the highest-priority
 * SUMMARY row (that's the Hero), returns up to 5 rows.
 *
 * Spec: plans/04282026-no-ticket-focus-dashboard-frontend/spec.md (T13)
 */

export type ActionQueueUrgency = "High" | "Med" | "Low";
export type ActionQueueAgent = "summary" | "re";

export interface ActionQueueRow {
  id: number;
  title: string;
  urgency: ActionQueueUrgency;
  /** Formatted "May 2" (locale en-US) from metadata.due_at or task.due_date, "—" when missing. */
  due: string;
  agent: ActionQueueAgent;
  /** metadata.domain — falls back to "ranking" when missing. */
  domain: string;
}

interface UseActionQueueResult {
  rows: ActionQueueRow[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

interface ParsedMetadata {
  priority_score: number;
  domain: string;
  urgency?: string;
  due_at?: string;
}

/**
 * Safely parse a task's `metadata` field. Backend stringifies via Knex; we
 * accept both string and object forms. Returns a normalized payload with a
 * default priority_score (0) and domain ("ranking") for rows missing the
 * fields (REFERRAL_ENGINE_ANALYSIS rows may not carry priority_score).
 */
function parseMetadata(metadata: unknown): ParsedMetadata {
  let raw: unknown = metadata;

  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  } else if (raw && typeof raw === "object") {
    // Defensive round-trip per spec — guarantees we operate on a plain object
    // even if the caller hands us a class instance or proxy.
    try {
      raw = JSON.parse(JSON.stringify(raw));
    } catch {
      raw = null;
    }
  }

  if (!raw || typeof raw !== "object") {
    return { priority_score: 0, domain: "ranking" };
  }

  const m = raw as Record<string, unknown>;
  const priorityScore =
    typeof m.priority_score === "number" ? m.priority_score : 0;
  const domain = typeof m.domain === "string" ? m.domain : "ranking";
  const urgency = typeof m.urgency === "string" ? m.urgency : undefined;
  const dueAt = typeof m.due_at === "string" ? m.due_at : undefined;

  return { priority_score: priorityScore, domain, urgency, due_at: dueAt };
}

/** Map raw urgency string → display token. Defaults to "Med". */
function mapUrgency(raw: string | undefined): ActionQueueUrgency {
  switch (raw?.toLowerCase()) {
    case "high":
      return "High";
    case "low":
      return "Low";
    case "medium":
    case "med":
      return "Med";
    default:
      return "Med";
  }
}

/** Format ISO/parseable date → "May 2". Returns "—" when missing or invalid. */
function formatDue(value: string | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface ScoredTask {
  task: ActionItem;
  meta: ParsedMetadata;
  agent: ActionQueueAgent;
  isSummary: boolean;
}

function buildRow(item: ScoredTask): ActionQueueRow {
  return {
    id: item.task.id,
    title: item.task.title,
    urgency: mapUrgency(item.meta.urgency),
    due: formatDue(item.meta.due_at ?? item.task.due_date),
    agent: item.agent,
    domain: item.meta.domain,
  };
}

export function useActionQueue(
  orgId: number | null,
  locationId: number | null
): UseActionQueueResult {
  const query = useQuery<ActionQueueRow[]>({
    queryKey: ["actionQueue", orgId, locationId],
    queryFn: async () => {
      if (!orgId) return [];
      const response = await fetchClientTasks(orgId, locationId ?? null);
      if (!response?.success || !response.tasks) return [];

      const merged: ActionItem[] = [
        ...response.tasks.USER,
        ...response.tasks.ALLORO,
      ];

      const scored: ScoredTask[] = [];
      for (const task of merged) {
        const agentType = (task.agent_type as unknown as string) ?? "";
        const isSummary = agentType === "SUMMARY";
        const isRE = agentType === "REFERRAL_ENGINE_ANALYSIS";
        if (!isSummary && !isRE) continue;

        scored.push({
          task,
          meta: parseMetadata(task.metadata),
          agent: isSummary ? "summary" : "re",
          isSummary,
        });
      }

      // Sort by priority_score desc; missing = 0 (already normalized).
      scored.sort((a, b) => b.meta.priority_score - a.meta.priority_score);

      // Exclude the highest-priority SUMMARY row — that's the Hero.
      const heroIndex = scored.findIndex((s) => s.isSummary);
      const queue =
        heroIndex >= 0
          ? [...scored.slice(0, heroIndex), ...scored.slice(heroIndex + 1)]
          : scored;

      return queue.slice(0, 5).map(buildRow);
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    rows: query.data ?? [],
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
    refetch: () => {
      void query.refetch();
    },
  };
}
