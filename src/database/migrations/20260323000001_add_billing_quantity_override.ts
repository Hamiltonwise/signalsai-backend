import type { Knex } from "knex";

const FLAT_RATE_ORGS: Record<number, number> = {
  25: 1, // Caswell Orthodontics — flat $5,000 regardless of location count
  39: 1, // One Endodontics — flat $1,500 regardless of location count
};

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (table) => {
    table.integer("billing_quantity_override").nullable().defaultTo(null);
  });

  for (const [orgId, quantity] of Object.entries(FLAT_RATE_ORGS)) {
    await knex("organizations")
      .where({ id: Number(orgId) })
      .update({ billing_quantity_override: quantity });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (table) => {
    table.dropColumn("billing_quantity_override");
  });
}
