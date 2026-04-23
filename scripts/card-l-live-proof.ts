/**
 * Card L live proof — exercises the DB-backed extension point end-to-end
 * against the real sandbox Postgres. Emits a machine-readable transcript that
 * the proof file embeds verbatim.
 */

import { db } from "../src/database/connection";
import {
  hydrateBenchmarkCache,
  getBenchmark,
  inferVertical,
} from "../src/services/economic/industryBenchmarks";
import { calculateImpact } from "../src/services/economic/economicCalc";

async function log(label: string, payload: unknown): Promise<void> {
  console.log(`\n### ${label}`);
  console.log("```json");
  console.log(JSON.stringify(payload, null, 2));
  console.log("```");
}

async function main(): Promise<void> {
  // (b) Verify the 7+1 seed rows are present.
  const rows = await db("industry_benchmarks_config")
    .select("vertical", "avg_case_value_usd", "avg_monthly_new_customers", "referral_dependency_pct", "source")
    .orderBy("vertical");
  await log("(b) industry_benchmarks_config — all seeded rows", rows);

  // Hydrate the in-memory cache from Postgres.
  await hydrateBenchmarkCache();

  // (c) Endodontics — benchmark hit from cache, drives calculateImpact.
  const endoBenchmark = getBenchmark("endodontics");
  await log("(c.1) getBenchmark('endodontics')", endoBenchmark);

  const endoImpact = calculateImpact(
    "site.qa_passed",
    { eventType: "site.qa_passed" },
    {
      id: 1,
      createdAt: new Date(Date.now() - 180 * 86400000),
      vertical: "Endodontist",
      hasCheckupData: true,
      hasGbpData: true,
      knownAverageCaseValueUsd: 1950,
      knownMonthlyNewCustomers: 55,
    }
  );
  await log("(c.2) calculateImpact for endodontist org with known org data", endoImpact);

  // (d) Unrecognized vertical emits behavioral_event vertical.unrecognized.
  const unknownSpecialty = "Mobile Pet Groomer";
  const inferred = inferVertical(unknownSpecialty);
  await log("(d.1) inferVertical('Mobile Pet Groomer')", { inferred });

  const priorEvents = await db("behavioral_events")
    .where({ event_type: "vertical.unrecognized" })
    .count("id as c")
    .first();

  const missImpact = calculateImpact(
    "site.published",
    { eventType: "site.published" },
    {
      id: 9001,
      createdAt: new Date(Date.now() - 200 * 86400000),
      vertical: unknownSpecialty,
      hasCheckupData: true,
      hasGbpData: true,
    }
  );
  await log("(d.2) calculateImpact for unknown vertical (data-gap expected)", missImpact);

  // Give the fire-and-forget event a moment to persist.
  await new Promise((resolve) => setTimeout(resolve, 500));

  const afterEvents = await db("behavioral_events")
    .where({ event_type: "vertical.unrecognized" })
    .orderBy("created_at", "desc")
    .limit(3);
  const afterCount = await db("behavioral_events")
    .where({ event_type: "vertical.unrecognized" })
    .count("id as c")
    .first();
  await log("(d.3) behavioral_events — vertical.unrecognized", {
    priorCount: Number(priorEvents?.c ?? 0),
    afterCount: Number(afterCount?.c ?? 0),
    recent: afterEvents.map((e: any) => ({
      id: e.id,
      event_type: e.event_type,
      org_id: e.org_id,
      properties: e.properties,
      created_at: e.created_at,
    })),
  });

  // (e) Insert a yoga_studio row. Rehydrate. calculateImpact returns real
  // dollar figures for a yoga_studio org — with no code change.
  await db("industry_benchmarks_config")
    .insert({
      vertical: "yoga_studio",
      avg_case_value_usd: 120,
      avg_monthly_new_customers: 60,
      referral_dependency_pct: 0.1,
      source: "Card L extension-point proof insert",
    })
    .onConflict("vertical")
    .merge();

  await hydrateBenchmarkCache();

  const yogaBenchmark = getBenchmark("yoga_studio");
  await log("(e.1) getBenchmark('yoga_studio') after DB insert + rehydrate", yogaBenchmark);

  const yogaImpact = calculateImpact(
    "site.published",
    { eventType: "site.published" },
    {
      id: 9002,
      createdAt: new Date(Date.now() - 200 * 86400000),
      vertical: "Yoga Studio",
      hasCheckupData: true,
      hasGbpData: true,
      knownAverageCaseValueUsd: 120,
      knownMonthlyNewCustomers: 60,
    }
  );
  await log("(e.2) calculateImpact for yoga_studio org — dollars via DB row", yogaImpact);

  // Cleanup: remove the proof row so the table stays at 8 rows for downstream.
  await db("industry_benchmarks_config").where({ vertical: "yoga_studio" }).del();
  await hydrateBenchmarkCache();

  await db.destroy();
}

main().catch((err) => {
  console.error("Proof script failed:", err);
  process.exit(1);
});
