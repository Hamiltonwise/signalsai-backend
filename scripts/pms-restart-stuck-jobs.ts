/**
 * One-off agent-kickoff script — fires monthly_agents for every PMS
 * job unstuck by migration `20260428000010_sweep_stuck_pms_approvals`.
 *
 * Companion to:
 *   plans/04282026-no-ticket-pms-skip-admin-client-approval/spec.md (T5)
 *
 * USAGE
 *   cd ~/Desktop/alloro
 *
 *   # Preview only — list jobs that would be triggered, no side effects:
 *   npx tsx scripts/pms-restart-stuck-jobs.ts --dry-run
 *
 *   # Live — call finalizePmsJob for each swept job, throttled to one
 *   # job every 2 seconds to avoid stampeding the agent orchestrator:
 *   npx tsx scripts/pms-restart-stuck-jobs.ts
 *
 * WHEN TO RUN
 *   Only after `20260428000010_sweep_stuck_pms_approvals` has been
 *   applied successfully. The script reads the snapshot table
 *   `pms_jobs_sweep_backup_20260428` to determine the canonical
 *   list of job IDs to kick off.
 *
 * WHY NOT USE /pms/jobs/:id/restart?
 *   `restartMonthlyAgents` requires `automation_status_detail.status
 *   === 'completed'`. Swept jobs were never completed, so that path
 *   rejects them. We call `finalizePmsJob` directly (the same helper
 *   the new upload paths use), which re-initializes status and fires
 *   the trigger uniformly.
 *
 * EXIT CODES
 *   0 — all jobs triggered successfully (or dry-run completed)
 *   1 — one or more jobs failed; see per-job error log
 */

import { db, closeConnection } from "../src/database/connection";
import { finalizePmsJob } from "../src/controllers/pms/pms-services/pms-finalize.service";

const BACKUP_TABLE = "pms_jobs_sweep_backup_20260428";
const THROTTLE_MS = 2000;

interface SweptJob {
  id: number;
  organization_id: number | null;
  location_id: number | null;
}

async function main(): Promise<number> {
  const dryRun = process.argv.includes("--dry-run");

  const backupExists = await db.raw<{ rows: { exists: boolean }[] }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ?
     ) AS exists`,
    [BACKUP_TABLE],
  );
  if (!backupExists.rows[0]?.exists) {
    console.error(
      `[pms-restart] backup table ${BACKUP_TABLE} does not exist. Run the sweep migration first.`,
    );
    return 1;
  }

  const sweptIds = (
    await db<SweptJob>(BACKUP_TABLE).select("id").orderBy("id")
  ).map((r) => r.id);

  if (sweptIds.length === 0) {
    console.log("[pms-restart] no swept jobs in snapshot; nothing to do");
    return 0;
  }

  const liveJobs: SweptJob[] = await db<SweptJob>("pms_jobs")
    .select("id", "organization_id", "location_id")
    .whereIn("id", sweptIds)
    .orderBy("id");

  const missingIds = sweptIds.filter(
    (id) => !liveJobs.some((j) => j.id === id),
  );
  if (missingIds.length > 0) {
    console.warn(
      `[pms-restart] ${missingIds.length} swept job(s) no longer present in pms_jobs (deleted?):`,
      missingIds,
    );
  }

  console.log(
    `[pms-restart] ${dryRun ? "(dry-run) " : ""}will trigger monthly_agents for ${liveJobs.length} job(s):`,
    liveJobs.map((j) => j.id),
  );

  if (dryRun) return 0;

  let succeeded = 0;
  const failures: { id: number; error: string }[] = [];

  for (const job of liveJobs) {
    try {
      await finalizePmsJob(job.id, {
        organizationId: job.organization_id,
        locationId: job.location_id,
        pmsParserStatus: "completed",
      });
      succeeded += 1;
      console.log(`[pms-restart] [${job.id}] kicked off`);
    } catch (err: any) {
      const message = err?.message ?? String(err);
      failures.push({ id: job.id, error: message });
      console.error(`[pms-restart] [${job.id}] FAILED — ${message}`);
    }

    if (job !== liveJobs[liveJobs.length - 1]) {
      await new Promise((r) => setTimeout(r, THROTTLE_MS));
    }
  }

  console.log("[pms-restart] summary", {
    total: liveJobs.length,
    succeeded,
    failed: failures.length,
  });
  if (failures.length > 0) {
    console.error("[pms-restart] failures:", failures);
    return 1;
  }
  return 0;
}

main()
  .then(async (code) => {
    await closeConnection();
    process.exit(code);
  })
  .catch(async (err) => {
    console.error("[pms-restart] unexpected error:", err);
    await closeConnection();
    process.exit(1);
  });
