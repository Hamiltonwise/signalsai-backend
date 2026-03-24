import type { Knex } from "knex";

/**
 * WO32: Add checkup_review_count_at_creation to organizations.
 */
export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("organizations", "checkup_review_count_at_creation");
  if (!has) {
    await knex.schema.alterTable("organizations", (t) => {
      t.integer("checkup_review_count_at_creation").defaultTo(0);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("organizations", "checkup_review_count_at_creation");
  if (has) {
    await knex.schema.alterTable("organizations", (t) => {
      t.dropColumn("checkup_review_count_at_creation");
    });
  }
}
