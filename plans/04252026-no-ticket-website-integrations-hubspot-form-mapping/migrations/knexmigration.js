// Knex migration scaffold for Website Integrations (v1).
// During execution, this scaffold will be split into THREE separate Knex migration
// files in src/database/migrations/ (one per table) to match the project's
// one-migration-per-concern convention seen in existing migrations like
// 20260228000004_platform_credentials.ts.
//
// Final filenames (created in T1):
//   src/database/migrations/20260425100000_create_website_integrations.ts
//   src/database/migrations/20260425100001_create_website_integration_form_mappings.ts
//   src/database/migrations/20260425100002_create_crm_sync_logs.ts
//
// This file is the consolidated scaffold; it captures the up/down for all three
// in one place for review. Translate to TypeScript with Knex.Knex types during
// execution.

/* eslint-disable */

/** @type {import('knex').Knex.Migration} */
exports.up = async function up(knex) {
  // ---------------------------------------------------------------------------
  // 1) website_integrations
  // ---------------------------------------------------------------------------
  await knex.schema.withSchema('website_builder').createTable('website_integrations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('project_id')
      .notNullable()
      .references('id')
      .inTable('website_builder.projects')
      .onDelete('CASCADE');
    t.text('platform').notNullable();
    t.text('label').nullable();
    t.text('encrypted_credentials').notNullable();
    t.jsonb('metadata').notNullable().defaultTo('{}');
    t.text('status').notNullable().defaultTo('active');
    t.timestamp('last_validated_at', { useTz: true }).nullable();
    t.text('last_error').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.unique(['project_id', 'platform'], 'website_integrations_unique_project_platform');
    t.index(['project_id'], 'idx_website_integrations_project_id');
    t.index(['platform'], 'idx_website_integrations_platform');
  });

  await knex.raw(`
    ALTER TABLE website_builder.website_integrations
    ADD CONSTRAINT website_integrations_status_check
    CHECK (status IN ('active', 'revoked', 'broken'))
  `);

  await knex.raw(`
    ALTER TABLE website_builder.website_integrations
    ADD CONSTRAINT website_integrations_platform_check
    CHECK (platform IN ('hubspot'))
  `);

  await knex.raw(`
    CREATE INDEX idx_website_integrations_status
    ON website_builder.website_integrations (status)
    WHERE status != 'active'
  `);

  // ---------------------------------------------------------------------------
  // 2) website_integration_form_mappings
  // ---------------------------------------------------------------------------
  await knex.schema.withSchema('website_builder').createTable('website_integration_form_mappings', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('integration_id')
      .notNullable()
      .references('id')
      .inTable('website_builder.website_integrations')
      .onDelete('CASCADE');
    t.text('website_form_name').notNullable();
    t.text('vendor_form_id').notNullable();
    t.text('vendor_form_name').nullable();
    t.jsonb('field_mapping').notNullable().defaultTo('{}');
    t.text('status').notNullable().defaultTo('active');
    t.timestamp('last_validated_at', { useTz: true }).nullable();
    t.text('last_error').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.unique(['integration_id', 'website_form_name'], 'integration_form_mappings_unique_integration_form');
    t.index(['integration_id'], 'idx_integration_form_mappings_integration_id');
    t.index(['integration_id', 'vendor_form_id'], 'idx_integration_form_mappings_vendor_form');
  });

  await knex.raw(`
    ALTER TABLE website_builder.website_integration_form_mappings
    ADD CONSTRAINT integration_form_mappings_status_check
    CHECK (status IN ('active', 'broken'))
  `);

  await knex.raw(`
    CREATE INDEX idx_integration_form_mappings_status
    ON website_builder.website_integration_form_mappings (status)
    WHERE status = 'broken'
  `);

  // ---------------------------------------------------------------------------
  // 3) crm_sync_logs
  // ---------------------------------------------------------------------------
  await knex.schema.withSchema('website_builder').createTable('crm_sync_logs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    // ON DELETE SET NULL (not CASCADE) — audit trail must outlive integration deletion.
    t.uuid('integration_id')
      .nullable()
      .references('id')
      .inTable('website_builder.website_integrations')
      .onDelete('SET NULL');
    t.uuid('mapping_id')
      .nullable()
      .references('id')
      .inTable('website_builder.website_integration_form_mappings')
      .onDelete('SET NULL');
    t.uuid('submission_id')
      .nullable()
      .references('id')
      .inTable('website_builder.form_submissions')
      .onDelete('SET NULL');
    // Denormalized — preserved when integration/mapping rows are deleted.
    t.text('platform').nullable();
    t.text('vendor_form_id').nullable();
    t.text('outcome').notNullable();
    t.integer('vendor_response_status').nullable();
    t.text('vendor_response_body').nullable();
    t.text('error').nullable();
    t.timestamp('attempted_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['integration_id', 'attempted_at'], 'idx_crm_sync_logs_integration_attempted');
    t.index(['submission_id'], 'idx_crm_sync_logs_submission');
  });

  // 'no_integration' deliberately excluded — we don't write log rows for submissions
  // on websites without any CRM connected (write-amplification avoidance).
  await knex.raw(`
    ALTER TABLE website_builder.crm_sync_logs
    ADD CONSTRAINT crm_sync_logs_outcome_check
    CHECK (outcome IN ('success', 'skipped_flagged', 'failed', 'no_mapping'))
  `);

  await knex.raw(`
    CREATE INDEX idx_crm_sync_logs_outcome
    ON website_builder.crm_sync_logs (outcome, attempted_at DESC)
    WHERE outcome IN ('failed', 'skipped_flagged')
  `);
};

/** @type {import('knex').Knex.Migration} */
exports.down = async function down(knex) {
  await knex.schema.withSchema('website_builder').dropTableIfExists('crm_sync_logs');
  await knex.schema.withSchema('website_builder').dropTableIfExists('website_integration_form_mappings');
  await knex.schema.withSchema('website_builder').dropTableIfExists('website_integrations');
};
