/**
 * PatientPath Build — backwards-compat shim (Manifest v2 Card 2).
 *
 * The real pipeline lives in src/services/patientpath/orchestrator.ts.
 * This file exists so the existing callers (WO19 admin route, legacy BullMQ
 * processor) keep compiling. Every call here enqueues a single
 * clearpath.build_triggered job on minds-patientpath-build.
 */

import { randomUUID } from "crypto";
import { getMindsQueue } from "../workers/queues";
import { BUILD_QUEUE_NAME } from "./patientpath/orchestrator";
import type { PatientPathBuildJobData } from "../workers/patientpathBuildWorker";

export async function buildPatientPathForOrg(orgId: number): Promise<boolean> {
  try {
    const triggerEventId = `legacy-${randomUUID()}`;
    const queueName = BUILD_QUEUE_NAME.replace(/^minds-/, "");
    const queue = getMindsQueue(queueName);
    const jobData: PatientPathBuildJobData = {
      orgId,
      triggerEventId,
    };
    await queue.add("clearpath.build_triggered", jobData, {
      jobId: `clearpath-${orgId}-${triggerEventId}`,
      removeOnComplete: 100,
      removeOnFail: 50,
    });
    console.log(
      `[PatientPath:shim] Enqueued clearpath.build_triggered for org ${orgId} (trigger ${triggerEventId})`
    );
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[PatientPath:shim] Enqueue failed for org ${orgId}: ${message}`);
    return false;
  }
}
