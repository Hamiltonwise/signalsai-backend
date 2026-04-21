/**
 * Manifest v2 Card 2 — Build Orchestrator.
 *
 * Job: Operate. Phase: P1 Foundation. Gate Path: Shadow
 * (patientpath_build_enabled defaults false).
 *
 * Behavioral contract:
 *   1. Listen for clearpath.build_triggered on minds-patientpath-build.
 *   2. Research   -> research_briefs row + research_brief.created event.
 *   3. Copy       -> copy_outputs row + copy.draft_ready event.
 *   4. QA         -> Site QA Agent. Retry Copy up to 3x on fail, then
 *                    escalate a dream_team_task of type patientpath_copy_failed
 *                    and halt.
 *   5. Adapter    -> DIRECT WRITE to website_builder.pages.sections[].
 *                    Emit site.published.
 *
 * Shadow mode (patientpath_build_enabled=false): orchestrator runs on test
 * events only (event.testMode === true). Live events are skipped and logged.
 *
 * Idempotency key = `${org_id}:${trigger_event_id}`. Duplicate events are
 * no-op. Uniqueness is enforced both in the copy_outputs table index and in
 * this orchestrator (early exit if the copy is already QA passed).
 */

import { db } from "../../database/connection";
import { BehavioralEventModel } from "../../models/BehavioralEventModel";
import { runResearchStage } from "./stages/research";
import { runCopyStage } from "./stages/copy";
import { runQaStage } from "./stages/qa";
import { runAdapterStage } from "./stages/adapter";

export const BUILD_QUEUE_NAME = "minds-patientpath-build";
export const MAX_QA_RETRIES = 3;

export interface BuildTriggerEvent {
  orgId: number;
  triggerEventId: string;
  testMode?: boolean;
  refreshMode?: boolean;
}

export interface OrchestratorStageSummary {
  durationMs: number;
  [key: string]: unknown;
}

export interface OrchestratorResult {
  status:
    | "completed"
    | "duplicate_noop"
    | "shadow_skipped"
    | "qa_escalated"
    | "research_skipped"
    | "failed";
  orgId: number;
  idempotencyKey: string;
  stages: {
    research?: OrchestratorStageSummary;
    copy?: OrchestratorStageSummary;
    qa?: OrchestratorStageSummary & { attempts: number; passed: boolean };
    adapter?: OrchestratorStageSummary;
  };
  totalMs: number;
  error?: string;
}

export function buildIdempotencyKey(event: BuildTriggerEvent): string {
  return `${event.orgId}:${event.triggerEventId}`;
}

