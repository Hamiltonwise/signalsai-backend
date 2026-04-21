import type { TemplateContext, NarratorOutput } from "../types";
import { tagOutput } from "../guidara95_5";

/**
 * Internal-only events. The Narrator receives these, archives the decision,
 * but never emits to any owner-facing surface. Used for research_brief.created,
 * copy.draft_ready, agent lifecycle events, and similar operational traffic.
 */
export function internalEventTemplate(ctx: TemplateContext): NarratorOutput {
  return {
    emit: false,
    finding: `Internal event received: ${ctx.event.eventType}`,
    dollar: null,
    action: "No owner-facing output. Archived for audit.",
    tier: tagOutput(ctx.event.eventType),
    template: "_internal",
    dataGapReason: null,
    confidence: 100,
    voiceCheckPassed: true,
    voiceViolations: [],
    surfaces: { dashboard: false, email: false, notification: false },
  };
}

export const INTERNAL_EVENT_TYPES = new Set<string>([
  "research_brief.created",
  "copy.draft_ready",
  "site.qa_shadow_run",
  "agent.action",
  "agent.cost",
  "agent.finding",
  "orchestrator.decision",
  "loop.closed",
]);
