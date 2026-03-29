/**
 * Vocabulary Auto-Mapper
 *
 * Reads a business's GBP category and automatically configures
 * the vocabulary for that vertical. No manual setup. No dropdowns.
 * Alloro figures out the business type from Google and speaks
 * the owner's language from the first interaction.
 *
 * The Marcus Lemonis play: walk in, look around, know the business.
 */

import { db } from "../database/connection";

interface VocabularyPreset {
  vertical: string;
  patientTerm: string;
  referralTerm: string;
  caseType: string;
  primaryMetric: string;
  healthScoreLabel: string;
  competitorTerm: string;
  providerTerm: string;
  locationTerm: string;
  avgCaseValue: number;
  intelligenceMode: "referral_based" | "direct_acquisition" | "hybrid";
}

// GBP category patterns mapped to vocabulary presets
const CATEGORY_MAP: { patterns: string[]; preset: VocabularyPreset }[] = [
  {
    patterns: ["endodontist", "root canal"],
    preset: {
      vertical: "endodontics",
      patientTerm: "patient",
      referralTerm: "referring dentist",
      caseType: "referral case",
      primaryMetric: "referral volume",
      healthScoreLabel: "Practice Health Score",
      competitorTerm: "competitor",
      providerTerm: "doctor",
      locationTerm: "practice",
      avgCaseValue: 1500,
      intelligenceMode: "referral_based",
    },
  },
  {
    patterns: ["orthodontist", "orthodontic"],
    preset: {
      vertical: "orthodontics",
      patientTerm: "patient",
      referralTerm: "referring dentist",
      caseType: "new patient",
      primaryMetric: "case starts",
      healthScoreLabel: "Practice Health Score",
      competitorTerm: "competitor",
      providerTerm: "doctor",
      locationTerm: "practice",
      avgCaseValue: 5500,
      intelligenceMode: "hybrid",
    },
  },
  {
    patterns: ["dentist", "dental"],
    preset: {
      vertical: "general_dental",
      patientTerm: "patient",
      referralTerm: "referral source",
      caseType: "new patient",
      primaryMetric: "new patients",
      healthScoreLabel: "Practice Health Score",
      competitorTerm: "competitor",
      providerTerm: "dentist",
      locationTerm: "practice",
      avgCaseValue: 800,
      intelligenceMode: "hybrid",
    },
  },
  {
    patterns: ["veterinar", "animal hospital", "pet clinic"],
    preset: {
      vertical: "veterinary",
      patientTerm: "pet owner",
      referralTerm: "referral source",
      caseType: "new client",
      primaryMetric: "new clients",
      healthScoreLabel: "Business Health Score",
      competitorTerm: "competitor",
      providerTerm: "veterinarian",
      locationTerm: "clinic",
      avgCaseValue: 400,
      intelligenceMode: "hybrid",
    },
  },
  {
    patterns: ["attorney", "lawyer", "law firm", "legal"],
    preset: {
      vertical: "legal",
      patientTerm: "client",
      referralTerm: "referral source",
      caseType: "new case",
      primaryMetric: "intake calls",
      healthScoreLabel: "Business Health Score",
      competitorTerm: "competitor",
      providerTerm: "attorney",
      locationTerm: "firm",
      avgCaseValue: 3000,
      intelligenceMode: "hybrid",
    },
  },
  {
    patterns: ["accountant", "cpa", "tax preparer", "bookkeep"],
    preset: {
      vertical: "accounting",
      patientTerm: "client",
      referralTerm: "referral source",
      caseType: "new engagement",
      primaryMetric: "new clients",
      healthScoreLabel: "Business Health Score",
      competitorTerm: "competitor",
      providerTerm: "accountant",
      locationTerm: "firm",
      avgCaseValue: 2000,
      intelligenceMode: "hybrid",
    },
  },
  {
    patterns: ["chiropract"],
    preset: {
      vertical: "chiropractic",
      patientTerm: "patient",
      referralTerm: "referral source",
      caseType: "new patient",
      primaryMetric: "new patients",
      healthScoreLabel: "Practice Health Score",
      competitorTerm: "competitor",
      providerTerm: "chiropractor",
      locationTerm: "office",
      avgCaseValue: 600,
      intelligenceMode: "referral_based",
    },
  },
  {
    patterns: ["physical therap", "physiotherap", "pt clinic"],
    preset: {
      vertical: "physical_therapy",
      patientTerm: "patient",
      referralTerm: "referring physician",
      caseType: "referral",
      primaryMetric: "referral volume",
      healthScoreLabel: "Practice Health Score",
      competitorTerm: "competitor",
      providerTerm: "therapist",
      locationTerm: "clinic",
      avgCaseValue: 800,
      intelligenceMode: "referral_based",
    },
  },
  {
    patterns: ["optometrist", "optician", "eye care", "vision"],
    preset: {
      vertical: "optometry",
      patientTerm: "patient",
      referralTerm: "referral source",
      caseType: "exam",
      primaryMetric: "new patients",
      healthScoreLabel: "Practice Health Score",
      competitorTerm: "competitor",
      providerTerm: "optometrist",
      locationTerm: "office",
      avgCaseValue: 500,
      intelligenceMode: "hybrid",
    },
  },
  {
    patterns: ["barber", "hair salon", "salon", "beauty", "nail"],
    preset: {
      vertical: "beauty",
      patientTerm: "customer",
      referralTerm: "word of mouth",
      caseType: "appointment",
      primaryMetric: "bookings",
      healthScoreLabel: "Business Health Score",
      competitorTerm: "competitor",
      providerTerm: "stylist",
      locationTerm: "shop",
      avgCaseValue: 50,
      intelligenceMode: "direct_acquisition",
    },
  },
  {
    patterns: ["plumb", "hvac", "electric", "roofing", "contractor", "handyman", "landscap"],
    preset: {
      vertical: "home_services",
      patientTerm: "customer",
      referralTerm: "referral source",
      caseType: "job",
      primaryMetric: "new jobs",
      healthScoreLabel: "Business Health Score",
      competitorTerm: "competitor",
      providerTerm: "contractor",
      locationTerm: "business",
      avgCaseValue: 1200,
      intelligenceMode: "direct_acquisition",
    },
  },
  {
    patterns: ["restaurant", "cafe", "coffee", "bakery", "food"],
    preset: {
      vertical: "food_service",
      patientTerm: "customer",
      referralTerm: "word of mouth",
      caseType: "visit",
      primaryMetric: "daily covers",
      healthScoreLabel: "Business Health Score",
      competitorTerm: "competitor",
      providerTerm: "owner",
      locationTerm: "restaurant",
      avgCaseValue: 30,
      intelligenceMode: "direct_acquisition",
    },
  },
  {
    patterns: ["auto repair", "mechanic", "body shop", "car wash", "tire"],
    preset: {
      vertical: "automotive",
      patientTerm: "customer",
      referralTerm: "referral source",
      caseType: "repair",
      primaryMetric: "work orders",
      healthScoreLabel: "Business Health Score",
      competitorTerm: "competitor",
      providerTerm: "mechanic",
      locationTerm: "shop",
      avgCaseValue: 600,
      intelligenceMode: "direct_acquisition",
    },
  },
  {
    patterns: ["real estate", "realtor", "property"],
    preset: {
      vertical: "real_estate",
      patientTerm: "client",
      referralTerm: "referral source",
      caseType: "listing",
      primaryMetric: "closings",
      healthScoreLabel: "Business Health Score",
      competitorTerm: "competitor",
      providerTerm: "agent",
      locationTerm: "office",
      avgCaseValue: 8000,
      intelligenceMode: "hybrid",
    },
  },
  {
    patterns: ["fitness", "gym", "personal trainer", "yoga", "pilates", "crossfit"],
    preset: {
      vertical: "fitness",
      patientTerm: "member",
      referralTerm: "referral",
      caseType: "membership",
      primaryMetric: "new members",
      healthScoreLabel: "Business Health Score",
      competitorTerm: "competitor",
      providerTerm: "trainer",
      locationTerm: "gym",
      avgCaseValue: 150,
      intelligenceMode: "direct_acquisition",
    },
  },
  {
    patterns: ["med spa", "medspa", "aesthetic", "cosmetic", "dermatolog", "plastic surg"],
    preset: {
      vertical: "medspa",
      patientTerm: "patient",
      referralTerm: "referral source",
      caseType: "treatment",
      primaryMetric: "bookings",
      healthScoreLabel: "Practice Health Score",
      competitorTerm: "competitor",
      providerTerm: "provider",
      locationTerm: "practice",
      avgCaseValue: 1200,
      intelligenceMode: "hybrid",
    },
  },
];

