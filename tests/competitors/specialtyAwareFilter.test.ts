/**
 * Card D — specialty-aware filter + state-preservation merge tests.
 * Pure helpers, no DB.
 */

import { describe, test, expect } from "vitest";
import {
  filterByApprovedSpecialty,
  mergeWithTrackedCompetitors,
  type DiscoveryCandidate,
  type TrackedCompetitor,
} from "../../src/services/competitors/specialtyAwareFilter";

const ENDO_APPROVED = ["endodontist"];
const ORTHO_APPROVED = ["orthodontist"];
const ORAL_SURGERY_APPROVED = ["oral_surgeon", "maxillofacial_surgeon"];

const cand = (overrides: Partial<DiscoveryCandidate> = {}): DiscoveryCandidate => ({
  placeId: overrides.placeId ?? "place-1",
  name: overrides.name ?? "Test Practice",
  category: overrides.category ?? "Endodontist",
  primaryType: overrides.primaryType ?? "endodontist",
});

describe("filterByApprovedSpecialty", () => {
  test("Saif's gainesville scenario: keeps Manassas Endodontics, drops general dentists", () => {
    const candidates: DiscoveryCandidate[] = [
      cand({
        placeId: "manassas",
        name: "Manassas Endodontics",
        category: "Endodontist",
        primaryType: "endodontist",
      }),
      cand({
        placeId: "general-1",
        name: "Gainesville Family Dentistry",
        category: "Dentist",
        primaryType: "dentist",
      }),
      cand({
        placeId: "ortho-1",
        name: "Northern VA Orthodontics",
        category: "Orthodontist",
        primaryType: "orthodontist",
      }),
    ];
    const r = filterByApprovedSpecialty(candidates, ENDO_APPROVED);
    expect(r.kept.map((c) => c.placeId)).toEqual(["manassas"]);
    expect(r.rejected.map((x) => x.candidate.placeId).sort()).toEqual(
      ["general-1", "ortho-1"].sort(),
    );
  });

  test("case-insensitive substring match (most common bug per Done Gate)", () => {
    const c = cand({ category: "Endodontist (Medical Practice)", primaryType: "DENTIST" });
    const r = filterByApprovedSpecialty([c], ENDO_APPROVED);
    expect(r.kept.length).toBe(1);
  });

  test("empty approvedList passes everything (backwards-compat default)", () => {
    const r = filterByApprovedSpecialty([cand({ category: "anything" })], []);
    expect(r.kept.length).toBe(1);
    expect(r.rejected.length).toBe(0);
  });

  test("oral surgery accepts both oral_surgeon and maxillofacial_surgeon shapes", () => {
    const a = cand({ placeId: "a", category: "Oral Surgeon", primaryType: "oral_surgeon" });
    const b = cand({
      placeId: "b",
      category: "Oral and Maxillofacial Surgeon",
      primaryType: "maxillofacial_surgeon",
    });
    const r = filterByApprovedSpecialty([a, b], ORAL_SURGERY_APPROVED);
    expect(r.kept.length).toBe(2);
  });

  test("Garrison case: orthodontics filter drops general dentists and endodontists", () => {
    const candidates: DiscoveryCandidate[] = [
      cand({ placeId: "ortho-a", category: "Orthodontist", primaryType: "orthodontist" }),
      cand({ placeId: "endo-x", category: "Endodontist", primaryType: "endodontist" }),
      cand({ placeId: "general-y", category: "Dentist", primaryType: "dentist" }),
    ];
    const r = filterByApprovedSpecialty(candidates, ORTHO_APPROVED);
    expect(r.kept.map((c) => c.placeId)).toEqual(["ortho-a"]);
  });
});

