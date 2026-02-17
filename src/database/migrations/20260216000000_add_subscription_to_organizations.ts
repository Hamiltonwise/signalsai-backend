import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('organizations', (table) => {
    // Subscription tier (DWY = Done With You, DFY = Done For You)
    table.enum('subscription_tier', ['DWY', 'DFY']).defaultTo('DWY').notNullable();

    // Subscription status
    table.enum('subscription_status', ['active', 'inactive', 'trial', 'cancelled']).defaultTo('active').notNullable();

    // Timestamps for subscription lifecycle
    table.timestamp('subscription_started_at').nullable();
    table.timestamp('subscription_updated_at').nullable();

    // Stripe integration fields (for future use)
    table.string('stripe_customer_id').nullable();
    table.string('stripe_subscription_id').nullable();

    // Rate limiting fields
    table.integer('website_edits_this_month').defaultTo(0).notNullable();
    table.timestamp('website_edits_reset_at').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('organizations', (table) => {
    table.dropColumn('subscription_tier');
    table.dropColumn('subscription_status');
    table.dropColumn('subscription_started_at');
    table.dropColumn('subscription_updated_at');
    table.dropColumn('stripe_customer_id');
    table.dropColumn('stripe_subscription_id');
    table.dropColumn('website_edits_this_month');
    table.dropColumn('website_edits_reset_at');
  });
}
