import type { Knex } from "knex";

/**
 * Stage 2 Unlock: GBP OAuth columns on organizations.
 * Stores access/refresh tokens and account ID after Google Business Profile consent.
 */
export async function up(knex: Knex): Promise<void> {
  const hasAccessToken = await knex.schema.hasColumn("organizations", "gbp_access_token");
  const hasRefreshToken = await knex.schema.hasColumn("organizations", "gbp_refresh_token");
  const hasAccountId = await knex.schema.hasColumn("organizations", "gbp_account_id");
  const hasConnectedAt = await knex.schema.hasColumn("organizations", "gbp_connected_at");

  if (!hasAccessToken || !hasRefreshToken || !hasAccountId || !hasConnectedAt) {
    await knex.schema.alterTable("organizations", (t) => {
      if (!hasAccessToken) t.text("gbp_access_token").nullable();
      if (!hasRefreshToken) t.text("gbp_refresh_token").nullable();
      if (!hasAccountId) t.string("gbp_account_id", 255).nullable();
      if (!hasConnectedAt) t.timestamp("gbp_connected_at", { useTz: true }).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasAccessToken = await knex.schema.hasColumn("organizations", "gbp_access_token");
  if (hasAccessToken) {
    await knex.schema.alterTable("organizations", (t) => {
      t.dropColumn("gbp_access_token");
      t.dropColumn("gbp_refresh_token");
      t.dropColumn("gbp_account_id");
      t.dropColumn("gbp_connected_at");
    });
  }
}
