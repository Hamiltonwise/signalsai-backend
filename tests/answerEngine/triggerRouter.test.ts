/**
 * Pure-logic tests for the Trigger Router. These tests exercise the
 * routing matrix and the idempotency hash in isolation. The full
 * runTriggerRouter() loop is exercised in the smoke test (live DB).
 */

import { describe, test, expect } from "vitest";
import {
  decideRoute,
  computeSignalHash,
  canonicalizeSignalData,
} from "../../src/services/answerEngine/triggerRouter";
import type { SignalType } from "../../src/services/answerEngine/types";

describe("decideRoute (signal_type → routedTo matrix)", () => {
  const cases: Array<{ signal: SignalType; expected: string }> = [
    { signal: "gsc_rank_delta", expected: "research_agent.regeneration" },
    { signal: "gsc_new_query", expected: "research_agent.regeneration" },
    { signal: "gsc_impression_spike", expected: "research_agent.regeneration" },
    { signal: "competitor_top10", expected: "research_agent.competitive_recalibration" },
    { signal: "aeo_citation_lost", expected: "research_agent.aeo_recovery" },
    { signal: "aeo_citation_competitor", expected: "research_agent.aeo_recovery" },
    { signal: "aeo_citation_new", expected: "research_agent.aeo_recovery" },
    { signal: "gbp_review_new", expected: "copy_agent.testimonial_integration" },
    { signal: "gbp_rating_shift", expected: "gbp_agent.content_sync" },
  ];

  for (const c of cases) {
    test(`${c.signal} → ${c.expected}`, () => {
      expect(decideRoute(c.signal).routedTo).toBe(c.expected);
    });
  }

  test("every routing decision includes a non-empty reason", () => {
    for (const c of cases) {
      const r = decideRoute(c.signal);
      expect(r.reason.length).toBeGreaterThan(0);
    }
  });
});

describe("idempotency: canonicalizeSignalData", () => {
  test("key order does not change canonical form", () => {
    const a = { query: "q", impressionsAfter: 200, rankBefore: 8 };
    const b = { rankBefore: 8, query: "q", impressionsAfter: 200 };
    expect(canonicalizeSignalData(a)).toBe(canonicalizeSignalData(b));
  });

  test("nested objects are canonicalized recursively", () => {
    const a = { window: { end: "2026-05-01", start: "2026-04-25" }, query: "q" };
    const b = { query: "q", window: { start: "2026-04-25", end: "2026-05-01" } };
    expect(canonicalizeSignalData(a)).toBe(canonicalizeSignalData(b));
  });

  test("arrays preserve order", () => {
    const a = { tags: ["b", "a"] };
    const b = { tags: ["a", "b"] };
    expect(canonicalizeSignalData(a)).not.toBe(canonicalizeSignalData(b));
  });

  test("null / undefined are stable", () => {
    expect(canonicalizeSignalData(null)).toBe("null");
    expect(canonicalizeSignalData(undefined)).toBe("null");
  });
});

describe("computeSignalHash", () => {
  test("same inputs produce same hash", () => {
    const data = { query: "emergency endodontist", rankBefore: 9, rankAfter: 4 };
    const h1 = computeSignalHash(5, "gsc_rank_delta", data);
    const h2 = computeSignalHash(5, "gsc_rank_delta", { ...data });
    expect(h1).toBe(h2);
  });

  test("different practice_id changes hash", () => {
    const data = { query: "q" };
    expect(computeSignalHash(1, "gsc_rank_delta", data)).not.toBe(
      computeSignalHash(2, "gsc_rank_delta", data),
    );
  });

  test("different signal_type changes hash", () => {
    const data = { query: "q" };
    expect(computeSignalHash(1, "gsc_rank_delta", data)).not.toBe(
      computeSignalHash(1, "gsc_impression_spike", data),
    );
  });

  test("hash is hex 64 chars (sha256)", () => {
    const h = computeSignalHash(1, "gsc_rank_delta", { query: "q" });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  test("nested-key reorder produces same hash", () => {
    const a = { window: { end: "2026-05-01", start: "2026-04-25" }, query: "q" };
    const b = { query: "q", window: { start: "2026-04-25", end: "2026-05-01" } };
    expect(computeSignalHash(5, "gsc_rank_delta", a)).toBe(
      computeSignalHash(5, "gsc_rank_delta", b),
    );
  });
});
