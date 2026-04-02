import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Add account_type to organizations
  const hasAccountType = await knex.schema.hasColumn("organizations", "account_type");
  if (!hasAccountType) {
    await knex.schema.alterTable("organizations", (table) => {
      table
        .string("account_type", 20)
        .nullable()
        .defaultTo(null)
        .comment("prospect, paying, partner, foundation, case_study, internal");
    });
  }

  // Add force_password_change to users
  const hasForcePassword = await knex.schema.hasColumn("users", "force_password_change");
  if (!hasForcePassword) {
    await knex.schema.alterTable("users", (table) => {
      table
        .boolean("force_password_change")
        .notNullable()
        .defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (table) => {
    table.dropColumn("account_type");
  });
  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("force_password_change");
  });
}
