/**
 * Audit E2E Test — ad-hoc runner (not part of CI).
 *
 * Usage:
 *   npx tsx src/controllers/audit/audit.e2e-test.ts
 *
 * Requires the following to be running:
 *   - Postgres (for audit_processes writes)
 *   - Redis (for BullMQ queue)
 *   - The minds worker process (`npx tsx src/workers/worker.ts`) — this is
 *     what actually picks up and processes the audit-leadgen job. Without it,
 *     this script will enqueue and then time out polling.
 *
 * Swap the hardcoded test inputs below to validate against your own domains.
 */

import * as dotenv from "dotenv";
dotenv.config();

import { triggerAuditWorkflow } from "./audit-services/auditWorkflowService";
import { AuditProcessModel } from "../../models/AuditProcessModel";

// TODO: swap these for your test case.
const TEST_DOMAIN = "https://www.oneendo.com";
const TEST_PRACTICE_SEARCH_STRING =
  "One Endodontics, 123 Main St, Houston, TX 77001, USA";

const POLL_INTERVAL_MS = 5000;
const TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

function now(): string {
  return new Date().toISOString();
}

async function main(): Promise<void> {
  console.log(`[E2E] ${now()} Starting audit for:`);
  console.log(`      domain: ${TEST_DOMAIN}`);
  console.log(`      practice_search_string: ${TEST_PRACTICE_SEARCH_STRING}`);

  const auditId = await triggerAuditWorkflow(
    TEST_DOMAIN,
    TEST_PRACTICE_SEARCH_STRING
  );
  console.log(`[E2E] ${now()} Enqueued audit_id=${auditId}`);

  const startedAt = Date.now();
  let lastStatus: string | undefined = undefined;
  let lastRealtime: number | undefined = undefined;

  while (Date.now() - startedAt < TIMEOUT_MS) {
    const row = await AuditProcessModel.findById(auditId);
    if (!row) {
      console.error(`[E2E] ${now()} Audit row ${auditId} missing — aborting`);
      process.exit(1);
    }

    if (row.status !== lastStatus || row.realtime_status !== lastRealtime) {
      console.log(
        `[E2E] ${now()} status=${row.status} realtime_status=${row.realtime_status}`
      );
      lastStatus = row.status;
      lastRealtime = row.realtime_status;
    }

    if (row.status === "completed") {
      console.log(`[E2E] ${now()} Audit completed. Final step payloads:`);
      console.log("step_screenshots:", JSON.stringify(row.step_screenshots, null, 2));
      console.log(
        "step_website_analysis:",
        JSON.stringify(row.step_website_analysis, null, 2)
      );
      console.log("step_self_gbp:", JSON.stringify(row.step_self_gbp, null, 2));
      console.log(
        "step_competitors:",
        JSON.stringify(
          {
            count: Array.isArray(row.step_competitors?.competitors)
              ? row.step_competitors!.competitors.length
              : 0,
            first_entry: Array.isArray(row.step_competitors?.competitors)
              ? row.step_competitors!.competitors[0]
              : null,
          },
          null,
          2
        )
      );
      console.log(
        "step_gbp_analysis:",
        JSON.stringify(row.step_gbp_analysis, null, 2)
      );
      process.exit(0);
    }

    if (row.status === "failed") {
      console.error(
        `[E2E] ${now()} Audit failed: ${row.error_message || "(no message)"}`
      );
      process.exit(1);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  console.error(`[E2E] ${now()} Timed out after ${TIMEOUT_MS / 1000}s`);
  process.exit(1);
}

main().catch((err) => {
  console.error(`[E2E] Fatal error:`, err);
  process.exit(1);
});
