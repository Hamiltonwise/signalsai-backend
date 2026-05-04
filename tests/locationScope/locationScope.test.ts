/**
 * Card G-foundation — locationScope pure helper tests (May 4 2026).
 *
 * Pure logic only (no DB). Matches the repo's vitest pattern: integration
 * with the live DB is exercised via scripts/cardg-apply-migrations.ts and
 * src/scripts/backfillLocationDisplayOrder.ts under ts-node, which load
 * .env and reach the sandbox DB. The pure helpers here cover the
 * ordering and validation logic that the DB-touching wrappers delegate
 * to.
 */

import { describe, expect, test } from "vitest";
import {
  applyDisplayOrder,
  validateScopeIds,
  parseOrderArray,
  InvalidLocationScopeError,
  type LocationRow,
} from "../../src/services/locationScope/locationScope";

const loc = (id: number, name: string, is_primary = false): LocationRow => ({
  id,
  organization_id: 1,
  name,
  is_primary,
});

describe("applyDisplayOrder", () => {
  test("returns alphabetical when order array is empty", () => {
    const locs = [loc(3, "Charlie"), loc(1, "Alpha"), loc(2, "Bravo")];
    const out = applyDisplayOrder(locs, []);
    expect(out.map((l) => l.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  test("respects user-supplied display order", () => {
    const locs = [loc(3, "Charlie"), loc(1, "Alpha"), loc(2, "Bravo")];
    const out = applyDisplayOrder(locs, [3, 1, 2]);
    expect(out.map((l) => l.id)).toEqual([3, 1, 2]);
  });

  test("appends locations missing from the order array alphabetically", () => {
    const locs = [loc(3, "Charlie"), loc(1, "Alpha"), loc(2, "Bravo")];
    const out = applyDisplayOrder(locs, [3]);
    // [3], then [Alpha, Bravo] alphabetical = [3, 1, 2]
    expect(out.map((l) => l.id)).toEqual([3, 1, 2]);
  });

  test("ignores ids in the order array that don't match any location row", () => {
    // A location was deleted but its id lingers in location_display_order.
    // The helper must skip the dead id and still return the live locations.
    const locs = [loc(1, "Alpha"), loc(2, "Bravo")];
    const out = applyDisplayOrder(locs, [9999, 2, 1]);
    expect(out.map((l) => l.id)).toEqual([2, 1]);
  });

  test("idempotent: applying twice with the same order is stable", () => {
    const locs = [loc(3, "Charlie"), loc(1, "Alpha"), loc(2, "Bravo")];
    const a = applyDisplayOrder(locs, [2, 3, 1]);
    const b = applyDisplayOrder(a, [2, 3, 1]);
    expect(b.map((l) => l.id)).toEqual(a.map((l) => l.id));
  });
});

describe("validateScopeIds", () => {
  test("returns the requested subset when every id is valid", () => {
    const out = validateScopeIds(42, [1, 2, 3], [1, 3]);
    expect(out).toEqual([1, 3]);
  });

  test("throws InvalidLocationScopeError when an id is foreign", () => {
    expect(() => validateScopeIds(42, [1, 2, 3], [1, 99])).toThrowError(
      InvalidLocationScopeError,
    );
  });

  test("InvalidLocationScopeError carries the offending ids", () => {
    try {
      validateScopeIds(42, [1, 2, 3], [9, 10]);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidLocationScopeError);
      expect((err as InvalidLocationScopeError).invalidIds.sort()).toEqual(
        [9, 10].sort(),
      );
    }
  });
});

describe("parseOrderArray", () => {
  test("returns [] for null/undefined", () => {
    expect(parseOrderArray(null)).toEqual([]);
    expect(parseOrderArray(undefined)).toEqual([]);
  });

  test("returns [] for malformed JSON string", () => {
    expect(parseOrderArray("not json {")).toEqual([]);
  });

  test("parses a JSONB-style number[] passed straight through", () => {
    expect(parseOrderArray([1, 2, 3])).toEqual([1, 2, 3]);
  });

  test("parses a JSON-encoded number[] string", () => {
    expect(parseOrderArray("[4, 5, 6]")).toEqual([4, 5, 6]);
  });

  test("filters non-number entries (defensive for older schema rows)", () => {
    expect(parseOrderArray([1, "two", 3, null])).toEqual([1, 3]);
  });
});
