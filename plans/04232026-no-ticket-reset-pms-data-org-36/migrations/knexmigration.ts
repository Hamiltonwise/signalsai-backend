/**
 * Reset PMS + analysis data for organization_id = 36 (production).
 *
 * This is a SCAFFOLD — implementation fills in during --instant execution.
 * Final file lives at: src/database/migrations/20260423000001_reset_pms_data_org_36.ts
 *
 * up():   Snapshot target rows into backup tables, then delete from live tables.
 * down(): Restore rows from backup tables, then drop the backup tables.
 *
 * Guardrails:
 *   - Hard-guarded by DB_NAME env. No-op on non-prod.
 *   - Runs inside the implicit knex migration transaction.
 *   - FK-safe delete order: agent_recommendations -> agent_results -> tasks -> pms_jobs.
 *   - Snapshot-first; if any delete fails, the whole migration rolls back.
 */

import type { Knex } from "knex";

const ORG_ID = 36;
const BACKUP_SUFFIX = "_reset_backup_org36_20260423";

// TODO: fill in the exact prod DB name during execution (confirm with user).
const PROD_DB_NAME = "<fill-at-execution>";

export async function up(knex: Knex): Promise<void> {
  // TODO: guard
  // const dbName = process.env.DB_NAME;
  // if (dbName !== PROD_DB_NAME) {
  //   console.log(`[reset-pms-org-36] Skipped: DB_NAME=${dbName} is not prod (${PROD_DB_NAME}).`);
  //   return;
  // }

  // TODO: pre-flight count logging
  // const preCounts = await Promise.all([
  //   knex("pms_jobs").where({ organization_id: ORG_ID }).count<{ count: string }[]>("* as count"),
  //   knex("agent_results").where({ organization_id: ORG_ID }).count<{ count: string }[]>("* as count"),
  //   knex("tasks").where({ organization_id: ORG_ID }).count<{ count: string }[]>("* as count"),
  //   knex.raw(`SELECT COUNT(*)::int AS count FROM agent_recommendations ar
  //             JOIN agent_results r ON ar.agent_result_id = r.id
  //             WHERE r.organization_id = ?`, [ORG_ID]),
  // ]);
  // console.log("[reset-pms-org-36] pre-counts:", preCounts);

  // TODO: snapshot tables (CREATE TABLE AS SELECT)
  // await knex.raw(
  //   `CREATE TABLE public.pms_jobs${BACKUP_SUFFIX} AS
  //      SELECT * FROM public.pms_jobs WHERE organization_id = ?`,
  //   [ORG_ID],
  // );
  // await knex.raw(
  //   `CREATE TABLE public.agent_results${BACKUP_SUFFIX} AS
  //      SELECT * FROM public.agent_results WHERE organization_id = ?`,
  //   [ORG_ID],
  // );
  // await knex.raw(
  //   `CREATE TABLE public.tasks${BACKUP_SUFFIX} AS
  //      SELECT * FROM public.tasks WHERE organization_id = ?`,
  //   [ORG_ID],
  // );
  // await knex.raw(
  //   `CREATE TABLE public.agent_recommendations${BACKUP_SUFFIX} AS
  //      SELECT ar.* FROM public.agent_recommendations ar
  //      JOIN public.agent_results r ON ar.agent_result_id = r.id
  //      WHERE r.organization_id = ?`,
  //   [ORG_ID],
  // );

  // TODO: FK-safe deletes
  // await knex.raw(
  //   `DELETE FROM public.agent_recommendations
  //    WHERE agent_result_id IN (SELECT id FROM public.agent_results WHERE organization_id = ?)`,
  //   [ORG_ID],
  // );
  // await knex("agent_results").where({ organization_id: ORG_ID }).del();
  // await knex("tasks").where({ organization_id: ORG_ID }).del();
  // await knex("pms_jobs").where({ organization_id: ORG_ID }).del();

  // TODO: post-count logging (should all be 0)
}

export async function down(knex: Knex): Promise<void> {
  // TODO: guard
  // const dbName = process.env.DB_NAME;
  // if (dbName !== PROD_DB_NAME) return;

  // TODO: confirm org 36 still exists (FKs will violate otherwise)
  // const org = await knex("organizations").where({ id: ORG_ID }).first();
  // if (!org) {
  //   throw new Error(`[reset-pms-org-36:down] organizations.id=${ORG_ID} no longer exists; cannot restore.`);
  // }

  // TODO: restore rows (id values preserved via INSERT SELECT)
  // await knex.raw(`INSERT INTO public.pms_jobs              SELECT * FROM public.pms_jobs${BACKUP_SUFFIX}`);
  // await knex.raw(`INSERT INTO public.agent_results         SELECT * FROM public.agent_results${BACKUP_SUFFIX}`);
  // await knex.raw(`INSERT INTO public.tasks                 SELECT * FROM public.tasks${BACKUP_SUFFIX}`);
  // await knex.raw(`INSERT INTO public.agent_recommendations SELECT * FROM public.agent_recommendations${BACKUP_SUFFIX}`);

  // TODO: drop backup tables
  // await knex.raw(`DROP TABLE public.pms_jobs${BACKUP_SUFFIX}`);
  // await knex.raw(`DROP TABLE public.agent_results${BACKUP_SUFFIX}`);
  // await knex.raw(`DROP TABLE public.tasks${BACKUP_SUFFIX}`);
  // await knex.raw(`DROP TABLE public.agent_recommendations${BACKUP_SUFFIX}`);
}
