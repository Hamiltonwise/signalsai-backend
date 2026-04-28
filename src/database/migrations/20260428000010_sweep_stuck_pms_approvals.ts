import type { Knex } from "knex";

/**
 * One-shot recovery: unstick PMS jobs trapped in `admin_approval` /
 * `client_approval` awaiting state. Companion to
 *   plans/04282026-no-ticket-pms-skip-admin-client-approval/spec.md
 *   (task T4)
 *
 * Match condition:
 *   is_approved = false
 *   AND automation_status_detail->>'currentStep' IN ('admin_approval', 'client_approval')
 *
 * Mutation per matched row:
 *   - is_approved = true
 *   - is_client_approved = true
 *   - status = 'approved'
 *   - automation_status_detail.steps.admin_approval.status = 'skipped'
 *   - automation_status_detail.steps.client_approval.status = 'skipped'
 *
 * `currentStep` is left as-is so the follow-up agent-kickoff script
 * (scripts/pms-restart-stuck-jobs.ts) can identify swept rows and
 * advance them via the existing restart pipeline.
 *
 * Guardrails (both must match or migration is a no-op):
 *   PMS_SWEEP_CONFIRM=true
 *   PMS_SWEEP_DB_NAME=<expected DB_NAME>  // checked vs process.env.DB_NAME
 *
 * Rollback: `down()` restores from the snapshot table and drops it.
 *
 * Post-execution: `pms_jobs_sweep_backup_20260428` persists. After the
 * 7-day rollback window, drop it via a follow-up cleanup migration.
 */

const BACKUP_TABLE = "pms_jobs_sweep_backup_20260428";

function shouldRun(): { run: boolean; reason: string } {
  const confirm = process.env.PMS_SWEEP_CONFIRM;
  const expectedDbName = process.env.PMS_SWEEP_DB_NAME;
  const actualDbName = process.env.DB_NAME;

  if (confirm !== "true") {
    return {
      run: false,
      reason: `PMS_SWEEP_CONFIRM != "true" (got: ${confirm ?? "unset"})`,
    };
  }
  if (!expectedDbName) {
    return { run: false, reason: "PMS_SWEEP_DB_NAME is unset" };
  }
  if (actualDbName !== expectedDbName) {
    return {
      run: false,
      reason: `DB_NAME (${actualDbName ?? "unset"}) does not match PMS_SWEEP_DB_NAME (${expectedDbName})`,
    };
  }
  return { run: true, reason: "all guards passed" };
}

export async function up(knex: Knex): Promise<void> {
  const gate = shouldRun();
  if (!gate.run) {
    console.log(`[sweep-stuck-pms:up] Skipped — ${gate.reason}`);
    return;
  }

  const matchedRows = await knex.raw<{ rows: { id: number }[] }>(
    `SELECT id FROM public.pms_jobs
     WHERE is_approved = false
       AND automation_status_detail->>'currentStep' IN ('admin_approval', 'client_approval')`,
  );
  const matchedIds = matchedRows.rows.map((r) => r.id);

  const nullStatusRows = await knex.raw<{ rows: { id: number }[] }>(
    `SELECT id FROM public.pms_jobs
     WHERE is_approved = false
       AND automation_status_detail IS NULL`,
  );
  const nullStatusIds = nullStatusRows.rows.map((r) => r.id);

  console.log("[sweep-stuck-pms:up] pre-counts", {
    matched: matchedIds.length,
    null_status: nullStatusIds.length,
  });
  if (nullStatusIds.length > 0) {
    console.log(
      "[sweep-stuck-pms:up] NULL-status rows (no action taken; review manually):",
      nullStatusIds,
    );
  }

  if (matchedIds.length === 0) {
    console.log("[sweep-stuck-pms:up] no matched rows; nothing to do");
    await knex.raw(
      `CREATE TABLE public.${BACKUP_TABLE} AS
         SELECT * FROM public.pms_jobs WHERE 1=0`,
    );
    return;
  }

  await knex.raw(
    `CREATE TABLE public.${BACKUP_TABLE} AS
       SELECT * FROM public.pms_jobs
       WHERE is_approved = false
         AND automation_status_detail->>'currentStep' IN ('admin_approval', 'client_approval')`,
  );

  const snapshotCount = Number(
    (
      (await knex(BACKUP_TABLE).count<{ count: string }[]>("* as count"))[0] as {
        count: string;
      }
    ).count,
  );
  if (snapshotCount !== matchedIds.length) {
    throw new Error(
      `[sweep-stuck-pms:up] snapshot count (${snapshotCount}) != matched count (${matchedIds.length}); aborting before mutation`,
    );
  }
  console.log("[sweep-stuck-pms:up] snapshot complete", { snapshotCount });

  await knex.raw(
    `UPDATE public.pms_jobs
     SET is_approved = true,
         is_client_approved = true,
         status = 'approved',
         automation_status_detail = jsonb_set(
           jsonb_set(
             automation_status_detail,
             '{steps,admin_approval,status}', '"skipped"'::jsonb
           ),
           '{steps,client_approval,status}', '"skipped"'::jsonb
         )
     WHERE id = ANY(?)`,
    [matchedIds],
  );

  const remaining = Number(
    (
      await knex.raw<{ rows: { count: string }[] }>(
        `SELECT COUNT(*)::text AS count FROM public.pms_jobs
         WHERE id = ANY(?) AND is_approved = false`,
        [matchedIds],
      )
    ).rows[0].count,
  );
  if (remaining > 0) {
    throw new Error(
      `[sweep-stuck-pms:up] post-update verification failed — ${remaining} row(s) still is_approved=false`,
    );
  }

  console.log("[sweep-stuck-pms:up] update verified", {
    updated: matchedIds.length,
    backup_table: BACKUP_TABLE,
  });
}

export async function down(knex: Knex): Promise<void> {
  const gate = shouldRun();
  if (!gate.run) {
    console.log(`[sweep-stuck-pms:down] Skipped — ${gate.reason}`);
    return;
  }

  const backupExists = await knex.raw<{ rows: { exists: boolean }[] }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ?
     ) AS exists`,
    [BACKUP_TABLE],
  );
  if (!backupExists.rows[0]?.exists) {
    console.log(
      `[sweep-stuck-pms:down] backup table ${BACKUP_TABLE} does not exist; nothing to restore`,
    );
    return;
  }

  await knex.raw(
    `UPDATE public.pms_jobs t
     SET is_approved = b.is_approved,
         is_client_approved = b.is_client_approved,
         status = b.status,
         automation_status_detail = b.automation_status_detail
     FROM public.${BACKUP_TABLE} b
     WHERE t.id = b.id`,
  );

  await knex.raw(`DROP TABLE public.${BACKUP_TABLE}`);

  console.log("[sweep-stuck-pms:down] restored and dropped backup table");
}
