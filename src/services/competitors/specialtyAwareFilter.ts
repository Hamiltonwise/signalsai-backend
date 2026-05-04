/**
 * Card D — Specialty-Aware Competitor Filter (May 4 2026).
 *
 * Two pure helpers, no DB. Composed by the discovery refresh path:
 *
 *   1. filterByApprovedSpecialty: takes raw discovery results plus the
 *      org's approved_adjacent_specialties list. Drops candidates whose
 *      GBP category does not substring-match any approved entry. Per
 *      Card D Done Gate troubleshooting note: case-insensitive substring
 *      match is the most-common-bug source — implemented carefully here.
 *
 *   2. mergeWithTrackedCompetitors: takes the previously-tracked set
 *      (organizations.tracked_competitors) and the freshly-filtered
 *      candidates. Returns a merged set with four state classifications:
 *        preserved              — existed before, still in approved set
 *        removed_gbp_disappeared — no longer in the discovery output
 *        removed_category_drift  — category no longer in approved set
 *        added                  — new candidate in approved set
 *
 * The merge produces a behavioral_event payload per Card D's four
 * approved event names. The caller writes them to behavioral_events.
 */

export interface DiscoveryCandidate {
  placeId: string;
  name: string;
  /** GBP-shaped category, e.g. "Endodontist", "Endodontist (medical practice)". */
  category: string;
  primaryType?: string;
}

export interface TrackedCompetitor {
  placeId: string;
  name: string;
  category?: string;
  primaryType?: string;
}

export interface FilterResult {
  kept: DiscoveryCandidate[];
  rejected: Array<{ candidate: DiscoveryCandidate; reason: string }>;
}

/**
 * Drop candidates whose category does not substring-match any approved
 * adjacent specialty. Empty approvedList passes everything through (the
 * card's default — backwards-compatible until a vertical is seeded).
 */
export function filterByApprovedSpecialty(
  candidates: DiscoveryCandidate[],
  approvedList: string[],
): FilterResult {
  if (!Array.isArray(approvedList) || approvedList.length === 0) {
    return { kept: candidates, rejected: [] };
  }
  const norm = approvedList
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.toLowerCase().trim())
    .filter((s) => s.length > 0);
  if (norm.length === 0) {
    return { kept: candidates, rejected: [] };
  }

  const kept: DiscoveryCandidate[] = [];
  const rejected: Array<{ candidate: DiscoveryCandidate; reason: string }> = [];

  for (const c of candidates) {
    const cat = (c.category || "").toLowerCase();
    const pt = (c.primaryType || "").toLowerCase();
    const matchedBy = norm.find(
      (n) => cat.includes(n) || pt.includes(n) || n.replace(/_/g, " ").includes(cat),
    );
    if (matchedBy) {
      kept.push(c);
    } else {
      rejected.push({
        candidate: c,
        reason: `category '${c.category}' does not match any approved specialty (${norm.join(", ")})`,
      });
    }
  }
  return { kept, rejected };
}

export interface MergeEvent {
  event_type:
    | "competitor_state_preserved"
    | "competitor_removed_gbp_disappeared"
    | "competitor_removed_category_drift"
    | "competitor_filtered_by_specialty"
    | "competitor_added";
  placeId: string;
  detail: Record<string, unknown>;
}

export interface MergeResult {
  merged: TrackedCompetitor[];
  events: MergeEvent[];
}

/**
 * Merge a fresh-discovery set with the previously-tracked set, applying
 * Card D's state-preservation rules. Output is the new tracked set
 * (caller persists to organizations.tracked_competitors).
 *
 * Inputs:
 *   tracked      — previously-tracked competitor set
 *   filtered     — fresh discovery output AFTER filterByApprovedSpecialty
 *   discoveryRaw — fresh discovery output BEFORE the approved-specialty
 *                  filter (so we can detect "still on Google but drifted
 *                  out of the approved set" → category_drift case)
 *   approvedList — the same list passed to filterByApprovedSpecialty
 */
export function mergeWithTrackedCompetitors(
  tracked: TrackedCompetitor[],
  filtered: DiscoveryCandidate[],
  discoveryRaw: DiscoveryCandidate[],
  approvedList: string[],
): MergeResult {
  const events: MergeEvent[] = [];

  const filteredById = new Map(filtered.map((c) => [c.placeId, c]));
  const rawById = new Map(discoveryRaw.map((c) => [c.placeId, c]));
  const trackedById = new Map(tracked.map((c) => [c.placeId, c]));

  const merged: TrackedCompetitor[] = [];
  const seenIds = new Set<string>();

  // Pass 1: walk tracked set, classify each.
  for (const t of tracked) {
    const stillFiltered = filteredById.get(t.placeId);
    const stillRaw = rawById.get(t.placeId);

    if (stillFiltered) {
      // Present in discovery + still passes approved-specialty filter
      events.push({
        event_type: "competitor_state_preserved",
        placeId: t.placeId,
        detail: { name: t.name },
      });
      merged.push({
        placeId: stillFiltered.placeId,
        name: stillFiltered.name,
        category: stillFiltered.category,
        primaryType: stillFiltered.primaryType,
      });
      seenIds.add(t.placeId);
      continue;
    }
    if (stillRaw) {
      // Still in discovery output but dropped by approved-specialty filter
      events.push({
        event_type: "competitor_removed_category_drift",
        placeId: t.placeId,
        detail: {
          name: t.name,
          previous_category: t.category ?? null,
          new_category: stillRaw.category,
          approved_list: approvedList,
        },
      });
      // intentionally NOT added to merged — drift removes
      continue;
    }
    // Not in discovery output at all
    events.push({
      event_type: "competitor_removed_gbp_disappeared",
      placeId: t.placeId,
      detail: { name: t.name, previous_category: t.category ?? null },
    });
  }

  // Pass 2: walk filtered (fresh approved candidates) and add anything
  // not already in merged. These are the "added" cases.
  for (const c of filtered) {
    if (seenIds.has(c.placeId)) continue;
    if (trackedById.has(c.placeId)) continue; // already handled above (preserved)
    merged.push({
      placeId: c.placeId,
      name: c.name,
      category: c.category,
      primaryType: c.primaryType,
    });
    events.push({
      event_type: "competitor_added",
      placeId: c.placeId,
      detail: { name: c.name, category: c.category },
    });
  }

  return { merged, events };
}
