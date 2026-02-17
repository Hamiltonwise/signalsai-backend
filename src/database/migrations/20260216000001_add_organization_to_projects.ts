import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('website_builder.projects', (table) => {
    // Link to organization (1:1 relationship)
    table.integer('organization_id').nullable().references('id').inTable('organizations').onDelete('SET NULL');

    // Custom domain support (for future)
    table.string('custom_domain').nullable().unique();
    table.timestamp('domain_verified_at').nullable();

    // Read-only flag (for downgraded orgs)
    table.boolean('is_read_only').defaultTo(false).notNullable();
  });

  // Create unique index for 1:1 relationship (one website per org)
  // Allows multiple NULL organization_ids (admin projects)
  await knex.raw(`
    CREATE UNIQUE INDEX one_website_per_org
    ON website_builder.projects (organization_id)
    WHERE organization_id IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS website_builder.one_website_per_org');

  await knex.schema.alterTable('website_builder.projects', (table) => {
    table.dropColumn('organization_id');
    table.dropColumn('custom_domain');
    table.dropColumn('domain_verified_at');
    table.dropColumn('is_read_only');
  });
}
