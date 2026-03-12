import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('organizations', (table) => {
    // Organization type determines Stripe pricing: health = $2,000/location, saas = $3,500/team
    // Null defaults to 'health' in application logic. Immutable once set.
    table.string('organization_type', 20).nullable().defaultTo(null);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('organizations', (table) => {
    table.dropColumn('organization_type');
  });
}
