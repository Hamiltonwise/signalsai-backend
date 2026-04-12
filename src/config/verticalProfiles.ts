/**
 * Vertical Intelligence Profiles -- Single Source of Truth
 *
 * Every vertical Alloro supports is defined here. One object per vertical.
 * All consumers (checkup scoring, competitor discovery, rankings intelligence,
 * clarity scoring, frontend benchmarks) import from this file.
 *
 * To add a new vertical: add one entry to VERTICAL_PROFILES. That's it.
 * The vocabulary_defaults DB table provides runtime overrides per-org.
 *
 * Data sources:
 *   avgCaseValue/conversionRate: ADA, ASPS, AmSpa, Clio, NAR, AVMA, AICPA (2025)
 *   reviewBenchmark: Median review count for top-20 in each category (2025 Places data)
 *   competitiveRadiusMiles: Typical service area for each vertical
 *   googlePlaceTypes: Google Places API primaryType values (snake_case)
 */

// ---- Types ----------------------------------------------------------------

export interface VerticalProfile {
  /** Human-readable vertical name */
  displayName: string;
  /** Google Places API primaryType values for competitor discovery */
  googlePlaceTypes: string[];
  /** Median review count benchmark for this vertical */
  reviewBenchmark: number;
  /** Typical competitive radius in miles */
  competitiveRadiusMiles: number;
  /** Average revenue per new customer/case/visit */
  avgCaseValue: number;
  /** Estimated conversion rate from review-to-new-customer */
  conversionRate: number;
  /** Intelligence mode: how this vertical acquires customers */
  intelligenceMode: "referral_based" | "direct_acquisition" | "hybrid";
  /** Vocabulary terms */
  vocab: {
    patientTerm: string;
    competitorTerm: string;
    locationTerm: string;
    providerTerm: string;
    caseType: string;
    referralTerm: string;
    primaryMetric: string;
  };
  /** Broader category for fallback search when <5 same-specialty results */
  broadeningCategory?: string;
}

// ---- Profiles -------------------------------------------------------------

