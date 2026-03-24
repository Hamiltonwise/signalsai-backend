import type { Knex } from "knex";

/**
 * WO-MULTI-LOCATION: Add phone, zip, is_coming_soon, per-location GBP tokens,
 * ranking_position, and review_count to locations table.
 *
 * The base locations table + address/city/state/place_id/lat/lng already exist
 * from 20260222000001 + 20260324000004. This adds the remaining columns
 * needed for full multi-location support.
 */
export async function up(knex: Knex): Promise<void> {
  const hasPhone = await knex.schema.hasColumn("locations", "phone");
  const hasZip = await knex.schema.hasColumn("locations", "zip");
  const hasComingSoon = await knex.schema.hasColumn("locations", "is_coming_soon");
  const hasGbpToken = await knex.schema.hasColumn("locations", "gbp_access_token");
  const hasGbpAccountId = await knex.schema.hasColumn("locations", "gbp_account_id");
  const hasRanking = await knex.schema.hasColumn("locations", "ranking_position");
  const hasReviewCount = await knex.schema.hasColumn("locations", "review_count");

  const needsAlter = !hasPhone || !hasZip || !hasComingSoon || !hasGbpToken || !hasGbpAccountId || !hasRanking || !hasReviewCount;

  if (needsAlter) {
    await knex.schema.alterTable("locations", (t) => {
      if (!hasPhone) t.string("phone", 50).nullable();
      if (!hasZip) t.string("zip", 20).nullable();
      if (!hasComingSoon) t.boolean("is_coming_soon").defaultTo(false);
      if (!hasGbpToken) t.text("gbp_access_token").nullable();
      if (!hasGbpAccountId) t.string("gbp_account_id", 255).nullable();
      if (!hasRanking) t.integer("ranking_position").nullable();
      if (!hasReviewCount) t.integer("review_count").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasPhone = await knex.schema.hasColumn("locations", "phone");
  if (hasPhone) {
    await knex.schema.alterTable("locations", (t) => {
      t.dropColumn("phone");
      t.dropColumn("zip");
      t.dropColumn("is_coming_soon");
      t.dropColumn("gbp_access_token");
      t.dropColumn("gbp_account_id");
      t.dropColumn("ranking_position");
      t.dropColumn("review_count");
    });
  }
}
