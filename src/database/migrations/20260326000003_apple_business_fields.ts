import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (t) => {
    t.boolean("apple_business_claimed").defaultTo(false);
    t.timestamp("apple_business_claimed_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (t) => {
    t.dropColumn("apple_business_claimed");
    t.dropColumn("apple_business_claimed_at");
  });
}
