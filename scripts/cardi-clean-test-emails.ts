/**
 * Card I — DB cleanup of test-pattern emails (May 4 2026).
 *
 * One-shot script that strips laggy80@gmail.com (and any other personal
 * domain test pattern) from production project recipients arrays,
 * leaving real customer emails in place. Idempotent: re-running is a
 * no-op once the rows are clean.
 *
 * Surfaces touched:
 *   - website_builder.projects.recipients (JSONB array)
 *   - location_notification_config.email_addresses (TEXT[])
 *
 * Pre-flight: prints the matches, then prompts via env var
 * CARD_I_APPLY=1 to actually mutate. Default is dry-run for safety.
 */

import { db } from "../src/database/connection";

const TEST_RX = /@(gmail|hotmail|yahoo)\.com$/i;

async function scanProjects(): Promise<
  Array<{ id: string; recipients: string[]; cleaned: string[]; removed: string[] }>
> {
  const r = await db.raw(
    `SELECT id, recipients
       FROM website_builder.projects
       WHERE recipients::text ILIKE ANY (?::text[])`,
    [["%@gmail.com%", "%@hotmail.com%", "%@yahoo.com%"]],
  );
  const out: Array<{ id: string; recipients: string[]; cleaned: string[]; removed: string[] }> = [];
  for (const row of r.rows ?? []) {
    const recipients: string[] = Array.isArray(row.recipients)
      ? row.recipients
      : typeof row.recipients === "string"
        ? JSON.parse(row.recipients)
        : [];
    const removed = recipients.filter((e) => typeof e === "string" && TEST_RX.test(e));
    if (removed.length === 0) continue;
    const cleaned = recipients.filter((e) => typeof e !== "string" || !TEST_RX.test(e));
    out.push({ id: row.id, recipients, cleaned, removed });
  }
  return out;
}

async function scanLocationConfig(): Promise<
  Array<{ id: number; email_addresses: string[]; cleaned: string[]; removed: string[] }>
> {
  const r = await db.raw(
    `SELECT id, email_addresses
       FROM location_notification_config
       WHERE EXISTS (
         SELECT 1 FROM unnest(email_addresses) AS e
         WHERE e ILIKE ANY (?::text[])
       )`,
    [["%@gmail.com", "%@hotmail.com", "%@yahoo.com"]],
  );
  const out: Array<{ id: number; email_addresses: string[]; cleaned: string[]; removed: string[] }> = [];
  for (const row of r.rows ?? []) {
    const addrs: string[] = row.email_addresses ?? [];
    const removed = addrs.filter((e) => TEST_RX.test(e));
    if (removed.length === 0) continue;
    const cleaned = addrs.filter((e) => !TEST_RX.test(e));
    out.push({ id: row.id, email_addresses: addrs, cleaned, removed });
  }
  return out;
}

async function main(): Promise<void> {
  const apply = process.env.CARD_I_APPLY === "1";
  console.log(`[cardi-clean] mode: ${apply ? "APPLY" : "DRY-RUN (set CARD_I_APPLY=1 to mutate)"}`);

  const projects = await scanProjects();
  const configs = await scanLocationConfig();

  console.log(`\n=== website_builder.projects.recipients ===`);
  console.log(`matches: ${projects.length}`);
  for (const p of projects) {
    console.log(`  project ${p.id}: removing [${p.removed.join(", ")}], keeping [${p.cleaned.join(", ")}]`);
    if (apply) {
      await db("website_builder.projects" as any)
        .where({ id: p.id })
        .update({
          recipients: JSON.stringify(p.cleaned),
          updated_at: new Date(),
        });
      console.log(`    UPDATED`);
    }
  }

  console.log(`\n=== location_notification_config ===`);
  console.log(`matches: ${configs.length}`);
  for (const c of configs) {
    console.log(`  config row ${c.id}: removing [${c.removed.join(", ")}], keeping [${c.cleaned.join(", ")}]`);
    if (apply) {
      await db.raw(
        `UPDATE location_notification_config
           SET email_addresses = ?::text[], updated_at = NOW()
           WHERE id = ?`,
        [c.cleaned, c.id],
      );
      console.log(`    UPDATED`);
    }
  }

  console.log(
    `\n[cardi-clean] ${apply ? "applied" : "dry-run"} complete. ` +
      `Projects touched: ${projects.length}, config rows touched: ${configs.length}.`,
  );
}

main()
  .catch((err) => {
    console.error("[cardi-clean] FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
