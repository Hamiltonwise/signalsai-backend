/**
 * Manifest v2 Card 2 — Build Orchestrator worker.
 *
 * Consumes clearpath.build_triggered jobs from the minds-patientpath-build
 * queue. Runs the full Research -> Copy -> QA -> Adapter chain via
 * runBuildOrchestrator.
 *
 * Worker-level concurrency is deliberately low (1) while orchestrator-level
 * idempotency keys carry correctness. Increase only after the shadow
 * rollout proves the chain is stable under duplicate events.
 */

import type { Job } from "bullmq";
import type {
  BuildTriggerEvent,
  OrchestratorResult,
} from "../services/patientpath/orchestrator";
import { runBuildOrchestrator } from "../services/patientpath/orchestrator";

export interface PatientPathBuildJobData extends BuildTriggerEvent {}

export async function processPatientPathOrchestratorJob(
  job: Job<PatientPathBuildJobData>
): Promise<OrchestratorResult> {
  const event = job.data;
  if (!event?.orgId || !event?.triggerEventId) {
    throw new Error(
      `patientpathBuildWorker: invalid job payload (missing orgId or triggerEventId)`
    );
  }
  console.log(
    `[PATIENTPATH-BUILD] Orchestrator start org=${event.orgId} trigger=${event.triggerEventId} testMode=${Boolean(event.testMode)}`
  );
  const result = await runBuildOrchestrator(event);
  console.log(
    `[PATIENTPATH-BUILD] Orchestrator ${result.status} org=${event.orgId} ms=${result.totalMs}`
  );
  return result;
}
