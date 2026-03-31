/**
 * Add intelligenceMode to the original 9 verticals that were missing it.
 *
 * Healthcare specialists (endo, ortho, chiro, PT, optometry) are referral_based.
 * General dentistry and veterinary are hybrid (referrals + direct).
 * Professional services (legal, financial, accounting) are hybrid.
 */
import { Knex } from "knex";

const MODE_ASSIGNMENTS: Record<string, string> = {
  endodontics: "referral_based",
  orthodontics: "referral_based",
  chiropractic: "referral_based",
  physical_therapy: "referral_based",
  optometry: "hybrid",
  general_dentistry: "hybrid",
  veterinary: "hybrid",
  legal: "hybrid",
  financial_advisor: "hybrid",
  accounting: "hybrid",
};

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("vocabulary_defaults");
  if (!hasTable) return;

  for (const [vertical, mode] of Object.entries(MODE_ASSIGNMENTS)) {
    const existing = await knex("vocabulary_defaults")
      .where({ vertical })
      .first();

    if (!existing) continue;

    const currentConfig =
      typeof existing.config === "string"
        ? JSON.parse(existing.config)
        : existing.config;

    if (!currentConfig.intelligenceMode) {
      currentConfig.intelligenceMode = mode;
      await knex("vocabulary_defaults")
        .where({ vertical })
        .update({ config: JSON.stringify(currentConfig) });
    }
  }
}

export async function down(knex: Knex): Promise<void> {}
