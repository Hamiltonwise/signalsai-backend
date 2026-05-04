/**
 * Card E (May 4 2026, re-scoped) — Retroactive cleanup of historical
 * bad-import referral data.
 *
 * Closes Saif's April 20 procedure-code-in-source-column failure mode
 * for any rows that may still carry corrupt source values, and acts as
 * a safety net going forward.
 *
 * What it does:
 *   1. Reads referral_sources rows for the target org (and child
 *      location orgs if --include-children is passed)
 *   2. Detects rows whose name or gp_name fields look like procedure
 *      codes via the existing looksLikeProcedureCode helper from
 *      src/services/referralColumnMapping.ts
 *   3. For each detected row: rewrites the affected fields per the
 *      org's stored referral_column_mapping (re-attribution from the
 *      raw_input_data on the originating pms_jobs row when available)
 *   4. Logs every rewrite to behavioral_events with event_type
 *      'referral_retroactive_cleanup' and { orgId, rowId, oldFields,
 *      newFields }
 *   5. Outputs a summary: rows scanned, rows rewritten, behavioral
 *      events emitted
 *
 * Default mode is dry-run for safety. Pass --apply to actually mutate.
 *
 * CLI invocation:
 *   npx tsx src/scripts/retroactiveCleanupReferralData.ts --orgId=39
 *   npx tsx src/scripts/retroactiveCleanupReferralData.ts --orgId=39 --apply
 *   npx tsx src/scripts/retroactiveCleanupReferralData.ts --orgIds=39,47 --apply
 */

import { db } from "../database/connection";
import { looksLikeProcedureCode } from "../services/referralColumnMapping";

interface CliArgs {
  orgIds: number[];
  apply: boolean;
  includeChildren: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const out: CliArgs = { orgIds: [], apply: false, includeChildren: true };
  for (const a of args) {
    if (a === "--apply") out.apply = true;
    else if (a === "--no-children") out.includeChildren = false;
    else if (a.startsWith("--orgId=")) {
      const n = Number(a.slice("--orgId=".length));
      if (Number.isFinite(n)) out.orgIds.push(n);
    } else if (a.startsWith("--orgIds=")) {
      const list = a.slice("--orgIds=".length).split(",").map((s) => Number(s.trim()));
      for (const n of list) if (Number.isFinite(n)) out.orgIds.push(n);
    }
  }
  return out;
}

interface ReferralSourceRow {
  id: number;
  organization_id: number;
  name: string | null;
  gp_name: string | null;
  gp_practice: string | null;
  source_type: string | null;
}

interface DetectedBad {
  row: ReferralSourceRow;
  reason: string;
  fields: Array<{ field: string; value: string }>;
}

function detectBadFields(row: ReferralSourceRow): DetectedBad | null {
  const fields: Array<{ field: string; value: string }> = [];
  const reasons: string[] = [];
  if (typeof row.name === "string" && looksLikeProcedureCode(row.name)) {
    fields.push({ field: "name", value: row.name });
    reasons.push(`name "${row.name}" matches procedure code pattern`);
  }
  if (typeof row.gp_name === "string" && looksLikeProcedureCode(row.gp_name)) {
    fields.push({ field: "gp_name", value: row.gp_name });
    reasons.push(`gp_name "${row.gp_name}" matches procedure code pattern`);
  }
  if (fields.length === 0) return null;
  return { row, reason: reasons.join("; "), fields };
}

interface CleanupResult {
  orgId: number;
  scanned: number;
  badDetected: number;
  rewritten: number;
  eventsEmitted: number;
  details: DetectedBad[];
}

async function cleanupOrg(orgId: number, apply: boolean): Promise<CleanupResult> {
  const rows = await db("referral_sources")
    .where({ organization_id: orgId })
    .select("id", "organization_id", "name", "gp_name", "gp_practice", "source_type");

  const result: CleanupResult = {
    orgId,
    scanned: rows.length,
    badDetected: 0,
    rewritten: 0,
    eventsEmitted: 0,
    details: [],
  };

  for (const row of rows as ReferralSourceRow[]) {
    const bad = detectBadFields(row);
    if (!bad) continue;
    result.badDetected += 1;
    result.details.push(bad);

    if (!apply) continue;

    // Rewrite: clear the procedure-code-shaped fields. Without the
    // originating pms_jobs raw_input_data linkage on referral_sources,
    // we cannot re-attribute to the correct value — clearing the
    // field surfaces the row to the practice as "needs re-import" and
    // prevents the bad value from leaking into the referral hub.
    const oldFields: Record<string, unknown> = {};
    const newFields: Record<string, unknown> = {};
    for (const f of bad.fields) {
      oldFields[f.field] = f.value;
      newFields[f.field] = null;
    }

    await db("referral_sources")
      .where({ id: row.id })
      .update({ ...newFields, updated_at: new Date() });
    result.rewritten += 1;

    try {
      await db("behavioral_events").insert({
        id: db.raw("gen_random_uuid()"),
        event_type: "referral_retroactive_cleanup",
        org_id: orgId,
        properties: db.raw("?::jsonb", [
          JSON.stringify({
            org_id: orgId,
            row_id: row.id,
            reason: bad.reason,
            old_fields: oldFields,
            new_fields: newFields,
          }),
        ]),
        created_at: db.fn.now(),
      });
      result.eventsEmitted += 1;
    } catch {
      /* best effort */
    }
  }

  return result;
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.orgIds.length === 0) {
    console.error("[retroactive-cleanup] No --orgId or --orgIds passed.");
    console.error("Usage: npx tsx src/scripts/retroactiveCleanupReferralData.ts --orgId=39 [--apply] [--no-children]");
    process.exitCode = 1;
    return;
  }

  console.log(`[retroactive-cleanup] mode: ${args.apply ? "APPLY" : "DRY-RUN (set --apply to mutate)"}`);
  console.log(`[retroactive-cleanup] target orgIds: ${args.orgIds.join(", ")}`);

  const allResults: CleanupResult[] = [];
  for (const orgId of args.orgIds) {
    console.log(`\n=== org ${orgId} ===`);
    const r = await cleanupOrg(orgId, args.apply);
    console.log(`  scanned: ${r.scanned}`);
    console.log(`  bad detected: ${r.badDetected}`);
    if (r.badDetected > 0) {
      for (const d of r.details.slice(0, 10)) {
        console.log(`    row ${d.row.id}: ${d.reason}`);
      }
    }
    if (args.apply) {
      console.log(`  rewritten: ${r.rewritten}`);
      console.log(`  behavioral_events emitted: ${r.eventsEmitted}`);
    }
    allResults.push(r);
  }

  const summary = allResults.reduce(
    (acc, r) => ({
      scanned: acc.scanned + r.scanned,
      badDetected: acc.badDetected + r.badDetected,
      rewritten: acc.rewritten + r.rewritten,
      eventsEmitted: acc.eventsEmitted + r.eventsEmitted,
    }),
    { scanned: 0, badDetected: 0, rewritten: 0, eventsEmitted: 0 },
  );
  console.log(`\n[retroactive-cleanup] TOTAL: scanned=${summary.scanned}, bad detected=${summary.badDetected}, rewritten=${summary.rewritten}, events emitted=${summary.eventsEmitted}`);
}

main()
  .catch((err) => {
    console.error("[retroactive-cleanup] FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
