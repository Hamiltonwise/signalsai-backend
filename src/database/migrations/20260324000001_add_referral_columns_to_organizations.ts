import type { Knex } from "knex";

/**
 * WO6: Add referral_code and referred_by_org_id to organizations.
 * - referral_code: unique 8-char code for each org
 * - referred_by_org_id: FK to the org that referred this one
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (table) => {
    table.string("referral_code", 8).nullable().unique();
    table
      .integer("referred_by_org_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("organizations")
      .onDelete("SET NULL");
  });

  // Backfill existing orgs with referral codes
  const { customAlphabet } = require("nanoid");
  const generate = customAlphabet(
    "23456789ABCDEFGHJKLMNPQRSTUVWXYZ",
    8
  );

  const orgs = await knex("organizations").select("id").whereNull("referral_code");
  for (const org of orgs) {
    let code: string;
    let attempts = 0;
    // Generate unique code (retry on collision)
    do {
      code = generate();
      attempts++;
    } while (
      (await knex("organizations").where({ referral_code: code }).first()) &&
      attempts < 10
    );
    await knex("organizations").where({ id: org.id }).update({ referral_code: code });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (table) => {
    table.dropColumn("referred_by_org_id");
    table.dropColumn("referral_code");
  });
}
