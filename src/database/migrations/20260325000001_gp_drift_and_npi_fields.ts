/**
 * Migration: GP Drift fields + NPI verification fields
 *
 * T3-F: Adds drift dismissal timestamps to referral_sources (if table exists).
 * T3-E: Adds NPI and npi_verified to organizations.
 */

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // T3-F: GP Drift fields on referral_sources
  const hasReferralSources = await knex.schema.hasTable("referral_sources");
  if (hasReferralSources) {
    const hasSurpriseCatch = await knex.schema.hasColumn("referral_sources", "surprise_catch_dismissed_at");
    if (!hasSurpriseCatch) {
      await knex.schema.alterTable("referral_sources", (t) => {
        t.timestamp("surprise_catch_dismissed_at", { useTz: true });
      });
    }
    const hasDrift = await knex.schema.hasColumn("referral_sources", "gp_drift_dismissed_at");
    if (!hasDrift) {
      await knex.schema.alterTable("referral_sources", (t) => {
        t.timestamp("gp_drift_dismissed_at", { useTz: true });
      });
    }
  }

  // T3-E: NPI fields on organizations
  const hasNpi = await knex.schema.hasColumn("organizations", "npi");
  if (!hasNpi) {
    await knex.schema.alterTable("organizations", (t) => {
      t.string("npi", 10);
      t.boolean("npi_verified").defaultTo(false);
    });
  }

  console.log("[Migration] GP drift fields + NPI fields added");
}

export async function down(knex: Knex): Promise<void> {
  const hasReferralSources = await knex.schema.hasTable("referral_sources");
  if (hasReferralSources) {
    const hasSurpriseCatch = await knex.schema.hasColumn("referral_sources", "surprise_catch_dismissed_at");
    if (hasSurpriseCatch) {
      await knex.schema.alterTable("referral_sources", (t) => {
        t.dropColumn("surprise_catch_dismissed_at");
      });
    }
    const hasDrift = await knex.schema.hasColumn("referral_sources", "gp_drift_dismissed_at");
    if (hasDrift) {
      await knex.schema.alterTable("referral_sources", (t) => {
        t.dropColumn("gp_drift_dismissed_at");
      });
    }
  }

  const hasNpi = await knex.schema.hasColumn("organizations", "npi");
  if (hasNpi) {
    await knex.schema.alterTable("organizations", (t) => {
      t.dropColumn("npi");
      t.dropColumn("npi_verified");
    });
  }
}