export const VERTICAL_PROFILES: Record<string, VerticalProfile> = {
  // =========================================================================
  // DENTAL
  // =========================================================================
  general_dentistry: {
    displayName: "General Dentistry",
    googlePlaceTypes: ["dentist", "dental_clinic"],
    reviewBenchmark: 100,
    competitiveRadiusMiles: 10,
    avgCaseValue: 275,
    conversionRate: 0.03,
    intelligenceMode: "hybrid",
    vocab: {
      patientTerm: "patient",
      competitorTerm: "dentist",
      locationTerm: "practice",
      providerTerm: "dentist",
      caseType: "new patient",
      referralTerm: "patient referral",
      primaryMetric: "new patient acquisition",
    },
  },
  endodontics: {
    displayName: "Endodontics",
    googlePlaceTypes: ["endodontist"],
    reviewBenchmark: 40,
    competitiveRadiusMiles: 25,
    avgCaseValue: 1400,
    conversionRate: 0.02,
    intelligenceMode: "referral_based",
    vocab: {
      patientTerm: "patient",
      competitorTerm: "endodontist",
      locationTerm: "practice",
      providerTerm: "doctor",
      caseType: "root canal case",
      referralTerm: "referring GP",
      primaryMetric: "referral rate",
    },
    broadeningCategory: "dentist",
  },
  orthodontics: {
    displayName: "Orthodontics",
    googlePlaceTypes: ["orthodontist"],
    reviewBenchmark: 100,
    competitiveRadiusMiles: 15,
    avgCaseValue: 5500,
    conversionRate: 0.015,
    intelligenceMode: "referral_based",
    vocab: {
      patientTerm: "patient",
      competitorTerm: "orthodontist",
      locationTerm: "practice",
      providerTerm: "doctor",
      caseType: "new start",
      referralTerm: "referring dentist",
      primaryMetric: "new start rate",
    },
    broadeningCategory: "dentist",
  },
  periodontics: {
    displayName: "Periodontics",
    googlePlaceTypes: ["periodontist"],
    reviewBenchmark: 40,
    competitiveRadiusMiles: 25,
    avgCaseValue: 1200,
    conversionRate: 0.02,
    intelligenceMode: "referral_based",
    vocab: {
      patientTerm: "patient",
      competitorTerm: "periodontist",
      locationTerm: "practice",
      providerTerm: "doctor",
      caseType: "new case",
      referralTerm: "referring GP",
      primaryMetric: "referral rate",
    },
    broadeningCategory: "dentist",
  },
  oral_surgery: {
    displayName: "Oral Surgery",
    googlePlaceTypes: ["oral_surgeon"],
    reviewBenchmark: 50,
    competitiveRadiusMiles: 25,
    avgCaseValue: 2000,
    conversionRate: 0.015,
    intelligenceMode: "referral_based",
    vocab: {
      patientTerm: "patient",
      competitorTerm: "oral surgeon",
      locationTerm: "practice",
      providerTerm: "surgeon",
      caseType: "surgical case",
      referralTerm: "referring GP",
      primaryMetric: "referral rate",
    },
    broadeningCategory: "dentist",
  },
  pediatric_dentistry: {
    displayName: "Pediatric Dentistry",
    googlePlaceTypes: ["pediatric_dentist"],
    reviewBenchmark: 80,
    competitiveRadiusMiles: 10,
    avgCaseValue: 250,
    conversionRate: 0.03,
    intelligenceMode: "hybrid",
    vocab: {
      patientTerm: "patient",
      competitorTerm: "pediatric dentist",
      locationTerm: "practice",
      providerTerm: "dentist",
      caseType: "new patient",
      referralTerm: "parent referral",
      primaryMetric: "new patient acquisition",
    },
    broadeningCategory: "dentist",
  },
  prosthodontics: {
    displayName: "Prosthodontics",
    googlePlaceTypes: ["prosthodontist"],
    reviewBenchmark: 30,
    competitiveRadiusMiles: 75,
    avgCaseValue: 4000,
    conversionRate: 0.01,
    intelligenceMode: "referral_based",
    vocab: {
      patientTerm: "patient",
      competitorTerm: "prosthodontist",
      locationTerm: "practice",
      providerTerm: "doctor",
      caseType: "restoration case",
      referralTerm: "referring GP",
      primaryMetric: "referral rate",
    },
    broadeningCategory: "dentist",
  },

  // =========================================================================
  // HEALTHCARE (NON-DENTAL)
  // =========================================================================
  chiropractic: {
    displayName: "Chiropractic",
    googlePlaceTypes: ["chiropractor"],
    reviewBenchmark: 80,
    competitiveRadiusMiles: 5,
    avgCaseValue: 65,
    conversionRate: 0.05,
    intelligenceMode: "hybrid",
    vocab: {
      patientTerm: "patient",
      competitorTerm: "chiropractor",
      locationTerm: "practice",
      providerTerm: "doctor",
      caseType: "new case",
      referralTerm: "referring provider",
      primaryMetric: "new case rate",
    },
    broadeningCategory: "doctor",
  },
  physical_therapy: {
    displayName: "Physical Therapy",
    googlePlaceTypes: ["physical_therapist", "physiotherapist"],
    reviewBenchmark: 40,
    competitiveRadiusMiles: 10,
    avgCaseValue: 106,
    conversionRate: 0.03,
    intelligenceMode: "referral_based",
    vocab: {
      patientTerm: "patient",
      competitorTerm: "physical therapist",
      locationTerm: "clinic",
      providerTerm: "therapist",
      caseType: "new case",
      referralTerm: "referring physician",
      primaryMetric: "new case rate",
    },
    broadeningCategory: "doctor",
  },
  optometry: {
    displayName: "Optometry",
    googlePlaceTypes: ["optometrist", "optician", "eye_care_center"],
    reviewBenchmark: 60,
    competitiveRadiusMiles: 10,
    avgCaseValue: 475,
    conversionRate: 0.025,
    intelligenceMode: "hybrid",
    vocab: {
      patientTerm: "patient",
      competitorTerm: "optometrist",
      locationTerm: "office",
      providerTerm: "doctor",
      caseType: "new exam",
      referralTerm: "patient referral",
      primaryMetric: "new exam rate",
    },
    broadeningCategory: "eye doctor",
  },
  veterinary: {
    displayName: "Veterinary",
    googlePlaceTypes: ["veterinary_care", "animal_hospital"],
    reviewBenchmark: 100,
    competitiveRadiusMiles: 10,
    avgCaseValue: 275,
    conversionRate: 0.03,
    intelligenceMode: "hybrid",
    vocab: {
      patientTerm: "client",
      competitorTerm: "veterinarian",
      locationTerm: "clinic",
      providerTerm: "veterinarian",
      caseType: "new patient",
      referralTerm: "referral source",
      primaryMetric: "new patient rate",
    },
  },
  medspa: {
    displayName: "Med Spa",
    googlePlaceTypes: ["medical_spa", "spa", "dermatologist"],
    reviewBenchmark: 200,
    competitiveRadiusMiles: 15,
    avgCaseValue: 500,
    conversionRate: 0.025,
    intelligenceMode: "hybrid",
    vocab: {
      patientTerm: "client",
      competitorTerm: "med spa",
      locationTerm: "studio",
      providerTerm: "provider",
      caseType: "new treatment booking",
      referralTerm: "client referral",
      primaryMetric: "new client bookings",
    },
    broadeningCategory: "dermatologist",
  },
  plastic_surgery: {
    displayName: "Plastic Surgery",
    googlePlaceTypes: ["plastic_surgeon", "cosmetic_surgeon"],
    reviewBenchmark: 100,
    competitiveRadiusMiles: 40,
    avgCaseValue: 8000,
    conversionRate: 0.01,
    intelligenceMode: "hybrid",
    vocab: {
      patientTerm: "patient",
      competitorTerm: "surgeon",
      locationTerm: "practice",
      providerTerm: "surgeon",
      caseType: "consultation",
      referralTerm: "patient referral",
      primaryMetric: "consultation rate",
    },
    broadeningCategory: "cosmetic doctor",
  },

  // =========================================================================
  // PROFESSIONAL SERVICES
  // =========================================================================
  legal: {
    displayName: "Legal",
    googlePlaceTypes: ["lawyer", "law_firm", "attorney"],
    reviewBenchmark: 30,
    competitiveRadiusMiles: 20,
    avgCaseValue: 3000,
    conversionRate: 0.02,
    intelligenceMode: "hybrid",
    vocab: {
      patientTerm: "client",
      competitorTerm: "firm",
      locationTerm: "firm",
      providerTerm: "attorney",
      caseType: "new matter",
      referralTerm: "referral source",
      primaryMetric: "new matter rate",
    },
  },
  accounting: {
    displayName: "Accounting / CPA",
    googlePlaceTypes: ["accounting", "tax_preparation_service", "financial_planner"],
    reviewBenchmark: 20,
    competitiveRadiusMiles: 20,
    avgCaseValue: 2000,
    conversionRate: 0.02,
    intelligenceMode: "referral_based",
    vocab: {
      patientTerm: "client",
      competitorTerm: "firm",
      locationTerm: "firm",
      providerTerm: "accountant",
      caseType: "new engagement",
      referralTerm: "referral partner",
      primaryMetric: "new engagement rate",
    },
    broadeningCategory: "financial services",
  },
  financial_advisor: {
    displayName: "Financial Advisory",
    googlePlaceTypes: ["financial_planner", "financial_advisor", "investment_service"],
    reviewBenchmark: 20,
    competitiveRadiusMiles: 25,
    avgCaseValue: 5000,
    conversionRate: 0.015,
    intelligenceMode: "referral_based",
    vocab: {
      patientTerm: "client",
      competitorTerm: "advisor",
      locationTerm: "office",
      providerTerm: "advisor",
      caseType: "new account",
      referralTerm: "referral source",
      primaryMetric: "new account rate",
    },
    broadeningCategory: "financial services",
  },
  real_estate: {
    displayName: "Real Estate",
    googlePlaceTypes: ["real_estate_agency", "real_estate_agent"],
    reviewBenchmark: 40,
    competitiveRadiusMiles: 20,
    avgCaseValue: 8000,
    conversionRate: 0.01,
    intelligenceMode: "referral_based",
    vocab: {
      patientTerm: "client",
      competitorTerm: "agent",
      locationTerm: "brokerage",
      providerTerm: "agent",
      caseType: "new listing",
      referralTerm: "referral partner",
      primaryMetric: "listings per quarter",
    },
  },

  // =========================================================================
  // PERSONAL SERVICES
  // =========================================================================
  barber: {
    displayName: "Barber",
    googlePlaceTypes: ["barber_shop", "beauty_salon", "hair_salon"],
    reviewBenchmark: 150,
    competitiveRadiusMiles: 5,
    avgCaseValue: 40,
    conversionRate: 0.08,
    intelligenceMode: "direct_acquisition",
    vocab: {
      patientTerm: "client",
      competitorTerm: "barber",
      locationTerm: "shop",
      providerTerm: "barber",
      caseType: "new client visit",
      referralTerm: "word-of-mouth recommendation",
      primaryMetric: "new client acquisition",
    },
  },
  hair_salon: {
    displayName: "Hair Salon",
    googlePlaceTypes: ["beauty_salon", "hair_salon", "hair_care"],
    reviewBenchmark: 150,
    competitiveRadiusMiles: 10,
    avgCaseValue: 75,
    conversionRate: 0.06,
    intelligenceMode: "direct_acquisition",
    vocab: {
      patientTerm: "client",
      competitorTerm: "salon",
      locationTerm: "salon",
      providerTerm: "stylist",
      caseType: "new client visit",
      referralTerm: "word-of-mouth recommendation",
      primaryMetric: "new client acquisition",
    },
  },
  fitness: {
    displayName: "Fitness / Gym",
    googlePlaceTypes: ["gym", "fitness_center", "personal_trainer"],
    reviewBenchmark: 100,
    competitiveRadiusMiles: 10,
    avgCaseValue: 80,
    conversionRate: 0.05,
    intelligenceMode: "direct_acquisition",
    vocab: {
      patientTerm: "member",
      competitorTerm: "gym",
      locationTerm: "gym",
      providerTerm: "trainer",
      caseType: "new membership",
      referralTerm: "member referral",
      primaryMetric: "new member signups",
    },
  },

  // =========================================================================
  // HOME / TRADE SERVICES
  // =========================================================================
  home_services: {
    displayName: "Home Services",
    googlePlaceTypes: ["plumber", "electrician", "hvac_contractor", "roofing_contractor", "contractor", "locksmith"],
    reviewBenchmark: 50,
    competitiveRadiusMiles: 15,
    avgCaseValue: 350,
    conversionRate: 0.04,
    intelligenceMode: "hybrid",
    vocab: {
      patientTerm: "customer",
      competitorTerm: "contractor",
      locationTerm: "business",
      providerTerm: "technician",
      caseType: "new service call",
      referralTerm: "referral partner",
      primaryMetric: "jobs booked per week",
    },
    broadeningCategory: "contractor",
  },
  automotive: {
    displayName: "Auto Repair",
    googlePlaceTypes: ["auto_repair", "mechanic", "car_repair", "auto_body_shop"],
    reviewBenchmark: 60,
    competitiveRadiusMiles: 10,
    avgCaseValue: 400,
    conversionRate: 0.03,
    intelligenceMode: "hybrid",
    vocab: {
      patientTerm: "customer",
      competitorTerm: "shop",
      locationTerm: "shop",
      providerTerm: "mechanic",
      caseType: "new service ticket",
      referralTerm: "referral partner",
      primaryMetric: "jobs completed per week",
    },
  },

  // =========================================================================
  // FOOD & HOSPITALITY
  // =========================================================================
  food_service: {
    displayName: "Restaurant / Cafe",
    googlePlaceTypes: ["restaurant", "cafe", "bakery", "coffee_shop"],
    reviewBenchmark: 200,
    competitiveRadiusMiles: 5,
    avgCaseValue: 30,
    conversionRate: 0.10,
    intelligenceMode: "direct_acquisition",
    vocab: {
      patientTerm: "customer",
      competitorTerm: "restaurant",
      locationTerm: "restaurant",
      providerTerm: "owner",
      caseType: "new customer visit",
      referralTerm: "word-of-mouth",
      primaryMetric: "weekly covers",
    },
  },
};

