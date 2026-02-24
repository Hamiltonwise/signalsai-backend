import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("google_data_store", (table) => {
    // Add scope columns
    table.integer("organization_id").nullable().references("id").inTable("organizations").onDelete("SET NULL");
    table.integer("location_id").nullable().references("id").inTable("locations").onDelete("SET NULL");

    // Drop dead columns (GA4/GSC integrations removed)
    table.dropColumn("ga4_data");
    table.dropColumn("gsc_data");

    // Index for efficient querying by org + location + date
    table.index(
      ["organization_id", "location_id", "run_type", "date_start"],
      "idx_gds_org_loc_type_date"
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("google_data_store", (table) => {
    table.dropIndex([], "idx_gds_org_loc_type_date");
    table.dropColumn("location_id");
    table.dropColumn("organization_id");
    table.jsonb("ga4_data").nullable();
    table.jsonb("gsc_data").nullable();
  });
}
