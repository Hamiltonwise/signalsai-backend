import type { Knex } from "knex";

/**
 * Adds `website_blocked` to `audit_processes`.
 *
 * Set to true by the audit-leadgen processor when both the default Puppeteer
 * scrape and the Playwright + stealth fallback fail with bot-protection
 * errors (`ERR_BLOCKED_BY_CLIENT`, Cloudflare challenge pages, etc.) AND
 * the user provided a website URL.
 *
 * Distinguishes "user has a website but it blocks automated analysis" from
 * "user didn't provide a website" — both states produce null
 * `step_screenshots` / `step_website_analysis`, but only the blocked case
 * suppresses the "site is down / migrate to dedicated" GBP recommendations
 * and renders the "Your website blocks Alloro scanners" frontend placeholder.
 *
 * Default false so existing rows back-fill safely without a data migration.
 * No index needed; the column is read as part of per-row UPDATE with
 * WHERE id=..., not scanned. Future analytics queries over this column
 * can add a partial index if/when needed.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("audit_processes", (table) => {
    table.boolean("website_blocked").notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("audit_processes", (table) => {
    table.dropColumn("website_blocked");
  });
}
