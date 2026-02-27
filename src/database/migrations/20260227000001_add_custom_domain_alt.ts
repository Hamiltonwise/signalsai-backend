import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('website_builder.projects', (table) => {
    table.string('custom_domain_alt').nullable().unique();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('website_builder.projects', (table) => {
    table.dropColumn('custom_domain_alt');
  });
}
