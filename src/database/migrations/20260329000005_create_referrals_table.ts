import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Add stripe_payment_method_id to organizations for card-on-file trial flow
  const hasCol = await knex.schema.hasColumn("organizations", "stripe_payment_method_id");
  if (!hasCol) {
    await knex.schema.alterTable("organizations", (table) => {
      table.string("stripe_payment_method_id").nullable();
    });
  }

  await knex.schema.createTable("referrals", (table) => {
    table.uuid("id").primary().defaultTo(knex.fn.uuid());
    table
      .integer("referrer_org_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    table
      .integer("referred_org_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    table.string("referral_code", 32).notNullable();
    table
      .string("status", 20)
      .notNullable()
      .defaultTo("pending"); // 'pending' | 'signup' | 'converted' | 'rewarded'
    table.timestamp("referred_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("converted_at").nullable();
    table.timestamp("reward_applied_at").nullable();
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("referrals");

  const hasCol = await knex.schema.hasColumn("organizations", "stripe_payment_method_id");
  if (hasCol) {
    await knex.schema.alterTable("organizations", (table) => {
      table.dropColumn("stripe_payment_method_id");
    });
  }
}
