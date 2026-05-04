/**
 * Card G-foundation (May 4 2026, re-scoped) — Location scope helper.
 *
 * Two pure-with-DB functions that downstream services use to honor a
 * caller-supplied location scope. The helper resolves "which locations
 * does this query operate over?" once, so each service doesn't
 * reimplement the validation + ordering logic.
 *
 * Pattern:
 *   const scope = await getLocationScope(orgId, requestedScope);
 *   await db("table").where({ organization_id: orgId })
 *                    .whereIn("location_id", scope)
 *                    .select("...");
 *
 * Or for an aggregate (no scoping requested):
 *   const scope = await getLocationScope(orgId);  // all locations
 *   // batch query with location_id = ANY($scope) — single round trip
 */

import { db } from "../../database/connection";

export interface LocationRow {
  id: number;
  organization_id: number;
  name: string;
  is_primary: boolean | null;
}

export class InvalidLocationScopeError extends Error {
  invalidIds: number[];
  constructor(orgId: number, invalidIds: number[]) {
    super(
      `Location scope validation failed for org ${orgId}: locations [${invalidIds.join(", ")}] do not belong to this org`,
    );
    this.name = "InvalidLocationScopeError";
    this.invalidIds = invalidIds;
  }
}

/**
 * Resolve the scope for a query.
 *
 *   - requestedScope undefined / [] → return all location IDs for the org
 *   - requestedScope provided       → validate every ID belongs to the org;
 *                                     throw InvalidLocationScopeError on mismatch;
 *                                     otherwise return the scope unchanged
 */
export async function getLocationScope(
  orgId: number,
  requestedScope?: number[],
): Promise<number[]> {
  const allIds = await db("locations")
    .where({ organization_id: orgId })
    .select<{ id: number }[]>("id")
    .then((rows) => rows.map((r) => r.id));

  if (!requestedScope || requestedScope.length === 0) {
    return allIds;
  }

  const allowed = new Set(allIds);
  const invalid = requestedScope.filter((id) => !allowed.has(id));
  if (invalid.length > 0) {
    throw new InvalidLocationScopeError(orgId, invalid);
  }

  return requestedScope;
}

/**
 * Pure helper: arrange a set of location rows according to a numeric
 * display order. Locations not present in the order array are appended
 * alphabetically by name. Empty order ⇒ fully alphabetical. Extracted
 * so the ordering logic can be unit-tested without a DB.
 */
export function applyDisplayOrder(
  locations: LocationRow[],
  order: number[],
): LocationRow[] {
  if (order.length === 0) {
    return locations.slice().sort((a, b) => a.name.localeCompare(b.name));
  }
  const byId = new Map<number, LocationRow>();
  for (const l of locations) byId.set(l.id, l);

  const ordered: LocationRow[] = [];
  const seen = new Set<number>();
  for (const id of order) {
    const loc = byId.get(id);
    if (loc) {
      ordered.push(loc);
      seen.add(id);
    }
  }
  const rest = locations
    .filter((l) => !seen.has(l.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...ordered, ...rest];
}

/** Pure helper: validate a requested scope against the org's location ids. */
export function validateScopeIds(
  orgId: number,
  allOrgLocationIds: number[],
  requestedScope: number[],
): number[] {
  const allowed = new Set(allOrgLocationIds);
  const invalid = requestedScope.filter((id) => !allowed.has(id));
  if (invalid.length > 0) {
    throw new InvalidLocationScopeError(orgId, invalid);
  }
  return requestedScope;
}

/**
 * Return the org's locations in display order.
 *
 *   - If organizations.location_display_order is non-empty: return locations
 *     in that order, with any locations not in the array appended at the
 *     end alphabetically by name (so newly-added locations stay visible).
 *   - If empty (or null): return locations alphabetically by name.
 */
export async function getOrderedLocations(
  orgId: number,
): Promise<LocationRow[]> {
  const org = await db("organizations")
    .where({ id: orgId })
    .first<{ location_display_order: number[] | string | null }>(
      "location_display_order",
    );

  const locations = await db("locations")
    .where({ organization_id: orgId })
    .select<LocationRow[]>("id", "organization_id", "name", "is_primary");

  const order = parseOrderArray(org?.location_display_order);
  return applyDisplayOrder(locations, order);
}

export function parseOrderArray(raw: unknown): number[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((x): x is number => typeof x === "number");
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is number => typeof x === "number");
      }
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Persist a new location_display_order array for an org. Used by the
 * Card A drag-to-reorder UI (Dave-owned) and by the backfill script.
 */
export async function setLocationDisplayOrder(
  orgId: number,
  order: number[],
): Promise<void> {
  // Validate every id belongs to the org before persisting; surface
  // misuse early instead of letting bad ids land on the row.
  await getLocationScope(orgId, order);
  await db("organizations")
    .where({ id: orgId })
    .update({
      location_display_order: JSON.stringify(order),
      updated_at: new Date(),
    });
}
