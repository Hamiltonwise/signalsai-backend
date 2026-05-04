/**
 * Card G-foundation — backfillLocationDisplayOrder (May 4 2026).
 *
 * For every organization with at least one location row, populate
 * location_display_order with a deterministic seed:
 *
 *   1. Primary location first (is_primary = true)
 *   2. All remaining locations alphabetically by name
 *
 * Skips orgs that already have a non-empty location_display_order so the
 * script is rerunnable. Logs per-org transitions so we have an audit
 * trail of what the live data looked like at backfill time.
 */

import { db } from "../database/connection";

interface Loc {
  id: number;
  name: string;
  is_primary: boolean | null;
}

function parseOrderArray(raw: unknown): number[] {
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

async function main(): Promise<void> {
  const orgs = await db("organizations")
    .select<{ id: number; name: string; location_display_order: unknown }[]>(
      "id",
      "name",
      "location_display_order",
    )
    .orderBy("id", "asc");

  let inspected = 0;
  let skippedAlreadySeeded = 0;
  let skippedNoLocations = 0;
  let written = 0;

  for (const org of orgs) {
    inspected += 1;
    const existing = parseOrderArray(org.location_display_order);
    if (existing.length > 0) {
      skippedAlreadySeeded += 1;
      continue;
    }

    const locs = await db("locations")
      .where({ organization_id: org.id })
      .select<Loc[]>("id", "name", "is_primary");

    if (locs.length === 0) {
      skippedNoLocations += 1;
      continue;
    }

    const primary = locs
      .filter((l) => l.is_primary)
      .sort((a, b) => a.name.localeCompare(b.name));
    const rest = locs
      .filter((l) => !l.is_primary)
      .sort((a, b) => a.name.localeCompare(b.name));
    const order = [...primary, ...rest].map((l) => l.id);

    await db("organizations")
      .where({ id: org.id })
      .update({
        location_display_order: JSON.stringify(order),
        updated_at: new Date(),
      });

    written += 1;
    console.log(
      `  org ${org.id} (${org.name}): seeded order = [${order.join(", ")}] across ${locs.length} location(s)`,
    );
  }

  console.log(`\n[cardg-backfill] DONE`);
  console.log(`  inspected:               ${inspected}`);
  console.log(`  skipped (already set):   ${skippedAlreadySeeded}`);
  console.log(`  skipped (no locations):  ${skippedNoLocations}`);
  console.log(`  written:                 ${written}`);
}

main()
  .catch((err) => {
    console.error("[cardg-backfill] FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
