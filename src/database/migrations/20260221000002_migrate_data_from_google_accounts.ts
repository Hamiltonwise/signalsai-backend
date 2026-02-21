import { Knex } from "knex";

/**
 * Data migration: copy profile fields from google_accounts to users,
 * and org fields from google_accounts to organizations.
 * Runs in a transaction for safety.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    // Copy profile fields to users (matched by user_id)
    await trx.raw(`
      UPDATE users u
      SET
        first_name = ga.first_name,
        last_name = ga.last_name,
        phone = ga.phone,
        email_verified = true
      FROM google_accounts ga
      WHERE u.id = ga.user_id
        AND ga.first_name IS NOT NULL
    `);

    // Copy org fields to organizations (matched by organization_id)
    await trx.raw(`
      UPDATE organizations o
      SET
        operational_jurisdiction = ga.operational_jurisdiction,
        onboarding_completed = ga.onboarding_completed,
        onboarding_wizard_completed = ga.onboarding_wizard_completed,
        setup_progress = ga.setup_progress
      FROM google_accounts ga
      WHERE o.id = ga.organization_id
        AND ga.organization_id IS NOT NULL
    `);

    // Ensure organizations.name and domain are populated from google_accounts
    await trx.raw(`
      UPDATE organizations o
      SET
        name = COALESCE(o.name, ga.practice_name),
        domain = COALESCE(o.domain, ga.domain_name)
      FROM google_accounts ga
      WHERE o.id = ga.organization_id
        AND ga.organization_id IS NOT NULL
    `);
  });
}

export async function down(knex: Knex): Promise<void> {
  // Rollback: clear copied columns (data loss acceptable for rollback)
  await knex.transaction(async (trx) => {
    await trx.raw(`
      UPDATE users SET first_name = NULL, last_name = NULL, phone = NULL, email_verified = false
    `);
    await trx.raw(`
      UPDATE organizations SET operational_jurisdiction = NULL, onboarding_completed = false, onboarding_wizard_completed = false, setup_progress = '{"step1_api_connected": false, "step2_pms_uploaded": false, "dismissed": false, "completed": false}'
    `);
  });
}
