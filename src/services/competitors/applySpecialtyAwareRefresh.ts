/**
 * Card D — apply specialty-aware filter + state preservation to an
 * org's tracked competitor set (May 4 2026).
 *
 * This wraps the pure helpers in specialtyAwareFilter.ts with the live
 * DB reads / writes:
 *   1. Read approved_adjacent_specialties via getApprovedAdjacentSpecialties
 *   2. Read tracked_competitors from organizations
 *   3. Caller passes in fresh discovery output (raw + filtered) — kept
 *      stateless so the existing discovery pipeline can be wired in
 *      without coupling here
 *   4. filterByApprovedSpecialty + mergeWithTrackedCompetitors
 *   5. UPDATE organizations.tracked_competitors
 *   6. Emit behavioral_events for every classification
 *
 * Returns the merged set so the caller can echo it back to the user.
 */

import { db } from "../../database/connection";
import { getApprovedAdjacentSpecialties } from "../vocabulary/vocabLoader";
import { getLocationScope } from "../locationScope/locationScope";
import {
  filterByApprovedSpecialty,
  mergeWithTrackedCompetitors,
  type DiscoveryCandidate,
  type TrackedCompetitor,
} from "./specialtyAwareFilter";

export interface ApplyRefreshInput {
  orgId: number;
  /** Fresh discovery output before any filter (so drift detection works). */
  discoveryRaw: DiscoveryCandidate[];
  /** Optional: caller may pre-filter via legacy filterBySpecialty; otherwise we pass the raw set through both filters. */
  preFiltered?: DiscoveryCandidate[];
  /**
   * Card G-foundation: optional location scope. Validated against the org's
   * locations. tracked_competitors is currently a column on the
   * organizations row (org-level), so the scope is validated for misuse
   * detection but does not change which competitors are stored. A
   * follow-up card moves tracked_competitors to a per-location surface;
   * once that lands, this parameter selects which location's tracked set
   * the refresh updates.
   */
  locationScope?: number[];
}

export interface ApplyRefreshResult {
  orgId: number;
  approvedList: string[];
  trackedBefore: TrackedCompetitor[];
  filteredKept: DiscoveryCandidate[];
  filteredRejected: number;
  trackedAfter: TrackedCompetitor[];
  events: Array<{ event_type: string; placeId: string; detail: Record<string, unknown> }>;
}

export async function applySpecialtyAwareRefresh(
  input: ApplyRefreshInput,
): Promise<ApplyRefreshResult> {
  const { orgId, discoveryRaw, preFiltered, locationScope } = input;

  // Card G-foundation: validate locationScope early. Throws
  // InvalidLocationScopeError if any id doesn't belong to the org.
  if (locationScope !== undefined) {
    await getLocationScope(orgId, locationScope);
  }

  const approvedList = await getApprovedAdjacentSpecialties(orgId);

  // 1. Pre-filter (Card D's vocab-aware layer)
  const filterInput = preFiltered ?? discoveryRaw;
  const filterResult = filterByApprovedSpecialty(filterInput, approvedList);

  // Emit a competitor_filtered_by_specialty event per rejection. Best-
  // effort writes; never block the refresh on a failed insert.
  for (const r of filterResult.rejected) {
    await db("behavioral_events")
      .insert({
        id: db.raw("gen_random_uuid()"),
        event_type: "competitor_filtered_by_specialty",
        org_id: orgId,
        properties: db.raw("?::jsonb", [
          JSON.stringify({
            place_id: r.candidate.placeId,
            name: r.candidate.name,
            category: r.candidate.category,
            reason: r.reason,
            approved_list: approvedList,
          }),
        ]),
        created_at: db.fn.now(),
      })
      .catch(() => {
        /* best effort */
      });
  }

  // 2. Read current tracked set
  const orgRow = await db("organizations").where({ id: orgId }).first("tracked_competitors");
  const trackedBefore: TrackedCompetitor[] = parseTracked(orgRow?.tracked_competitors);

  // 3. Merge with state preservation
  const merge = mergeWithTrackedCompetitors(
    trackedBefore,
    filterResult.kept,
    discoveryRaw,
    approvedList,
  );

  // 4. Persist merged set + emit per-event behavioral_events
  await db("organizations")
    .where({ id: orgId })
    .update({ tracked_competitors: JSON.stringify(merge.merged) });

  for (const ev of merge.events) {
    await db("behavioral_events")
      .insert({
        id: db.raw("gen_random_uuid()"),
        event_type: ev.event_type,
        org_id: orgId,
        properties: db.raw("?::jsonb", [
          JSON.stringify({
            place_id: ev.placeId,
            ...ev.detail,
          }),
        ]),
        created_at: db.fn.now(),
      })
      .catch(() => {
        /* best effort */
      });
  }

  return {
    orgId,
    approvedList,
    trackedBefore,
    filteredKept: filterResult.kept,
    filteredRejected: filterResult.rejected.length,
    trackedAfter: merge.merged,
    events: merge.events.map((e) => ({
      event_type: e.event_type,
      placeId: e.placeId,
      detail: e.detail,
    })),
  };
}

function parseTracked(raw: unknown): TrackedCompetitor[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((x): x is TrackedCompetitor => !!x && typeof x === "object" && typeof (x as any).placeId === "string");
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is TrackedCompetitor => !!x && typeof x === "object" && typeof (x as any).placeId === "string");
      }
    } catch {
      return [];
    }
  }
  return [];
}
