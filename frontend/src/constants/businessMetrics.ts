/**
 * Business Metrics Constants -- Frontend Single Source of Truth
 *
 * Mirrors src/services/businessMetrics.ts on the backend.
 * When updating benchmarks, update BOTH files.
 *
 * For MRR and health data, use the useBusinessMetrics() hook instead
 * which fetches pre-computed values from the backend.
 */

export const REVIEW_VOLUME_BENCHMARKS: Record<string, number> = {
  endodontist: 40,
  orthodontist: 100,
  dentist: 100,
  "general dentist": 100,
  "pediatric dentist": 80,
  periodontist: 40,
  prosthodontist: 30,
  "oral surgeon": 50,
  barber: 150,
  "med spa": 200,
  medspa: 200,
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
  "garden designer": 20,
  "landscape designer": 20,
  "auto repair": 60,
  "financial advisor": 20,
  "real estate agent": 40,
};
