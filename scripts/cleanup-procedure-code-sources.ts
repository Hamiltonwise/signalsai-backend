/**
 * Retroactive cleanup: procedure-codes-as-source.
 *
 * Some practices uploaded a CSV where the column we treated as "Referral
 * Source" actually contained procedure codes (e.g. "D1110", "D2740").
 * Those landed in referral_sources.name and made the dashboard nonsense.
 *
 * This script:
 *   1. Finds referral_sources rows whose name matches a procedure-code pattern
 *      (CDT D####[A-Z]? or 4-5 digit numerics for CPT codes).
 *   2. Deletes them.
 *   3. Appends a one-time entry to organizations.system_notifications so the
 *      practice sees a banner explaining what was removed and why.
 *
 * Idempotent: running twice is safe. The notification id is deterministic
 * per org+date, so a second run does not double-notify.
 *
 * Usage:
 *   npx ts-node scripts/cleanup-procedure-code-sources.ts            # dry run
 *   npx ts-node scripts/cleanup-procedure-code-sources.ts --apply    # destructive
 */

import { db } from "../src/database/connection";
import { looksLikeProcedureCode } from "../src/services/referralColumnMapping";

const APPLY = process.argv.includes("--apply");

interface BadRow {
  id: number;
  organization_id: number;
  name: string;
  referral_count: number;
  total_production: number;
}

async function main(): Promise<void> {
  console.log(`[cleanup] running in ${APPLY ? "APPLY (destructive)" : "DRY-RUN"} mode`);

  const hasTable = await db.schema.hasTable("referral_sources");
  if (!hasTable) {
    console.log("[cleanup] referral_sources table does not exist. Nothing to do.");
    return;
  }

  const allRows: BadRow[] = await db("referral_sources")
    .select("id", "organization_id", "name", "referral_count", "total_production");

  const bad = allRows.filter((r) => looksLikeProcedureCode(String(r.name || "")));
  console.log(`[cleanup] scanned ${allRows.length} rows, found ${bad.length} bad`);

  if (bad.length === 0) {
    console.log("[cleanup] nothing to clean.");
    return;
  }

  // Group by org for the notification
  const byOrg = new Map<number, BadRow[]>();
  for (const r of bad) {
    const list = byOrg.get(r.organization_id) || [];
    list.push(r);
    byOrg.set(r.organization_id, list);
  }

  if (!APPLY) {
    for (const [orgId, list] of byOrg) {
      console.log(`[cleanup] DRY: org ${orgId} -> ${list.length} bad rows: ${list.map((r) => r.name).slice(0, 8).join(", ")}${list.length > 8 ? "..." : ""}`);
    }
    console.log("[cleanup] dry run complete. Re-run with --apply to delete.");
    return;
  }

  // Apply: delete bad rows, append notification
  const today = new Date().toISOString().slice(0, 10);
  for (const [orgId, list] of byOrg) {
    const removed = list.map((r) => r.name);
    const ids = list.map((r) => r.id);

    await db.transaction(async (trx) => {
      await trx("referral_sources").whereIn("id", ids).del();

      const orgRow = await trx("organizations").where({ id: orgId }).select("system_notifications").first();
      const stored = orgRow?.system_notifications;
      const all = Array.isArray(stored) ? stored : (typeof stored === "string" ? JSON.parse(stored) : []);

      const notificationId = `cleanup_procedure_codes_${today}`;
      if (all.some((n: any) => n.id === notificationId)) {
        // Already notified for today's run -- skip duplicate but still applied delete.
        return;
      }

      const notification = {
        id: notificationId,
        type: "data_cleanup",
        title: "We cleaned up your referral data",
        message: `We removed ${removed.length} entries from your referral sources that turned out to be procedure codes, not practice names. This happened because an earlier upload didn't recognize the right column. Your next upload will ask you to confirm which column is the referrer so this doesn't happen again.`,
        metadata: { removed, removedCount: removed.length, scannedAt: new Date().toISOString() },
        createdAt: new Date().toISOString(),
        dismissedAt: null,
      };

      const updated = [...all, notification];
      await trx("organizations").where({ id: orgId }).update({ system_notifications: JSON.stringify(updated) });
    });

    console.log(`[cleanup] APPLIED: org ${orgId} -> deleted ${list.length} rows, appended notification`);
  }
  console.log("[cleanup] done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[cleanup] failed:", err);
    process.exit(1);
  });
