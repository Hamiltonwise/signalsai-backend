import { db } from "../../database/connection";
import type { OrgSnapshot } from "../economic/economicCalc";
import type { NarratorEvent, NarratorOutput, TemplateFn } from "./types";
import { siteQaPassedTemplate } from "./templates/siteQaPassed";
import { siteQaBlockedTemplate } from "./templates/siteQaBlocked";
import { sitePublishedTemplate } from "./templates/sitePublished";
import { cleanWeekTemplate } from "./templates/cleanWeek";
import { milestoneDetectedTemplate } from "./templates/milestoneDetected";
import { referralSignalTemplate } from "./templates/referralSignal";
import { weeklyRankingUpdateTemplate } from "./templates/weeklyRankingUpdate";
import { internalEventTemplate, INTERNAL_EVENT_TYPES } from "./templates/_internal";

const TEMPLATE_ROUTES: Record<string, TemplateFn> = {
  "site.qa_passed": siteQaPassedTemplate,
  "site.qa_blocked": siteQaBlockedTemplate,
  "site.published": sitePublishedTemplate,
  clean_week: cleanWeekTemplate,
  "milestone.achieved": milestoneDetectedTemplate,
  "first_win.achieved": milestoneDetectedTemplate,
  "gp.gone_dark": referralSignalTemplate,
  "gp.drift_detected": referralSignalTemplate,
  "referral.positive_signal": referralSignalTemplate,
  "ranking.weekly_update": weeklyRankingUpdateTemplate,
  "success.relief_of_knowing": cleanWeekTemplate,
  "churn.silent_quitter_risk": referralSignalTemplate,
};

export interface ProcessEventResult {
  output: NarratorOutput;
  archivedId: string | null;
  mode: "shadow" | "live" | "internal-noop";
}

/**
 * Process a single behavioral event. Routes to the matching template,
 * archives the composed output to narrator_outputs (always), and — when
 * narrator_enabled=true for the org — returns emit=true so the Phase 4
 * wiring can push it to dashboard tiles / Monday email / notifications.
 *
 * In Shadow mode (narrator_enabled=false, the default) nothing reaches the
 * owner. Shadow lets us watch the signal and voice-check quality before
 * any output goes live.
 */
export async function processNarratorEvent(
  event: NarratorEvent
): Promise<ProcessEventResult> {
  const org = await loadOrgSnapshot(event.orgId);

  // Internal events get a no-op template that records nothing owner-facing
  let template: TemplateFn = internalEventTemplate;
  if (INTERNAL_EVENT_TYPES.has(event.eventType)) {
    template = internalEventTemplate;
  } else if (TEMPLATE_ROUTES[event.eventType]) {
    template = TEMPLATE_ROUTES[event.eventType];
  } else {
    // Unrouted event type: internal-only, no owner output
    template = internalEventTemplate;
  }

  const nowIso = new Date().toISOString();
  const output = template({ event, org, nowIso });

  // Freeform Concern Gate — runtime rubric pass BEFORE emission. Shadow mode
  // (flag off or per-org gate disabled) runs the score for observability but
  // does not alter the output. Live mode downgrades emit=false when the gate
  // blocks, so the owner never sees copy that didn't clear The Standard.
  if (output.emit) {
    try {
      const concern = await maybeRunFreeformConcernGateForNarrator(event, output, org);
      if (concern && concern.blocked) {
        output.emit = false;
        output.dataGapReason =
          output.dataGapReason ??
          `freeform_concern_gate blocked (composite ${concern.score.composite})`;
      }
    } catch {
      // Concern gate must never break the narrator pipeline.
    }
  }

  const mode = !output.emit
    ? "internal-noop"
    : org.narratorEnabled
    ? "live"
    : "shadow";

  const archivedId = await archiveOutput(event, output, mode);

  return { output, archivedId, mode };
}

async function maybeRunFreeformConcernGateForNarrator(
  event: NarratorEvent,
  output: NarratorOutput,
  org: OrgSnapshotWithFlag
): Promise<{ blocked: boolean; score: { composite: number } } | null> {
  const { runFreeformConcernGate } = await import(
    "../siteQa/gates/freeformConcernGate"
  );
  const content = [output.finding, output.dollar, output.action]
    .filter((x) => typeof x === "string" && (x as string).length > 0)
    .join("\n\n");
  if (!content.trim()) return null;
  const result = await runFreeformConcernGate({
    content,
    orgId: event.orgId ?? undefined,
    surface: "narrator",
    metadata: {
      practice: org.name,
      specialty: org.vertical ?? undefined,
    },
  });
  return { blocked: result.blocked, score: { composite: result.score.composite } };
}

export interface OrgSnapshotWithFlag extends OrgSnapshot {
  narratorEnabled?: boolean;
}

async function loadOrgSnapshot(orgId: number | null): Promise<OrgSnapshotWithFlag> {
  if (orgId == null) {
    return {
      id: undefined,
      name: undefined,
      vertical: null,
      createdAt: null,
      hasGbpData: false,
      hasCheckupData: false,
      knownAverageCaseValueUsd: null,
      knownMonthlyNewPatients: null,
      narratorEnabled: false,
    };
  }

  try {
    const org = await db("organizations").where({ id: orgId }).first();
    if (!org) {
      return {
        id: orgId,
        narratorEnabled: false,
        vertical: null,
        hasGbpData: false,
        hasCheckupData: false,
      };
    }

    let checkupVertical: string | null = null;
    let hasCheckupData = false;
    if (org.checkup_data) {
      hasCheckupData = true;
      try {
        const cd =
          typeof org.checkup_data === "string"
            ? JSON.parse(org.checkup_data)
            : org.checkup_data;
        checkupVertical = cd?.specialty ?? cd?.category ?? null;
      } catch {
        /* ignore parse errors */
      }
    }

    let businessVertical: string | null = null;
    let hasGbpData = false;
    if (org.business_data) {
      hasGbpData = true;
      try {
        const bd =
          typeof org.business_data === "string"
            ? JSON.parse(org.business_data)
            : org.business_data;
        businessVertical = bd?.specialty ?? bd?.category ?? null;
      } catch {
        /* ignore */
      }
    }

    return {
      id: org.id,
      name: org.name,
      vertical: checkupVertical ?? businessVertical ?? null,
      createdAt: org.created_at ?? null,
      hasGbpData,
      hasCheckupData,
      knownAverageCaseValueUsd: null,
      knownMonthlyNewPatients: null,
      narratorEnabled: Boolean(org.narrator_enabled),
    };
  } catch {
    return {
      id: orgId,
      narratorEnabled: false,
      vertical: null,
      hasGbpData: false,
      hasCheckupData: false,
    };
  }
}

async function archiveOutput(
  event: NarratorEvent,
  output: NarratorOutput,
  mode: string
): Promise<string | null> {
  try {
    const [row] = await db("narrator_outputs")
      .insert({
        org_id: event.orgId ?? null,
        event_id: event.id ?? null,
        event_type: event.eventType,
        template: output.template,
        finding: output.finding,
        dollar: output.dollar ?? null,
        action: output.action,
        tier: output.tier,
        confidence: output.confidence,
        data_gap_reason: output.dataGapReason,
        voice_check_passed: output.voiceCheckPassed,
        voice_violations: JSON.stringify(output.voiceViolations ?? []),
        mode,
        emit: output.emit,
      })
      .returning("id");
    return row?.id ?? null;
  } catch {
    // Archive failures are observability concerns, not blockers for event processing.
    return null;
  }
}