// Universal fallback for any business not matched
const UNIVERSAL_FALLBACK: VocabularyPreset = {
  vertical: "general",
  patientTerm: "customer",
  referralTerm: "referral source",
  caseType: "new customer",
  primaryMetric: "customer acquisition",
  healthScoreLabel: "Business Health Score",
  competitorTerm: "competitor",
  providerTerm: "owner",
  locationTerm: "business",
  avgCaseValue: 500,
  intelligenceMode: "direct_acquisition",
};

/**
 * Detect the vocabulary preset from a GBP category string.
 * Returns the best-matching preset or the universal fallback.
 */
export function detectPreset(gbpCategory: string, gbpTypes?: string[]): VocabularyPreset {
  const searchText = [gbpCategory, ...(gbpTypes || [])].join(" ").toLowerCase();

  for (const entry of CATEGORY_MAP) {
    if (entry.patterns.some((pattern) => searchText.includes(pattern))) {
      return entry.preset;
    }
  }

  return UNIVERSAL_FALLBACK;
}

/**
 * Auto-configure vocabulary for an organization based on GBP data.
 * Called at account creation after checkup completes.
 */
export async function autoConfigureVocabulary(
  orgId: number,
  gbpCategory: string,
  gbpTypes?: string[],
): Promise<VocabularyPreset> {
  const preset = detectPreset(gbpCategory, gbpTypes);

  // Check if vocabulary already configured
  const existing = await db("vocabulary_configs").where({ org_id: orgId }).first();
  if (existing) return preset;

  // Insert vocabulary config
  await db("vocabulary_configs").insert({
    org_id: orgId,
    vertical: preset.vertical,
    overrides: JSON.stringify(preset),
  }).catch(() => {});

  console.log(`[VocabMapper] Auto-configured ${preset.vertical} vocabulary for org ${orgId} from GBP category "${gbpCategory}"`);

  return preset;
}
