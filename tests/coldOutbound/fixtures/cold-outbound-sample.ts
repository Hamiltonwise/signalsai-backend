/**
 * Cold Outbound prospect fixtures for the dry-run skeleton.
 *
 * These are NOT real prospects. Names, practices, GBP signals, and
 * referral data are synthetic. They exist to exercise the tier
 * assignment logic + gate logic across the cases the spec calls out:
 *
 *   - 2 endo Tier A (PBHS + referral data, expected GP referral wedge)
 *   - 2 ortho Tier A (PBHS + low GBP, expected auto-build wedge)
 *   - 2 endo Tier B (PBHS only, expected Practice Analyzer wedge)
 *   - 2 ortho Tier B (TDO only, expected Practice Analyzer wedge)
 *   - 2 endo Tier C (no signals, expected free analyzer link)
 *   - 1 endo Tier A fallback (PBHS + no referral data → falls to Tier B)
 *   - 1 prospect with conflicting/missing data (test skip path)
 */

import type { ColdOutboundProspect } from "../../../src/services/agents/coldOutbound.schema";

export const SAMPLE_COLD_OUTBOUND_PROSPECTS: ColdOutboundProspect[] = [
  // ── 2 endo Tier A: PBHS + GP referral data ────────────────────────
  {
    prospectId: "co-001",
    name: "Dr. Anjali Reyes",
    practiceName: "Pacific Crest Endodontics",
    city: "Bend",
    state: "OR",
    vertical: "endodontist",
    pmsAgencyFooter: "PBHS",
    gbpCompletenessScore: 78,
    hasReferralData: true,
    referralData: {
      gpName: "Marcus Whitfield",
      gpPracticeName: "Whitfield Family Dental",
      timeframe: "in February 2026",
      estimatedAnnualValue: 38000,
    },
    gbpReviewCount: 142,
    gbpRating: 4.7,
    practiceFacts: [
      "only endodontist in Bend with same-day emergency appointments listed on Google",
      "two-doctor practice, GentleWave technology",
    ],
  },
  {
    prospectId: "co-002",
    name: "Dr. Priya Shah",
    practiceName: "Northstar Endodontic Specialists",
    city: "Minneapolis",
    state: "MN",
    vertical: "endodontist",
    pmsAgencyFooter: "PBHS",
    gbpCompletenessScore: 82,
    hasReferralData: true,
    referralData: {
      gpName: "Lena Park",
      gpPracticeName: "Park Lake Dental Group",
      timeframe: "for 90 days starting January 2026",
      estimatedAnnualValue: 52000,
    },
    gbpReviewCount: 211,
    gbpRating: 4.8,
    practiceFacts: [
      "American Board of Endodontics diplomate",
      "three-operatory practice with one rotating associate",
    ],
  },

  // ── 2 ortho Tier A: PBHS or TDO + low GBP completeness ────────────
  {
    prospectId: "co-003",
    name: "Dr. Carlos Mendez",
    practiceName: "Mendez Orthodontics",
    city: "Tucson",
    state: "AZ",
    vertical: "orthodontist",
    pmsAgencyFooter: "TDO",
    gbpCompletenessScore: 42,
    gbpReviewCount: 18,
    gbpRating: 4.2,
    autoBuildPreview: {
      previewUrl: "https://preview.alloro.com/p/co-003",
      builtAt: "2026-05-01T15:00:00Z",
    },
    practiceFacts: [
      "single-doctor practice, Invisalign Diamond provider",
      "no current website (Yelp + Google only)",
    ],
  },
  {
    prospectId: "co-004",
    name: "Dr. Naomi Patel",
    practiceName: "Patel Smile Studio",
    city: "Cary",
    state: "NC",
    vertical: "orthodontist",
    pmsAgencyFooter: "PBHS",
    gbpCompletenessScore: 55,
    gbpReviewCount: 64,
    gbpRating: 4.6,
    autoBuildPreview: {
      previewUrl: "https://preview.alloro.com/p/co-004",
      builtAt: "2026-05-01T15:02:00Z",
    },
    practiceFacts: [
      "two-location practice, Cary plus Apex",
      "American Board of Orthodontics certified",
    ],
  },

  // ── 2 endo Tier B: PBHS only, expected analyzer wedge ─────────────
  {
    prospectId: "co-005",
    name: "Dr. Marcus Whitfield",
    practiceName: "Crescent City Endo",
    city: "New Orleans",
    state: "LA",
    vertical: "endodontist",
    pmsAgencyFooter: "PBHS",
    gbpCompletenessScore: 88,
    hasReferralData: false,
    analyzerFindings: {
      rankPosition: 4,
      specialty: "endodontist",
      competitorName: "River District Endodontics",
      competitorReviewDelta: 47,
    },
    gbpReviewCount: 92,
    gbpRating: 4.5,
    practiceFacts: [
      "two-doctor practice, microscope-equipped",
    ],
  },
  {
    prospectId: "co-006",
    name: "Dr. Sasha Liu",
    practiceName: "Liu Endodontic Center",
    city: "Sacramento",
    state: "CA",
    vertical: "endodontist",
    pmsAgencyFooter: "PBHS",
    gbpCompletenessScore: 91,
    hasReferralData: false,
    analyzerFindings: {
      rankPosition: 6,
      specialty: "endodontist",
      competitorName: "Capital Endo Specialists",
      competitorReviewDelta: 62,
    },
    gbpReviewCount: 134,
    gbpRating: 4.8,
    practiceFacts: [
      "single-doctor practice, ABE certified",
      "GentleWave provider",
    ],
  },

  // ── 2 ortho Tier B: TDO only, high GBP, analyzer wedge ────────────
  {
    prospectId: "co-007",
    name: "Dr. Hannah Brooks",
    practiceName: "Brooks Orthodontics",
    city: "Asheville",
    state: "NC",
    vertical: "orthodontist",
    pmsAgencyFooter: "TDO",
    gbpCompletenessScore: 87,
    analyzerFindings: {
      rankPosition: 3,
      specialty: "orthodontist",
      competitorName: "Mountain View Orthodontics",
      competitorReviewDelta: 31,
    },
    gbpReviewCount: 188,
    gbpRating: 4.9,
    practiceFacts: [
      "Diamond Plus Invisalign provider",
      "two operatories, single-doctor practice",
    ],
  },
  {
    prospectId: "co-008",
    name: "Dr. Eli Goldberg",
    practiceName: "Goldberg Smiles",
    city: "Brookline",
    state: "MA",
    vertical: "orthodontist",
    pmsAgencyFooter: "TDO",
    gbpCompletenessScore: 79,
    analyzerFindings: {
      rankPosition: 5,
      specialty: "orthodontist",
      competitorName: "Boston Smile Co",
      competitorReviewDelta: 88,
    },
    gbpReviewCount: 76,
    gbpRating: 4.7,
    practiceFacts: [
      "American Board of Orthodontics certified",
      "single-location, single-doctor practice",
    ],
  },

  // ── 2 endo Tier C: no agency footer, no referral data ────────────
  {
    prospectId: "co-009",
    name: "Dr. Felix Tran",
    practiceName: "Tran Endodontics",
    city: "Austin",
    state: "TX",
    vertical: "endodontist",
    pmsAgencyFooter: null,
    gbpCompletenessScore: 71,
    gbpReviewCount: 58,
    gbpRating: 4.6,
    practiceFacts: [
      "single-doctor practice",
    ],
  },
  {
    prospectId: "co-010",
    name: "Dr. Marina Ortiz",
    practiceName: "Ortiz Endo & Implants",
    city: "Boise",
    state: "ID",
    vertical: "endodontist",
    pmsAgencyFooter: null,
    gbpCompletenessScore: 64,
    gbpReviewCount: 41,
    gbpRating: 4.4,
    practiceFacts: [
      "two-doctor practice, microsurgery focus",
    ],
  },

  // ── 1 endo Tier A fallback: PBHS but no referral data → Tier B ───
  {
    prospectId: "co-011",
    name: "Dr. James Park",
    practiceName: "Park Endodontic Group",
    city: "Seattle",
    state: "WA",
    vertical: "endodontist",
    pmsAgencyFooter: "PBHS",
    gbpCompletenessScore: 80,
    hasReferralData: false,
    // No analyzerFindings either — tests the Tier B with-stub-call path.
    gbpReviewCount: 167,
    gbpRating: 4.7,
    practiceFacts: [
      "ABE diplomate",
      "single-location practice",
    ],
  },

  // ── 1 conflicting/missing data: tests the skip path ──────────────
  {
    prospectId: "co-012",
    name: "Dr. Empty",
    // No practice, no city, no GBP signal, no facts — minimum personalization fails.
    vertical: "endodontist",
    pmsAgencyFooter: null,
  },
];