// ---- Lookup Helpers -------------------------------------------------------

/** Alias map: common user input -> canonical vertical key */
const VERTICAL_ALIASES: Record<string, string> = {
  // Dental
  dentist: "general_dentistry",
  "general dentist": "general_dentistry",
  general: "general_dentistry",
  endodontist: "endodontics",
  orthodontist: "orthodontics",
  periodontist: "periodontics",
  "oral surgeon": "oral_surgery",
  "pediatric dentist": "pediatric_dentistry",
  pediatric: "pediatric_dentistry",
  prosthodontist: "prosthodontics",
  // Healthcare
  chiropractor: "chiropractic",
  "physical therapist": "physical_therapy",
  optometrist: "optometry",
  veterinarian: "veterinary",
  vet: "veterinary",
  "med spa": "medspa",
  dermatologist: "medspa",
  "plastic surgeon": "plastic_surgery",
  "cosmetic surgeon": "plastic_surgery",
  // Professional
  attorney: "legal",
  lawyer: "legal",
  accountant: "accounting",
  cpa: "accounting",
  realtor: "real_estate",
  "real estate agent": "real_estate",
  // Personal
  "barber shop": "barber",
  salon: "hair_salon",
  "hair stylist": "hair_salon",
  gym: "fitness",
  "personal trainer": "fitness",
  // Home
  plumber: "home_services",
  electrician: "home_services",
  hvac: "home_services",
  roofer: "home_services",
  contractor: "home_services",
  landscaper: "home_services",
  mechanic: "automotive",
  "auto repair": "automotive",
  // Food
  restaurant: "food_service",
  cafe: "food_service",
  bakery: "food_service",
  "coffee shop": "food_service",
};

