/**
 * Migration: Add partner_type to organizations
 *
 * Enables the Partner Portal. Values: 'referral_partner', 'agency', null.
 * Partners log in with their existing account and see /partner routes.
 */

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (t) => {
    t.string("partner_type", 50); // 'referral_partner' | 'agency' | null
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (t) => {
    t.dropColumn("partner_type");
  });
}
