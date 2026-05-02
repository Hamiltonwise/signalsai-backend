/**
 * AAE attendee fixtures for the dry-run skeleton.
 *
 * These are NOT real attendees. Names, practices, and notes are
 * synthetic. They exist to exercise the gate logic across the edge
 * cases the spec calls out:
 *   - 3 with rich booth notes (multiple specific points)
 *   - 3 with thin booth notes (one short note)
 *   - 2 with no booth notes (test the skip path; one with practice
 *     data still passes minimum, the other has nothing and should skip)
 *   - 1 with name + practice only (minimum viable personalization)
 *   - 1 with conflicting / contradictory data (test error handling)
 */

import type { AaeAttendee } from "../../../src/services/agents/aaeNurture.schema";

export const SAMPLE_AAE_ATTENDEES: AaeAttendee[] = [
  // ── Rich booth notes (3) ─────────────────────────────────────────
  {
    attendeeId: "fixture-001",
    name: "Dr. Anjali Reyes",
    practiceName: "Pacific Crest Endodontics",
    city: "Bend",
    state: "OR",
    segment: "professional_us",
    conversationDate: "2026-04-16",
    vertical: "endodontics",
    boothNotes:
      "asked about same-day emergency slot routing and how Garrison Endo cut their no-show rate from 18% to 6%",
    practiceFacts: [
      "only endodontist in Bend with same-day emergency appointments listed on Google",
      "two-doctor practice, one associate hired in 2025",
    ],
  },
  {
    attendeeId: "fixture-002",
    name: "Dr. Marcus Whitfield",
    practiceName: "Crescent City Endo",
    city: "New Orleans",
    state: "LA",
    segment: "professional_us",
    conversationDate: "2026-04-17",
    vertical: "endodontics",
    boothNotes:
      "frustrated that GP referral patterns shifted after a corporate group opened nearby; asked how Coastal handled the same shift",
    practiceFacts: [
      "lost 3 referring GPs in Q1 2026 to Heartland-affiliated network",
      "patient reviews mention long wait times despite low volume",
    ],
  },
  {
    attendeeId: "fixture-003",
    name: "Dr. Priya Shah",
    practiceName: "Northstar Endodontic Specialists",
    city: "Minneapolis",
    state: "MN",
    segment: "professional_us",
    conversationDate: "2026-04-15",
    vertical: "endodontics",
    boothNotes:
      "wanted to see how the Practice Analyzer scored a multi-location practice and whether it could surface site-by-site differences",
    practiceFacts: [
      "three locations, single Google Business Profile shared across all of them",
      "uses Open Dental, considering switching to Curve",
    ],
  },

  // ── Thin booth notes (3) ─────────────────────────────────────────
  {
    attendeeId: "fixture-004",
    name: "Dr. Tom Bauer",
    practiceName: "Bauer Endodontics",
    city: "Tulsa",
    state: "OK",
    segment: "professional_us",
    conversationDate: "2026-04-16",
    vertical: "endodontics",
    boothNotes: "wanted the demo link",
  },
  {
    attendeeId: "fixture-005",
    name: "Dr. Renee Okonkwo",
    practiceName: "Bayview Endo",
    city: "San Diego",
    state: "CA",
    segment: "professional_us",
    conversationDate: "2026-04-17",
    vertical: "endodontics",
    boothNotes: "skeptical",
  },
  {
    attendeeId: "fixture-006",
    name: "Dr. Henry Park",
    practiceName: "Park Endodontic Group",
    city: "Seattle",
    state: "WA",
    segment: "professional_us",
    conversationDate: "2026-04-18",
    vertical: "endodontics",
    boothNotes: "follow up next week",
  },

  // ── No booth notes (2) ───────────────────────────────────────────
  {
    // has practice + city → minimum personalization met → should produce a draft
    attendeeId: "fixture-007",
    name: "Dr. Lisa Tran",
    practiceName: "Tran Family Endodontics",
    city: "Houston",
    state: "TX",
    segment: "professional_us",
    conversationDate: "2026-04-15",
    vertical: "endodontics",
  },
  {
    // truly empty → should skip (no_personalization_data)
    attendeeId: "fixture-008",
    name: "Dr. James Holden",
    segment: "professional_us",
    conversationDate: "2026-04-16",
    vertical: "endodontics",
  },

  // ── Name + practice only (minimum viable) ────────────────────────
  {
    attendeeId: "fixture-009",
    name: "Dr. Ada Nwosu",
    practiceName: "Lakeshore Endodontic Center",
    segment: "professional_us",
    conversationDate: "2026-04-17",
    vertical: "endodontics",
  },

  // ── Conflicting / contradictory data ─────────────────────────────
  {
    // city says "Phoenix, AZ" but state says "NV" — generator/template
    // must not crash; agent should still produce a draft using whichever
    // signal is consistent (booth notes here are clear).
    attendeeId: "fixture-010",
    name: "Dr. Samuel Brooks",
    practiceName: "Desert Endodontic Partners",
    city: "Phoenix",
    state: "NV",
    segment: "professional_us",
    conversationDate: "2026-04-18",
    vertical: "endodontics",
    boothNotes:
      "asked whether the Practice Analyzer flags duplicate locations when a practice has merged listings",
    practiceFacts: [
      "merged two legacy practices in 2024",
      "currently shows two GBP entries with overlapping reviews",
    ],
  },
];
