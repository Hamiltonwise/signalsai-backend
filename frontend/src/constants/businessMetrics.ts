/**
 * Business Metrics Constants -- Frontend Single Source of Truth
 *
 * These values mirror the vertical profiles defined in src/config/verticalProfiles.ts.
 * When adding a new vertical, update verticalProfiles.ts (backend) and this file (frontend).
 *
 * For MRR and health data, use the useBusinessMetrics() hook instead
 * which fetches pre-computed values from the backend.
 */

export const REVIEW_VOLUME_BENCHMARKS: Record<string, number> = {
  // Dental
  general_dentistry: 100,
  endodontics: 40,
  orthodontics: 100,
  periodontics: 40,
  oral_surgery: 50,
  pediatric_dentistry: 80,
  prosthodontics: 30,
  // Healthcare
  chiropractic: 80,
  physical_therapy: 40,
  optometry: 60,
  veterinary: 100,
  medspa: 200,
  plastic_surgery: 100,
  // Professional
  legal: 30,
  accounting: 20,
  financial_advisor: 20,
  real_estate: 40,
  // Personal
  barber: 150,
  hair_salon: 150,
  fitness: 100,
  // Home/Trade
  home_services: 50,
  automotive: 60,
  // Food
  food_service: 200,
  // Aliases for backward compatibility
  endodontist: 40,
  orthodontist: 100,
  dentist: 100,
  "general dentist": 100,
  "pediatric dentist": 80,
  periodontist: 40,
  prosthodontist: 30,
  "oral surgeon": 50,
  "med spa": 200,
  "plastic surgeon": 100,
  chiropractor: 80,
  optometrist: 60,
  veterinarian: 100,
  "physical therapist": 40,
  attorney: 30,
  lawyer: 30,
  accountant: 20,
  cpa: 20,
  "hair salon": 150,
  plumber: 50,
  electrician: 50,
  hvac: 50,
  roofer: 30,
  landscaper: 40,
  "auto repair": 60,
  "financial advisor": 20,
  "real estate agent": 40,
};
