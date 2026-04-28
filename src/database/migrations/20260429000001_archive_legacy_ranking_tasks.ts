import type { Knex } from "knex";

/**
 * One-shot data migration: archive legacy USER tasks created directly by
 * the ranking pipeline (agent_type = 'RANKING'). Companion to
 *   plans/04282026-no-ticket-summary-sole-task-writer-and-pipeline-modal/spec.md
 *   (task T4)
 *
 * After this migration:
 *   - Summary v2 is the sole writer of category='USER' tasks.
 *   - Ranking output reaches Summary via additional_data.ranking_recommendations
 *     on the next monthly run; the ranking pipeline no longer inserts tasks.
 *
 * Match condition:
 *   agent_type = 'RANKING' AND status IN ('pending', 'in_progress')
 *
 * Mutation per matched row:
 *   - status = 'archived'
 *   - updated_at = NOW()
 *
 * Rollback: down() restores from the snapshot table and drops it.
 *
 * Post-execution: tasks_ranking_archive_backup_20260429 persists. After the
 * 7-day rollback window, drop it via a follow-up cleanup migration.
 */

const BACKUP_TABLE = "tasks_ranking_archive_backup_20260429";

export async function up(knex: Knex): Promise<void> {
  const matchedRows = await knex.raw<{ rows: { id: number }[] }>(
    `SELECT id FROM public.tasks
     WHERE agent_type = 'RANKING'
       AND status IN ('pending', 'in_progress')`,
  );
  const matchedIds = matchedRows.rows.map((r) => r.id);

  console.log("[archive-ranking-tasks:up] pre-counts", {
    matched: matchedIds.length,
  });

  if (matchedIds.length === 0) {
    console.log("[archive-ranking-tasks:up] no matched rows; nothing to do");
    await knex.raw(
      `CREATE TABLE IF NOT EXISTS public.${BACKUP_TABLE} AS
         SELECT * FROM public.tasks WHERE 1=0`,
    );
    return;
  }

  await knex.raw(
    `CREATE TABLE public.${BACKUP_TABLE} AS
       SELECT * FROM public.tasks
       WHERE agent_type = 'RANKING'
         AND status IN ('pending', 'in_progress')`,
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
      `[archive-ranking-tasks:up] snapshot count (${snapshotCount}) != matched count (${matchedIds.length}); aborting before mutation`,
    );
  }
  console.log("[archive-ranking-tasks:up] snapshot complete", { snapshotCount });

  await knex.raw(
    `UPDATE public.tasks
     SET status = 'archived',
         updated_at = NOW()
     WHERE id = ANY(?)`,
    [matchedIds],
  );

  const remaining = Number(
    (
      await knex.raw<{ rows: { count: string }[] }>(
        `SELECT COUNT(*)::text AS count FROM public.tasks
         WHERE id = ANY(?) AND status != 'archived'`,
        [matchedIds],
      )
    ).rows[0].count,
  );
  if (remaining > 0) {
    throw new Error(
      `[archive-ranking-tasks:up] post-update verification failed — ${remaining} row(s) still not archived`,
    );
  }

  console.log("[archive-ranking-tasks:up] update verified", {
    archived: matchedIds.length,
    backup_table: BACKUP_TABLE,
  });
}

export async function down(knex: Knex): Promise<void> {
  const backupExists = await knex.raw<{ rows: { exists: boolean }[] }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ?
     ) AS exists`,
    [BACKUP_TABLE],
  );
  if (!backupExists.rows[0]?.exists) {
    console.log(
      `[archive-ranking-tasks:down] backup table ${BACKUP_TABLE} does not exist; nothing to restore`,
    );
    return;
  }

  await knex.raw(
    `UPDATE public.tasks t
     SET status = b.status,
         updated_at = b.updated_at
     FROM public.${BACKUP_TABLE} b
     WHERE t.id = b.id`,
  );

  await knex.raw(`DROP TABLE public.${BACKUP_TABLE}`);

  console.log("[archive-ranking-tasks:down] restored and dropped backup table");
}