/**
 * Resolve a user-supplied specialty string to a canonical vertical key.
 * Returns the key itself if it's already canonical, or the alias mapping.
 * Falls back to the original string lowercased if no match.
 */
export function resolveVertical(input: string): string {
  const lower = input.toLowerCase().trim();
  if (VERTICAL_PROFILES[lower]) return lower;
  return VERTICAL_ALIASES[lower] || lower;
}

/**
 * Get a vertical profile by any specialty input (canonical key or alias).
 * Returns null if the vertical is unknown.
 */
export function getVerticalProfile(input: string): VerticalProfile | null {
  const key = resolveVertical(input);
  return VERTICAL_PROFILES[key] || null;
}

/**
 * Get avgCaseValue for a specialty. Falls back to $200 universal default.
 */
export function getAvgCaseValue(specialty: string): number {
  return getVerticalProfile(specialty)?.avgCaseValue ?? 200;
}

/**
 * Get conversionRate for a specialty. Falls back to 0.03 universal default.
 */
export function getConversionRate(specialty: string): number {
  return getVerticalProfile(specialty)?.conversionRate ?? 0.03;
}

/**
 * Get review volume benchmark for a specialty. Falls back to 50.
 */
export function getReviewBenchmark(specialty: string): number {
  return getVerticalProfile(specialty)?.reviewBenchmark ?? 50;
}

