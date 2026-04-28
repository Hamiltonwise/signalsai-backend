import type { Knex } from "knex";

/**
 * One-shot PMS + analysis-pipeline reset for organization_id = 36.
 *
 * Scope: DELETE rows in `pms_jobs`, `agent_results`, `agent_recommendations`,
 * and `tasks` scoped to org 36. Leaves the organizations row, users,
 * locations, notifications, google_data_store, and all other data intact.
 *
 * Rollback-safe: `up()` snapshots every row it's about to delete into
 * `<table>_reset_backup_org36_20260423` tables, then deletes. `down()`
 * restores from snapshots (preserving original ids) and drops the backups.
 *
 * Guardrails:
 *   - Dual opt-in env vars REQUIRED, or migration is a no-op:
 *       RESET_ORG_36_CONFIRM=true
 *       RESET_ORG_36_DB_NAME=<expected DB_NAME>
 *     Plus DB_NAME must equal RESET_ORG_36_DB_NAME.
 *   - FK-safe delete order: agent_recommendations (no ON DELETE CASCADE from
 *     agent_results) -> agent_results -> tasks -> pms_jobs.
 *   - Runs inside the implicit knex migration transaction; any failure aborts.
 *
 * Post-execution: the four backup tables persist. After the rollback window
 * (recommend 7 days), drop them manually or via a follow-up migration.
 */

const ORG_ID = 36;
const BACKUP_SUFFIX = "_reset_backup_org36_20260423";

function shouldRun(): { run: boolean; reason: string } {
  const confirm = process.env.RESET_ORG_36_CONFIRM;
  const expectedDbName = process.env.RESET_ORG_36_DB_NAME;
  const actualDbName = process.env.DB_NAME;

  if (confirm !== "true") {
    return {
      run: false,
      reason: `RESET_ORG_36_CONFIRM != "true" (got: ${confirm ?? "unset"})`,
    };
  }
  if (!expectedDbName) {
    return { run: false, reason: "RESET_ORG_36_DB_NAME is unset" };
  }
  if (actualDbName !== expectedDbName) {
    return {
      run: false,
      reason: `DB_NAME (${actualDbName ?? "unset"}) does not match RESET_ORG_36_DB_NAME (${expectedDbName})`,
    };
  }
  return { run: true, reason: "all guards passed" };
}

export async function up(knex: Knex): Promise<void> {
  const gate = shouldRun();
  if (!gate.run) {
    console.log(`[reset-pms-org-36:up] Skipped — ${gate.reason}`);
    return;
  }

  const preCounts = {
    pms_jobs: Number(
      (
        (await knex("pms_jobs")
          .where({ organization_id: ORG_ID })
          .count<{ count: string }[]>("* as count"))[0] as { count: string }
      ).count,
    ),
    agent_results: Number(
      (
        (await knex("agent_results")
          .where({ organization_id: ORG_ID })
          .count<{ count: string }[]>("* as count"))[0] as { count: string }
      ).count,
    ),
    tasks: Number(
      (
        (await knex("tasks")
          .where({ organization_id: ORG_ID })
          .count<{ count: string }[]>("* as count"))[0] as { count: string }
      ).count,
    ),
    agent_recommendations: Number(
      (
        await knex.raw<{ rows: { count: string }[] }>(
          `SELECT COUNT(*)::text AS count
           FROM agent_recommendations ar
           JOIN agent_results r ON ar.agent_result_id = r.id
           WHERE r.organization_id = ?`,
          [ORG_ID],
        )
      ).rows[0].count,
    ),
  };
  console.log("[reset-pms-org-36:up] pre-counts", preCounts);

  await knex.raw(
    `CREATE TABLE public.pms_jobs${BACKUP_SUFFIX} AS
       SELECT * FROM public.pms_jobs WHERE organization_id = ?`,
    [ORG_ID],
  );
  await knex.raw(
    `CREATE TABLE public.agent_results${BACKUP_SUFFIX} AS
       SELECT * FROM public.agent_results WHERE organization_id = ?`,
    [ORG_ID],
  );
  await knex.raw(
    `CREATE TABLE public.tasks${BACKUP_SUFFIX} AS
       SELECT * FROM public.tasks WHERE organization_id = ?`,
    [ORG_ID],
  );
  await knex.raw(
    `CREATE TABLE public.agent_recommendations${BACKUP_SUFFIX} AS
       SELECT ar.* FROM public.agent_recommendations ar
       JOIN public.agent_results r ON ar.agent_result_id = r.id
       WHERE r.organization_id = ?`,
    [ORG_ID],
  );

  await knex.raw(
    `DELETE FROM public.agent_recommendations
     WHERE agent_result_id IN (
       SELECT id FROM public.agent_results WHERE organization_id = ?
     )`,
    [ORG_ID],
  );
  const deletedAgentResults = await knex("agent_results")
    .where({ organization_id: ORG_ID })
    .del();
  const deletedTasks = await knex("tasks")
    .where({ organization_id: ORG_ID })
    .del();
  const deletedPmsJobs = await knex("pms_jobs")
    .where({ organization_id: ORG_ID })
    .del();

  console.log("[reset-pms-org-36:up] deleted counts", {
    agent_recommendations: preCounts.agent_recommendations,
    agent_results: deletedAgentResults,
    tasks: deletedTasks,
    pms_jobs: deletedPmsJobs,
  });
}

export async function down(knex: Knex): Promise<void> {
  const gate = shouldRun();
  if (!gate.run) {
    console.log(`[reset-pms-org-36:down] Skipped — ${gate.reason}`);
    return;
  }

  const org = await knex("organizations").where({ id: ORG_ID }).first();
  if (!org) {
    throw new Error(
      `[reset-pms-org-36:down] organizations.id=${ORG_ID} no longer exists; cannot restore.`,
    );
  }

  await knex.raw(
    `INSERT INTO public.pms_jobs SELECT * FROM public.pms_jobs${BACKUP_SUFFIX}`,
  );
  await knex.raw(
    `INSERT INTO public.agent_results SELECT * FROM public.agent_results${BACKUP_SUFFIX}`,
  );
  await knex.raw(
    `INSERT INTO public.tasks SELECT * FROM public.tasks${BACKUP_SUFFIX}`,
  );
  await knex.raw(
    `INSERT INTO public.agent_recommendations SELECT * FROM public.agent_recommendations${BACKUP_SUFFIX}`,
  );

  await knex.raw(`DROP TABLE public.pms_jobs${BACKUP_SUFFIX}`);
  await knex.raw(`DROP TABLE public.agent_results${BACKUP_SUFFIX}`);
  await knex.raw(`DROP TABLE public.tasks${BACKUP_SUFFIX}`);
  await knex.raw(`DROP TABLE public.agent_recommendations${BACKUP_SUFFIX}`);

  console.log("[reset-pms-org-36:down] restored and dropped backup tables");
}
