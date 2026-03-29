/**
 * Nothing Gets Lost Agent -- Execution Service
 *
 * Daily scan at 7 AM PT (2 PM UTC): detects orphaned records
 * across key tables (organizations without ranking data, accounts
 * without checkup context, dream_team_tasks open > 7 days).
 *
 * Weekly (Sundays): fuller scan including stale data (no
 * behavioral_events in 30 days).
 *
 * Writes "ops.orphan_detected" events for each finding.
 *
 * Data-driven (SQL queries only). No AI calls.
 */

import { db } from "../../database/connection";

// -- Types ------------------------------------------------------------------

interface OrphanFinding {
  category: string;
  description: string;
  table: string;
  recordId: number | null;
  recordName: string | null;
  metadata: Record<string, unknown>;
}

interface NothingGetsLostSummary {
  scanType: "daily" | "weekly" | "monthly";
  findings: OrphanFinding[];
  scannedAt: string;
  orgsWithoutRankings: number;
  accountsWithoutCheckup: number;
  staleTasks: number;
  staleOrgs: number;
}

// -- Core -------------------------------------------------------------------

/**
 * Run the daily orphan scan.
 */
export async function runDailyScan(): Promise<NothingGetsLostSummary> {
  const findings: OrphanFinding[] = [];

  const orgsWithoutRankings = await findOrgsWithoutRankings();
  findings.push(...orgsWithoutRankings);

  const accountsWithoutCheckup = await findAccountsWithoutCheckup();
  findings.push(...accountsWithoutCheckup);

  const staleTasks = await findStaleTasks();
  findings.push(...staleTasks);

  // Write events for each finding
  for (const finding of findings) {
    await writeOrphanEvent(finding);
  }

  const summary: NothingGetsLostSummary = {
    scanType: "daily",
    findings,
    scannedAt: new Date().toISOString(),
    orgsWithoutRankings: orgsWithoutRankings.length,
    accountsWithoutCheckup: accountsWithoutCheckup.length,
    staleTasks: staleTasks.length,
    staleOrgs: 0,
  };

  console.log(
    `[NothingGetsLost] Daily scan: ${findings.length} findings (${orgsWithoutRankings.length} orgs without rankings, ${accountsWithoutCheckup.length} accounts without checkup, ${staleTasks.length} stale tasks)`
  );

  return summary;
}

/**
 * Run the weekly scan (Sundays). Includes daily checks plus stale data.
 */
export async function runWeeklyScan(): Promise<NothingGetsLostSummary> {
  const findings: OrphanFinding[] = [];

  // Run all daily checks
  const orgsWithoutRankings = await findOrgsWithoutRankings();
  findings.push(...orgsWithoutRankings);

  const accountsWithoutCheckup = await findAccountsWithoutCheckup();
  findings.push(...accountsWithoutCheckup);

  const staleTasks = await findStaleTasks();
  findings.push(...staleTasks);

  // Weekly addition: stale orgs (no behavioral_events in 30 days)
  const staleOrgs = await findStaleOrgs();
  findings.push(...staleOrgs);

  // Write events for each finding
  for (const finding of findings) {
    await writeOrphanEvent(finding);
  }

  const summary: NothingGetsLostSummary = {
    scanType: "weekly",
    findings,
    scannedAt: new Date().toISOString(),
    orgsWithoutRankings: orgsWithoutRankings.length,
    accountsWithoutCheckup: accountsWithoutCheckup.length,
    staleTasks: staleTasks.length,
    staleOrgs: staleOrgs.length,
  };

  console.log(
    `[NothingGetsLost] Weekly scan: ${findings.length} findings (${orgsWithoutRankings.length} orgs without rankings, ${accountsWithoutCheckup.length} accounts without checkup, ${staleTasks.length} stale tasks, ${staleOrgs.length} stale orgs)`
  );

  return summary;
}

// -- Detection Functions ----------------------------------------------------

/**
 * Find organizations that have no weekly_ranking_snapshots.
 */
