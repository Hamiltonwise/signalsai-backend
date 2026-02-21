import { Knex } from "knex";

/**
 * Rename google_accounts → google_connections, drop migrated columns,
 * drop user_id FK, make organization_id NOT NULL, rename FK in google_properties.
 */
export async function up(knex: Knex): Promise<void> {
  // Rename the table
  await knex.schema.renameTable("google_accounts", "google_connections");

  // Drop columns that were migrated to users and organizations
  await knex.schema.alterTable("google_connections", (table) => {
    table.dropColumn("first_name");
    table.dropColumn("last_name");
    table.dropColumn("phone");
    table.dropColumn("practice_name");
    table.dropColumn("domain_name");
    table.dropColumn("operational_jurisdiction");
    table.dropColumn("onboarding_completed");
    table.dropColumn("onboarding_wizard_completed");
    table.dropColumn("setup_progress");
    table.dropColumn("user_id");
  });

  // Delete any rows with NULL organization_id before making it NOT NULL
  await knex.raw(`
    DELETE FROM google_connections WHERE organization_id IS NULL
  `);

  // Make organization_id NOT NULL
  await knex.raw(`
    ALTER TABLE google_connections ALTER COLUMN organization_id SET NOT NULL
  `);

  // Rename FK in google_properties (if the table exists)
  const hasGoogleProperties = await knex.schema.hasTable("google_properties");
  if (hasGoogleProperties) {
    await knex.schema.alterTable("google_properties", (table) => {
      table.renameColumn("google_account_id", "google_connection_id");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Reverse FK rename in google_properties (if the table exists)
  const hasGoogleProperties = await knex.schema.hasTable("google_properties");
  if (hasGoogleProperties) {
    await knex.schema.alterTable("google_properties", (table) => {
      table.renameColumn("google_connection_id", "google_account_id");
    });
  }

  // Make organization_id nullable again
  await knex.raw(`
    ALTER TABLE google_connections ALTER COLUMN organization_id DROP NOT NULL
  `);

  // Re-add dropped columns
  await knex.schema.alterTable("google_connections", (table) => {
    table.integer("user_id").nullable();
    table.string("first_name", 255).nullable();
    table.string("last_name", 255).nullable();
    table.string("phone", 50).nullable();
    table.string("practice_name", 255).nullable();
    table.string("domain_name", 255).nullable();
    table.string("operational_jurisdiction", 500).nullable();
    table.boolean("onboarding_completed").defaultTo(false);
    table.boolean("onboarding_wizard_completed").defaultTo(false);
    table.jsonb("setup_progress").nullable();
  });

  // Rename table back
  await knex.schema.renameTable("google_connections", "google_accounts");
}
