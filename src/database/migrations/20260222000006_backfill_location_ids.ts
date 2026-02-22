import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ---------------------------------------------------------------
  // Step 1: Backfill pms_jobs.organization_id from domain → organizations.domain
  // ---------------------------------------------------------------
  const pmsOrgUpdated = await knex.raw(`
    UPDATE pms_jobs pj
    SET organization_id = o.id
    FROM organizations o
    WHERE pj.domain = o.domain
      AND pj.organization_id IS NULL
  `);
  console.log(
    `[Backfill] pms_jobs.organization_id: ${pmsOrgUpdated.rowCount ?? 0} rows updated`
  );

  // ---------------------------------------------------------------
  // Step 2: Backfill location_id on all tables via domain match
  // ---------------------------------------------------------------

  // agent_results: match domain → locations.domain within same org
  let result = await knex.raw(`
    UPDATE agent_results ar
    SET location_id = l.id
    FROM locations l
    WHERE ar.organization_id = l.organization_id
      AND ar.domain = l.domain
      AND ar.location_id IS NULL
      AND ar.organization_id IS NOT NULL
  `);
  console.log(
    `[Backfill] agent_results.location_id (domain match): ${result.rowCount ?? 0} rows`
  );

  // agent_results: fallback to primary location
  result = await knex.raw(`
    UPDATE agent_results ar
    SET location_id = l.id
    FROM locations l
    WHERE ar.organization_id = l.organization_id
      AND l.is_primary = true
      AND ar.location_id IS NULL
      AND ar.organization_id IS NOT NULL
  `);
  console.log(
    `[Backfill] agent_results.location_id (primary fallback): ${result.rowCount ?? 0} rows`
  );

  // tasks: match domain_name → locations.domain within same org
  result = await knex.raw(`
    UPDATE tasks t
    SET location_id = l.id
    FROM locations l
    WHERE t.organization_id = l.organization_id
      AND t.domain_name = l.domain
      AND t.location_id IS NULL
      AND t.organization_id IS NOT NULL
  `);
  console.log(
    `[Backfill] tasks.location_id (domain match): ${result.rowCount ?? 0} rows`
  );

  // tasks: fallback to primary location
  result = await knex.raw(`
    UPDATE tasks t
    SET location_id = l.id
    FROM locations l
    WHERE t.organization_id = l.organization_id
      AND l.is_primary = true
      AND t.location_id IS NULL
      AND t.organization_id IS NOT NULL
  `);
  console.log(
    `[Backfill] tasks.location_id (primary fallback): ${result.rowCount ?? 0} rows`
  );

  // pms_jobs: match domain → locations.domain within same org
  result = await knex.raw(`
    UPDATE pms_jobs pj
    SET location_id = l.id
    FROM locations l
    WHERE pj.organization_id = l.organization_id
      AND pj.domain = l.domain
      AND pj.location_id IS NULL
      AND pj.organization_id IS NOT NULL
  `);
  console.log(
    `[Backfill] pms_jobs.location_id (domain match): ${result.rowCount ?? 0} rows`
  );

  // pms_jobs: fallback to primary location
  result = await knex.raw(`
    UPDATE pms_jobs pj
    SET location_id = l.id
    FROM locations l
    WHERE pj.organization_id = l.organization_id
      AND l.is_primary = true
      AND pj.location_id IS NULL
      AND pj.organization_id IS NOT NULL
  `);
  console.log(
    `[Backfill] pms_jobs.location_id (primary fallback): ${result.rowCount ?? 0} rows`
  );

  // notifications: first backfill organization_id from domain_name → organizations.domain
  const notifOrgUpdated = await knex.raw(`
    UPDATE notifications n
    SET organization_id = o.id
    FROM organizations o
    WHERE n.domain_name = o.domain
      AND n.organization_id IS NULL
  `);
  console.log(
    `[Backfill] notifications.organization_id: ${notifOrgUpdated.rowCount ?? 0} rows updated`
  );

  // notifications: match domain_name → locations.domain within same org
  result = await knex.raw(`
    UPDATE notifications n
    SET location_id = l.id
    FROM locations l
    WHERE n.organization_id = l.organization_id
      AND n.domain_name = l.domain
      AND n.location_id IS NULL
      AND n.organization_id IS NOT NULL
  `);
  console.log(
    `[Backfill] notifications.location_id (domain match): ${result.rowCount ?? 0} rows`
  );

  // notifications: fallback to primary location
  result = await knex.raw(`
    UPDATE notifications n
    SET location_id = l.id
    FROM locations l
    WHERE n.organization_id = l.organization_id
      AND l.is_primary = true
      AND n.location_id IS NULL
      AND n.organization_id IS NOT NULL
  `);
  console.log(
    `[Backfill] notifications.location_id (primary fallback): ${result.rowCount ?? 0} rows`
  );

  // ---------------------------------------------------------------
  // Step 3: practice_rankings — match via gbp_location_id → google_properties.external_id
  // ---------------------------------------------------------------
  result = await knex.raw(`
    UPDATE practice_rankings pr
    SET location_id = gp.location_id
    FROM google_properties gp
    WHERE pr.gbp_location_id = gp.external_id
      AND pr.organization_id IS NOT NULL
      AND pr.location_id IS NULL
  `);
  console.log(
    `[Backfill] practice_rankings.location_id (GBP match): ${result.rowCount ?? 0} rows`
  );

  // practice_rankings: fallback to primary location
  result = await knex.raw(`
    UPDATE practice_rankings pr
    SET location_id = l.id
    FROM locations l
    WHERE pr.organization_id = l.organization_id
      AND l.is_primary = true
      AND pr.location_id IS NULL
      AND pr.organization_id IS NOT NULL
  `);
  console.log(
    `[Backfill] practice_rankings.location_id (primary fallback): ${result.rowCount ?? 0} rows`
  );

  // ---------------------------------------------------------------
  // Step 4: Audit — log unmatched rows
  // ---------------------------------------------------------------
  const audit = await knex.raw(`
    SELECT 'agent_results' as table_name, COUNT(*) as unmatched
    FROM agent_results WHERE location_id IS NULL AND organization_id IS NOT NULL
    UNION ALL
    SELECT 'tasks', COUNT(*) FROM tasks WHERE location_id IS NULL AND organization_id IS NOT NULL
    UNION ALL
    SELECT 'pms_jobs', COUNT(*) FROM pms_jobs WHERE location_id IS NULL AND organization_id IS NOT NULL
    UNION ALL
    SELECT 'practice_rankings', COUNT(*) FROM practice_rankings WHERE location_id IS NULL AND organization_id IS NOT NULL
    UNION ALL
    SELECT 'notifications', COUNT(*) FROM notifications WHERE location_id IS NULL AND organization_id IS NOT NULL
  `);

  for (const row of audit.rows) {
    if (parseInt(row.unmatched, 10) > 0) {
      console.warn(
        `[Backfill AUDIT] ${row.table_name}: ${row.unmatched} rows still without location_id`
      );
    }
  }

  // ---------------------------------------------------------------
  // Step 5: Composite indexes for the new query patterns
  // ---------------------------------------------------------------
  await knex.raw(
    `CREATE INDEX idx_agent_results_org_location ON agent_results(organization_id, location_id)`
  );
  await knex.raw(
    `CREATE INDEX idx_tasks_org_location ON tasks(organization_id, location_id)`
  );
  await knex.raw(
    `CREATE INDEX idx_pms_jobs_org_location ON pms_jobs(organization_id, location_id)`
  );
  await knex.raw(
    `CREATE INDEX idx_practice_rankings_org_location ON practice_rankings(organization_id, location_id)`
  );
  await knex.raw(
    `CREATE INDEX idx_notifications_org_location ON notifications(organization_id, location_id)`
  );
}

export async function down(knex: Knex): Promise<void> {
  // Drop composite indexes
  await knex.raw(`DROP INDEX IF EXISTS idx_notifications_org_location`);
  await knex.raw(`DROP INDEX IF EXISTS idx_practice_rankings_org_location`);
  await knex.raw(`DROP INDEX IF EXISTS idx_pms_jobs_org_location`);
  await knex.raw(`DROP INDEX IF EXISTS idx_tasks_org_location`);
  await knex.raw(`DROP INDEX IF EXISTS idx_agent_results_org_location`);

  // Set backfilled values back to NULL
  await knex.raw(`UPDATE pms_jobs SET organization_id = NULL`);
  await knex.raw(`UPDATE agent_results SET location_id = NULL`);
  await knex.raw(`UPDATE tasks SET location_id = NULL`);
  await knex.raw(`UPDATE pms_jobs SET location_id = NULL`);
  await knex.raw(`UPDATE practice_rankings SET location_id = NULL`);
  await knex.raw(`UPDATE notifications SET location_id = NULL`);
  await knex.raw(`UPDATE notifications SET organization_id = NULL`);
}