describe("mergeWithTrackedCompetitors", () => {
  const T = (id: string, name: string, category = "Endodontist"): TrackedCompetitor => ({
    placeId: id,
    name,
    category,
    primaryType: "endodontist",
  });
  const D = (id: string, name: string, category = "Endodontist"): DiscoveryCandidate => ({
    placeId: id,
    name,
    category,
    primaryType: "endodontist",
  });

  test("preserves a competitor still present in filtered output", () => {
    const tracked = [T("a", "Manassas Endo")];
    const filtered = [D("a", "Manassas Endo")];
    const r = mergeWithTrackedCompetitors(tracked, filtered, filtered, ENDO_APPROVED);
    expect(r.merged.map((m) => m.placeId)).toEqual(["a"]);
    expect(r.events.find((e) => e.event_type === "competitor_state_preserved")).toBeTruthy();
  });

  test("drops a competitor whose GBP disappeared (not in raw discovery)", () => {
    const tracked = [T("a", "Manassas Endo")];
    const filtered: DiscoveryCandidate[] = [];
    const raw: DiscoveryCandidate[] = []; // not in raw either
    const r = mergeWithTrackedCompetitors(tracked, filtered, raw, ENDO_APPROVED);
    expect(r.merged.length).toBe(0);
    expect(r.events.find((e) => e.event_type === "competitor_removed_gbp_disappeared")).toBeTruthy();
  });

  test("drops a competitor that drifted out of the approved category set", () => {
    const tracked = [T("a", "Manassas Endo", "Endodontist")];
    const filtered: DiscoveryCandidate[] = []; // not in filtered (drifted out)
    const raw = [D("a", "Manassas Endo", "Dentist")]; // still in raw discovery
    const r = mergeWithTrackedCompetitors(tracked, filtered, raw, ENDO_APPROVED);
    expect(r.merged.length).toBe(0);
    const drift = r.events.find((e) => e.event_type === "competitor_removed_category_drift");
    expect(drift).toBeTruthy();
    expect((drift?.detail as any).new_category).toBe("Dentist");
  });

  test("adds a brand-new candidate that appears in filtered set for the first time", () => {
    const tracked: TrackedCompetitor[] = [];
    const filtered = [D("new", "New Endo Practice")];
    const r = mergeWithTrackedCompetitors(tracked, filtered, filtered, ENDO_APPROVED);
    expect(r.merged.map((m) => m.placeId)).toEqual(["new"]);
    expect(r.events.find((e) => e.event_type === "competitor_added")).toBeTruthy();
  });

  test("idempotent: running merge twice produces identical output", () => {
    const tracked = [T("a", "Existing"), T("b", "Also Existing")];
    const filtered = [D("a", "Existing"), D("b", "Also Existing")];
    const r1 = mergeWithTrackedCompetitors(tracked, filtered, filtered, ENDO_APPROVED);
    const r2 = mergeWithTrackedCompetitors(r1.merged, filtered, filtered, ENDO_APPROVED);
    expect(r2.merged.map((m) => m.placeId).sort()).toEqual(r1.merged.map((m) => m.placeId).sort());
  });

  test("Saif's Gainesville: Manassas Endodontics returns when discovery brings it back", () => {
    // Round 1: discovery missed Manassas (e.g. transient API issue)
    let tracked: TrackedCompetitor[] = [T("manassas", "Manassas Endodontics")];
    let filtered: DiscoveryCandidate[] = []; // missed
    let raw: DiscoveryCandidate[] = []; // missed in raw too
    let r = mergeWithTrackedCompetitors(tracked, filtered, raw, ENDO_APPROVED);
    // Card D semantic: GBP-disappeared removes it from tracked
    expect(r.merged.find((c) => c.placeId === "manassas")).toBeUndefined();

    // Round 2: discovery brings it back (correct behavior)
    tracked = r.merged;
    filtered = [D("manassas", "Manassas Endodontics")];
    raw = filtered;
    r = mergeWithTrackedCompetitors(tracked, filtered, raw, ENDO_APPROVED);
    expect(r.merged.find((c) => c.placeId === "manassas")).toBeTruthy();
    expect(r.events.find((e) => e.event_type === "competitor_added")).toBeTruthy();
  });
});
