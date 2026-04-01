/**
 * Ensure DentalEMR (org 6) is fully configured for the intelligence pipeline.
 *
 * Sets onboarding_completed, creates a primary location, and sets partner_type
 * so Proofline, The Board partner routes, and the customer dashboard all work.
 *
 * NOTE: The google_connections record with valid OAuth tokens must exist in the
 * database for full Proofline GBP/GA4/GSC data fetching. That record comes from
 * the real GBP connection flow or production data sync (Dave task).
 */

import { Knex } from "knex";

const ORG_ID = 6;

export async function up(knex: Knex): Promise<void> {
  // Only run if org 6 exists
  const org = await knex("organizations").where({ id: ORG_ID }).first();
  if (!org) return;

  // Ensure onboarding_completed is true
  if (!org.onboarding_completed) {
    await knex("organizations")
      .where({ id: ORG_ID })
      .update({
        onboarding_completed: true,
        onboarding_completed_at: new Date(),
        updated_at: new Date(),
      });
    console.log(`[Migration] Set onboarding_completed=true for org ${ORG_ID}`);
  }

  // Ensure partner_type is set
  if (!org.partner_type) {
    await knex("organizations")
      .where({ id: ORG_ID })
      .update({
        partner_type: "channel",
        updated_at: new Date(),
      });
    console.log(`[Migration] Set partner_type=channel for org ${ORG_ID}`);
  }

  // Ensure domain is set
  if (!org.domain) {
    await knex("organizations")
      .where({ id: ORG_ID })
      .update({
        domain: "dentalemr.com",
        updated_at: new Date(),
      });
    console.log(`[Migration] Set domain=dentalemr.com for org ${ORG_ID}`);
  }

  // Ensure a primary location exists
  const existingLocation = await knex("locations")
    .where({ organization_id: ORG_ID, is_primary: true })
    .first();

  if (!existingLocation) {
    await knex("locations").insert({
      organization_id: ORG_ID,
      name: "DentalEMR",
      domain: "dentalemr.com",
      is_primary: true,
      city: "Dallas",
      state: "TX",
      specialty: "software",
      gbp_connected: false,
      is_coming_soon: false,
      created_at: new Date(),
      updated_at: new Date(),
    });
    console.log(`[Migration] Created primary location for org ${ORG_ID}`);
  }
}

export async function down(knex: Knex): Promise<void> {
  // Revert partner_type (leave onboarding_completed as-is for safety)
  await knex("organizations")
    .where({ id: ORG_ID })
    .update({ partner_type: null });

  // Remove location only if it was created by this migration
  await knex("locations")
    .where({
      organization_id: ORG_ID,
      name: "DentalEMR",
      domain: "dentalemr.com",
      is_primary: true,
    })
    .del();
}
