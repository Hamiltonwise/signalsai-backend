/**
 * Add GA4 and GSC data columns back to google_data_store.
 *
 * These were originally created in the legacy migration, dropped in
 * 20260224000001_restructure, and now added back because the OAuth
 * tokens work and the fetch service is ready.
 *
 * GA4 stores: sessions, users, conversions, page views, traffic sources
 * GSC stores: queries, clicks, impressions, position, pages
 */

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("google_data_store", (table) => {
    table.jsonb("ga4_data").nullable();
    table.jsonb("gsc_data").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("google_data_store", (table) => {
    table.dropColumn("ga4_data");
    table.dropColumn("gsc_data");
  });
}