/**
 * Get competitive radius in miles. Falls back to 15.
 */
export function getCompetitiveRadius(specialty: string): number {
  return getVerticalProfile(specialty)?.competitiveRadiusMiles ?? 15;
}

/**
 * Get Google Places types for competitor discovery.
 */
export function getGooglePlaceTypes(specialty: string): string[] {
  return getVerticalProfile(specialty)?.googlePlaceTypes ?? [];
}

/**
 * Get broadening category for fallback search.
 */
export function getBroadeningCategory(specialty: string): string | null {
  return getVerticalProfile(specialty)?.broadeningCategory ?? null;
}

/**
 * Build REVIEW_VOLUME_BENCHMARKS-compatible map from profiles.
 * Used by businessMetrics.ts for backward compatibility.
 */
export function buildReviewBenchmarksMap(): Record<string, number> {
  const map: Record<string, number> = {};
  for (const [key, profile] of Object.entries(VERTICAL_PROFILES)) {
    map[key] = profile.reviewBenchmark;
    // Also add alias entries for backward compatibility
    for (const [alias, canonical] of Object.entries(VERTICAL_ALIASES)) {
      if (canonical === key) {
        map[alias] = profile.reviewBenchmark;
      }
    }
  }
  return map;
}

/**
 * Build COMPETITIVE_RADII_MILES-compatible map from profiles.
 * Used by businessMetrics.ts for backward compatibility.
 */
export function buildCompetitiveRadiiMap(): Record<string, number> {
  const map: Record<string, number> = {};
  for (const [key, profile] of Object.entries(VERTICAL_PROFILES)) {
    map[key] = profile.competitiveRadiusMiles;
    for (const [alias, canonical] of Object.entries(VERTICAL_ALIASES)) {
      if (canonical === key) {
        map[alias] = profile.competitiveRadiusMiles;
      }
    }
  }
  return map;
}

/**
 * Build specialtyEconomics-compatible map from profiles.
 * Used by checkup.ts for backward compatibility.
 */
export function buildEconomicsMap(): Record<string, { avgCaseValue: number; conversionRate: number }> {
  const map: Record<string, { avgCaseValue: number; conversionRate: number }> = {};
  for (const [key, profile] of Object.entries(VERTICAL_PROFILES)) {
    map[key] = { avgCaseValue: profile.avgCaseValue, conversionRate: profile.conversionRate };
    for (const [alias, canonical] of Object.entries(VERTICAL_ALIASES)) {
      if (canonical === key) {
        map[alias] = { avgCaseValue: profile.avgCaseValue, conversionRate: profile.conversionRate };
      }
    }
  }
  return map;
}

/** List all canonical vertical keys */
export function getAllVerticalKeys(): string[] {
  return Object.keys(VERTICAL_PROFILES);
}
