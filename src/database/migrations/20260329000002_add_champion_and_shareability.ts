import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Champion Client: $50/month funds a Heroes seat
  await knex.schema.alterTable("organizations", (t) => {
    t.boolean("is_champion").defaultTo(false);
    t.timestamp("champion_since", { useTz: true }).nullable();
    t.string("champion_hero_org_name", 255).nullable(); // the Heroes org they sponsor
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (t) => {
    t.dropColumn("is_champion");
    t.dropColumn("champion_since");
    t.dropColumn("champion_hero_org_name");
  });
}
