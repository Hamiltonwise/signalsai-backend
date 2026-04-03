import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("checkup_invitations", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("sender_session_id", 100).nullable();
    table.integer("sender_org_id").nullable();
    table.string("sender_name", 255).nullable();
    table.string("competitor_place_id", 255).notNullable();
    table.string("competitor_name", 255).notNullable();
    table.string("invite_token", 12).notNullable().unique();
    table.boolean("opened").defaultTo(false);
    table.boolean("completed_checkup").defaultTo(false);
    table.timestamp("opened_at", { useTz: true }).nullable();
    table.timestamp("completed_at", { useTz: true }).nullable();
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("checkup_invitations");
}
