/**
 * HubSpot CRM integration -- OAuth connection storage.
 *
 * Stores OAuth tokens per organization for read-only CRM pipeline sync.
 * Access tokens expire in 30 minutes and are refreshed automatically.
 */

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("hubspot_connections", (t) => {
    t.increments("id").primary();
    t.integer("organization_id")
      .notNullable()
      .unique()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    t.text("access_token").notNullable();
    t.text("refresh_token").notNullable();
    t.timestamp("token_expires_at").notNullable();
    t.string("hub_id", 50).nullable();
    t.string("hub_domain", 255).nullable();
    t.text("scopes").nullable();
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("hubspot_connections");
}
