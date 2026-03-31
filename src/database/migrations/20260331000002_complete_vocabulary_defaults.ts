/**
 * Complete vocabulary defaults for all verticals.
 *
 * The 8 newer verticals (barber, automotive, fitness, food_service,
 * home_services, real_estate, medspa) were missing:
 * - referralTerm (what IS a referral for this vertical?)
 * - intelligenceMode (referral_based / direct_acquisition / hybrid)
 * - primaryMetric (the ONE number that matters)
 * - caseType (what's a "new customer" event?)
 *
 * Lemonis Protocol applied: People, Process, Product for each vertical.
 * Hormozi Value Equation: Dream Outcome x Likelihood / (Time Delay x Effort)
 */
import { Knex } from "knex";

const VERTICAL_COMPLETIONS: Record<string, Record<string, any>> = {
  barber: {
    referralTerm: "word-of-mouth recommendation",
    intelligenceMode: "direct_acquisition",
    primaryMetric: "new client acquisition",
    caseType: "new client visit",
    // Lemonis: Product is the cut and the experience. Process is walk-ins + bookings + repeat.
    // No referral from other barbers. Found via Google, walk-ins, Instagram, Yelp.
  },
  automotive: {
    referralTerm: "referral partner",
    intelligenceMode: "hybrid",
    primaryMetric: "jobs completed per week",
    caseType: "new service ticket",
    // Lemonis: Trust is everything. Referrals from dealerships, insurance, real estate agents.
    // Also heavy on Google reviews and local search.
  },
  fitness: {
    referralTerm: "member referral",
    intelligenceMode: "direct_acquisition",
    primaryMetric: "new member signups",
    caseType: "new membership",
    // Lemonis: Product (classes/equipment) + People (trainers). Direct acquisition via social, Google, trials.
    // Member referral programs are powerful but secondary to direct acquisition.
  },
  food_service: {
    referralTerm: "word-of-mouth",
    intelligenceMode: "direct_acquisition",
    primaryMetric: "weekly covers",
    caseType: "new customer visit",
    // Lemonis: Product (the food) is king. Process is operations. People is the team.
    // Entirely direct acquisition: Google, delivery apps, walk-by, social.
  },
  home_services: {
    referralTerm: "referral partner",
    intelligenceMode: "hybrid",
    primaryMetric: "jobs booked per week",
    caseType: "new service call",
    // Lemonis: Process is everything for home services. Referrals from real estate agents,
    // property managers, general contractors. Also heavy on Google/Yelp.
  },
  real_estate: {
    referralTerm: "referral partner",
    intelligenceMode: "referral_based",
    primaryMetric: "listings per quarter",
    caseType: "new listing",
    // Lemonis: Relationships drive real estate. Referrals from past clients, mortgage brokers,
    // attorneys, title companies. This is the most referral-heavy non-healthcare vertical.
  },
  medspa: {
    referralTerm: "client referral",
    intelligenceMode: "hybrid",
    primaryMetric: "new client bookings",
    caseType: "new treatment booking",
    // Lemonis: Product (treatments) + People (providers). Hybrid: some referrals from
    // dermatologists/physicians, mostly direct from Google, social, reviews.
  },
};

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("vocabulary_defaults");
  if (!hasTable) return;

  for (const [vertical, additions] of Object.entries(VERTICAL_COMPLETIONS)) {
    const existing = await knex("vocabulary_defaults")
      .where({ vertical })
      .first();

    if (!existing) continue;

    const currentConfig =
      typeof existing.config === "string"
        ? JSON.parse(existing.config)
        : existing.config;

    // Merge new fields into existing config (don't overwrite existing values)
    const merged = { ...additions, ...currentConfig };
    // But force-update fields that were missing
    for (const [key, value] of Object.entries(additions)) {
      if (!currentConfig[key]) {
        merged[key] = value;
      }
    }

    await knex("vocabulary_defaults")
      .where({ vertical })
      .update({ config: JSON.stringify(merged) });
  }
}

export async function down(knex: Knex): Promise<void> {
  // No destructive rollback needed. The added fields are additive.
}
