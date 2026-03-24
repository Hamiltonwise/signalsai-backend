import type { Knex } from "knex";

/**
 * WO-NOTIFICATION-PREFS: notification_prefs JSONB on organizations.
 */
export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("organizations", "notification_prefs");
  if (!has) {
    await knex.schema.alterTable("organizations", (t) => {
      t.jsonb("notification_prefs").defaultTo(
        '{"monday_email":true,"competitor_alerts":true,"milestone_celebrations":true}'
      );
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("organizations", "notification_prefs");
  if (has) {
    await knex.schema.alterTable("organizations", (t) => {
      t.dropColumn("notification_prefs");
    });
  }
}