async function findOrgsWithoutRankings(): Promise<OrphanFinding[]> {
  try {
    const orphans = await db("organizations as o")
      .leftJoin("weekly_ranking_snapshots as w", "o.id", "w.org_id")
      .whereNull("w.id")
      .select("o.id", "o.name");

    return orphans.map((row: any) => ({
      category: "org_without_rankings",
      description: `Organization "${row.name}" (id: ${row.id}) has no ranking data.`,
      table: "organizations",
      recordId: row.id,
      recordName: row.name,
      metadata: {},
    }));
  } catch (err: any) {
    console.error(
      "[NothingGetsLost] Failed to find orgs without rankings:",
      err.message
    );
    return [];
  }
}

/**
 * Find accounts that have no checkup_context record.
 */
async function findAccountsWithoutCheckup(): Promise<OrphanFinding[]> {
  try {
    const orphans = await db("accounts as a")
      .leftJoin("checkup_context as c", "a.id", "c.account_id")
      .whereNull("c.id")
      .select("a.id", "a.email");

    return orphans.map((row: any) => ({
      category: "account_without_checkup",
      description: `Account "${row.email}" (id: ${row.id}) has no checkup context.`,
      table: "accounts",
      recordId: row.id,
      recordName: row.email,
      metadata: {},
    }));
  } catch (err: any) {
    console.error(
      "[NothingGetsLost] Failed to find accounts without checkup:",
      err.message
    );
    return [];
  }
}

/**
 * Find dream_team_tasks that have been open for more than 7 days.
 */
async function findStaleTasks(): Promise<OrphanFinding[]> {
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  try {
    const stale = await db("dream_team_tasks")
      .where("status", "open")
      .where("created_at", "<", sevenDaysAgo)
      .select("id", "title", "assigned_to", "created_at");

    return stale.map((row: any) => {
      const daysOpen = Math.floor(
        (Date.now() - new Date(row.created_at).getTime()) /
          (24 * 60 * 60 * 1000)
      );
      return {
        category: "stale_task",
        description: `Task "${row.title}" (id: ${row.id}) assigned to ${row.assigned_to} has been open for ${daysOpen} days.`,
        table: "dream_team_tasks",
        recordId: row.id,
        recordName: row.title,
        metadata: {
          assigned_to: row.assigned_to,
          days_open: daysOpen,
          created_at: row.created_at,
        },
      };
    });
  } catch (err: any) {
    console.error(
      "[NothingGetsLost] Failed to find stale tasks:",
      err.message
    );
    return [];
  }
}

/**
 * Find organizations with no behavioral_events in the last 30 days.
 * Weekly scan only.
 */
async function findStaleOrgs(): Promise<OrphanFinding[]> {
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  try {
    const stale = await db("organizations as o")
      .leftJoin(
        db("behavioral_events")
          .select("org_id")
          .where("created_at", ">=", thirtyDaysAgo)
          .groupBy("org_id")
          .as("recent"),
        "o.id",
        "recent.org_id"
      )
      .whereNull("recent.org_id")
      .select("o.id", "o.name");

    return stale.map((row: any) => ({
      category: "stale_org",
      description: `Organization "${row.name}" (id: ${row.id}) has no behavioral events in the last 30 days.`,
      table: "organizations",
      recordId: row.id,
      recordName: row.name,
      metadata: { days_since_activity: 30 },
    }));
  } catch (err: any) {
    console.error(
      "[NothingGetsLost] Failed to find stale orgs:",
      err.message
    );
    return [];
  }
}

// -- Writers ----------------------------------------------------------------

async function writeOrphanEvent(finding: OrphanFinding): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "ops.orphan_detected",
      org_id: finding.recordId,
      properties: JSON.stringify({
        category: finding.category,
        description: finding.description,
        table: finding.table,
        record_id: finding.recordId,
        record_name: finding.recordName,
        ...finding.metadata,
      }),
    });
  } catch (err: any) {
    console.error(
      "[NothingGetsLost] Failed to write orphan event:",
      err.message
    );
  }
}