export async function runBuildOrchestrator(
  event: BuildTriggerEvent
): Promise<OrchestratorResult> {
  const start = Date.now();
  const idempotencyKey = buildIdempotencyKey(event);
  const stages: OrchestratorResult["stages"] = {};

  try {
    const org = await db("organizations")
      .where({ id: event.orgId })
      .first("id", "name", "patientpath_build_enabled");

    if (!org) {
      throw new Error(`Org ${event.orgId} not found`);
    }

    const buildEnabled = Boolean(org.patientpath_build_enabled);

    if (!buildEnabled && !event.testMode) {
      await BehavioralEventModel.create({
        event_type: "orchestrator.shadow_skipped",
        org_id: event.orgId,
        properties: { idempotency_key: idempotencyKey },
      }).catch(() => {});
      return {
        status: "shadow_skipped",
        orgId: event.orgId,
        idempotencyKey,
        stages,
        totalMs: Date.now() - start,
      };
    }

    const priorCopy = await db("copy_outputs")
      .where({ idempotency_key: idempotencyKey })
      .first();
    if (priorCopy && priorCopy.status === "qa_passed") {
      const adapterOut = await runAdapterStage({
        orgId: event.orgId,
        copyId: priorCopy.id,
        copy:
          typeof priorCopy.copy_json === "string"
            ? JSON.parse(priorCopy.copy_json)
            : priorCopy.copy_json,
        idempotencyKey,
      });
      if (adapterOut.reused) {
        return {
          status: "duplicate_noop",
          orgId: event.orgId,
          idempotencyKey,
          stages: { adapter: { ...adapterOut } },
          totalMs: Date.now() - start,
        };
      }
      return {
        status: "completed",
        orgId: event.orgId,
        idempotencyKey,
        stages: { adapter: { ...adapterOut } },
        totalMs: Date.now() - start,
      };
    }

    const research = await runResearchStage({
      orgId: event.orgId,
      idempotencyKey,
      refreshMode: event.refreshMode,
    });
    stages.research = {
      durationMs: research.durationMs,
      briefId: research.briefId,
      confidence: research.brief?.confidenceLevel,
    };

    const copy = await runCopyStage({
      orgId: event.orgId,
      briefId: research.briefId,
      brief: research.brief,
      idempotencyKey,
    });
    stages.copy = {
      durationMs: copy.durationMs,
      copyId: copy.copyId,
      sectionCount: Array.isArray(copy.copy?.sections)
        ? copy.copy.sections.length
        : 0,
      reused: copy.reused,
    };

    let qaPassed = false;
    let qaAttempts = 0;
    let qaDurationMs = 0;
    let currentCopy = copy;

    while (qaAttempts < MAX_QA_RETRIES && !qaPassed) {
      qaAttempts += 1;
      const qa = await runQaStage({
        orgId: event.orgId,
        copyId: currentCopy.copyId,
        copy: currentCopy.copy,
        orgName: org.name,
        qaEnabled: buildEnabled,
      });
      qaDurationMs += qa.durationMs;
      qaPassed = qa.passed;
      if (!qa.passed && qaAttempts < MAX_QA_RETRIES) {
        currentCopy = await runCopyStage({
          orgId: event.orgId,
          briefId: research.briefId,
          brief: research.brief,
          idempotencyKey,
          existingCopyId: currentCopy.copyId,
        });
      }
    }

    stages.qa = {
      durationMs: qaDurationMs,
      attempts: qaAttempts,
      passed: qaPassed,
    };

    if (!qaPassed) {
      await escalateQaFailure(event.orgId, currentCopy.copyId, qaAttempts);
      return {
        status: "qa_escalated",
        orgId: event.orgId,
        idempotencyKey,
        stages,
        totalMs: Date.now() - start,
      };
    }

    const adapter = await runAdapterStage({
      orgId: event.orgId,
      copyId: currentCopy.copyId,
      copy: currentCopy.copy,
      idempotencyKey,
    });
    stages.adapter = {
      durationMs: adapter.durationMs,
      projectId: adapter.projectId,
      siteUrl: adapter.siteUrl,
      pageCount: adapter.pageCount,
    };

    return {
      status: "completed",
      orgId: event.orgId,
      idempotencyKey,
      stages,
      totalMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await BehavioralEventModel.create({
      event_type: "orchestrator.failed",
      org_id: event.orgId,
      properties: {
        idempotency_key: idempotencyKey,
        error: message,
      },
    }).catch(() => {});

    return {
      status: "failed",
      orgId: event.orgId,
      idempotencyKey,
      stages,
      totalMs: Date.now() - start,
      error: message,
    };
  }
}

async function escalateQaFailure(
  orgId: number,
  copyId: string,
  attempts: number
): Promise<void> {
  try {
    await db("dream_team_tasks").insert({
      owner_name: "orchestrator",
      title: `PatientPath copy failed QA after ${attempts} attempts (org ${orgId})`,
      description: `The Build Orchestrator retried Copy ${attempts} times against the Site QA Agent and never passed. Copy output: ${copyId}. Halting build.`,
      status: "open",
      priority: "high",
      source_type: "patientpath_copy_failed",
    });
  } catch {
    // dream_team_tasks columns vary across sandbox/prod; log and continue.
  }

  await BehavioralEventModel.create({
    event_type: "orchestrator.qa_escalated",
    org_id: orgId,
    properties: { copy_id: copyId, attempts },
  }).catch(() => {});
}
