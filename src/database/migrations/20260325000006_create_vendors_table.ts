import type { Knex } from "knex";

/**
 * Vendors table -- captures vendor emails from Checkup gate Vendor Path.
 * When a vendor selects "I provide services to this practice", their email
 * is collected before showing the share link.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("vendors", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("email", 320).notNullable().unique();
    table.string("referring_place_id", 200).nullable();
    table.boolean("wants_checkup_for_other_practices").defaultTo(false);
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("vendors");
}
