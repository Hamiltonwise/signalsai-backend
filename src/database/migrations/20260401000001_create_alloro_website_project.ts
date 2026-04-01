/**
 * Create website builder project for Alloro (org 34).
 *
 * The Alloro marketing site (getalloro.com) is built in the React frontend
 * but needs a project record so the dashboard website page shows it as live
 * instead of "being built."
 */

import { Knex } from "knex";
import { v4 as uuid } from "uuid";

export async function up(knex: Knex): Promise<void> {
  const ORG_ID = 34;

  // Check if project already exists for this org
  const existing = await knex("website_builder.projects")
    .where({ organization_id: ORG_ID })
    .first();

  if (existing) return;

  await knex("website_builder.projects").insert({
    id: uuid(),
    organization_id: ORG_ID,
    generated_hostname: "getalloro",
    display_name: "Alloro",
    custom_domain: "getalloro.com",
    status: "LIVE",
    primary_color: "#D56753",
    accent_color: "#212D40",
    created_at: new Date(),
    updated_at: new Date(),
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex("website_builder.projects")
    .where({ organization_id: 34, generated_hostname: "getalloro" })
    .del();
}
