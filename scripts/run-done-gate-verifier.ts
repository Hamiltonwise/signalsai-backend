#!/usr/bin/env tsx
/**
 * Nightly cron entry point for the Done Gate Verifier.
 *
 * Schedule via system cron, BullMQ, or GitHub Actions. Example crontab:
 *   0 7 * * * cd /opt/alloro && npx tsx scripts/run-done-gate-verifier.ts
 *
 * Always exits 0 -- never fails the cron run, since the cron is best-effort.
 */

import { runDoneGateVerifierCron } from "../src/services/blackboard/doneGateVerifier";

async function main(): Promise<void> {
  console.log("[DoneGateVerifier] cron run starting at", new Date().toISOString());
  try {
    const result = await runDoneGateVerifierCron();
    console.log("[DoneGateVerifier] result:", JSON.stringify(result, null, 2));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[DoneGateVerifier] fatal:", message);
  }
  process.exit(0);
}

main();
