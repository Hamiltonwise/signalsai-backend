/**
 * Card D — retroactive refresh runner (May 4 2026).
 *
 * Triggers applySpecialtyAwareRefresh for the named target practices so
 * their organizations.tracked_competitors fields are populated (or
 * cleaned) per the new vocab-aware filter + state preservation rules
 * without waiting for the next weekly cycle.
 *
 * Targets per Run 2 Task 0:
 *   - 1Endo (org 39 + the Falls Church split entity 47 if present)
 *   - Caswell (org 25)
 *   - Garrison (org 5)
 *
 * The runner reads each org's existing tracked_competitors as the
 * "discovery raw" input. This means: any tracked competitor that was
 * NOT a same-specialty match per the new approved list gets removed
 * (state preservation classifies as category_drift). Any tracked
 * competitor that IS a same-specialty match stays preserved. No new
 * candidates are pulled — that requires a fresh discovery cycle, which
 * the wired weeklyScoreRecalc will do on its next run.
 *
 * For surfaces that need NEW discovery now (e.g. Saif's Gainesville
 * needs Manassas Endodontics back as a NEW candidate), the runner can
 * optionally call discoverCompetitorsWithFallback first and pass that
 * output. Default: tracked-only refresh (drift cleanup).
 */

import { db } from "../src/database/connection";
import { applySpecialtyAwareRefresh } from "../src/services/competitors/applySpecialtyAwareRefresh";

const TARGET_ORGS = [
  { id: 5, label: "Garrison Orthodontics" },
  { id: 25, label: "Caswell Orthodontics" },
  { id: 39, label: "1Endo (One Endodontics)" },
  { id: 47, label: "1Endo Falls Church split (if present)" },
];

interface TrackedRow {
  placeId: string;
  name: string;
  category?: string;
  primaryType?: string;
}

function parseTracked(raw: unknown): TrackedRow[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as TrackedRow[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as TrackedRow[];
    } catch {
      return [];
    }
  }
  return [];
}

async function main(): Promise<void> {
  for (const target of TARGET_ORGS) {
    const org = await db("organizations")
      .where({ id: target.id })
      .first("id", "name", "tracked_competitors");

    if (!org) {
      console.log(`\n=== ${target.label} (org ${target.id}) ===`);
      console.log(`  org row not found — skipping`);
      continue;
    }

    const tracked = parseTracked(org.tracked_competitors);
    console.log(`\n=== ${org.name} (org ${target.id}) ===`);
    console.log(`  pre-refresh tracked_competitors: ${tracked.length} rows`);

    // Use existing tracked set as both raw and filtered input — the
    // refresh applies the new vocab filter on top, classifies any drift
    // as category_drift removal, and preserves anything still passing
    // the filter. New candidate discovery happens on the next
    // weeklyScoreRecalc cycle (now wired to call this same service).
    const candidates = tracked.map((t) => ({
      placeId: t.placeId,
      name: t.name,
      category: t.category ?? "",
      primaryType: t.primaryType ?? "",
    }));

    const result = await applySpecialtyAwareRefresh({
      orgId: target.id,
      discoveryRaw: candidates,
      preFiltered: candidates,
    });

    console.log(`  approvedList: ${JSON.stringify(result.approvedList)}`);
    console.log(`  filtered.kept: ${result.filteredKept.length}`);
    console.log(`  filtered.rejected: ${result.filteredRejected}`);
    console.log(`  trackedAfter: ${result.trackedAfter.length}`);
    const eventCounts: Record<string, number> = {};
    for (const ev of result.events) {
      eventCounts[ev.event_type] = (eventCounts[ev.event_type] || 0) + 1;
    }
    console.log(`  event counts: ${JSON.stringify(eventCounts)}`);
    if (result.trackedAfter.length > 0) {
      console.log(
        `  sample after: ${result.trackedAfter
          .slice(0, 5)
          .map((c) => `${c.name} (${c.category ?? "?"})`)
          .join(", ")}`,
      );
    }
  }
}

main()
  .catch((err) => {
    console.error("[cardd-retroactive] FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
