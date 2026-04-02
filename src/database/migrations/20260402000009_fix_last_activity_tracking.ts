/**
 * Fix Last Activity Tracking
 *
 * Bug: days_since_login calculated from first_login_at (never updates).
 * A customer who logged in Day 1 shows "0 days since login" forever.
 * Churn prediction, client health, and admin metrics all use this broken value.
 *
 * Fix: Add last_activity_at to organizations, updated on any meaningful
 * customer action (login, dashboard view, email open, feature use).
 */

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Add last_activity_at column
  const hasColumn = await knex.schema.hasColumn("organizations", "last_activity_at");
  if (!hasColumn) {
    await knex.schema.alterTable("organizations", (table) => {
      table.timestamp("last_activity_at").nullable();
    });
  }

  // Backfill from users.last_login_at for existing orgs
  // Use the most recent last_login_at from any admin user in the org
  await knex.raw(`
    UPDATE organizations o
    SET last_activity_at = sub.last_login
    FROM (
      SELECT ou.organization_id, MAX(u.last_login_at) as last_login
      FROM organization_users ou
      JOIN users u ON u.id = ou.user_id
      WHERE u.last_login_at IS NOT NULL
      GROUP BY ou.organization_id
    ) sub
    WHERE o.id = sub.organization_id
      AND o.last_activity_at IS NULL
  `);

  // For orgs with no user login but with behavioral events, use last event
  await knex.raw(`
    UPDATE organizations o
    SET last_activity_at = sub.last_event
    FROM (
      SELECT org_id, MAX(created_at) as last_event
      FROM behavioral_events
      WHERE event_type IN ('dashboard.viewed', 'one_action.completed', 'review_request.sent')
      GROUP BY org_id
    ) sub
    WHERE o.id = sub.org_id
      AND o.last_activity_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("organizations", "last_activity_at");
  if (hasColumn) {
    await knex.schema.alterTable("organizations", (table) => {
      table.dropColumn("last_activity_at");
    });
  }
}
