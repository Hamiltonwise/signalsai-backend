/**
 * Connect DentalEMR website (dentalemr.com) to org 6.
 *
 * DentalEMR's website is hosted on Alloro infrastructure. This project
 * record makes the customer dashboard show it as live instead of
 * "being built," and enables Proofline monitoring of dentalemr.com.
 */

import { Knex } from "knex";
import { v4 as uuid } from "uuid";

export async function up(knex: Knex): Promise<void> {
  const ORG_ID = 6;

  // Only run if org 6 exists in this database
  const org = await knex("organizations").where({ id: ORG_ID }).first();
  if (!org) return;

  // Check if project already exists for this org
  const existing = await knex("website_builder.projects")
    .where({ organization_id: ORG_ID })
    .first();

  if (existing) return;

  await knex("website_builder.projects").insert({
    id: uuid(),
    organization_id: ORG_ID,
    generated_hostname: "dentalemr",
    display_name: "DentalEMR",
    custom_domain: "dentalemr.com",
    status: "LIVE",
    primary_color: "#0D4F8B",
    accent_color: "#1A1A2E",
    created_at: new Date(),
    updated_at: new Date(),
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex("website_builder.projects")
    .where({ organization_id: 6, generated_hostname: "dentalemr" })
    .del();
}
