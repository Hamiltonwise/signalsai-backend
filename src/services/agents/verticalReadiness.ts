/**
 * Vertical Readiness Scout Agent -- Execution Service
 *
 * Runs monthly (1st Sunday 6 PM PT).
 * Queries behavioral_events for checkup submissions by specialty/category.
 * Identifies which verticals have enough signal to expand into.
 * Calculates readiness score per vertical based on: checkup volume,
 * conversion rate, and vocabulary coverage.
 *
 * Writes "growth.vertical_readiness" event with scores.
 *
 * Data-driven (SQL queries only). No AI calls.
 */

import { db } from "../../database/connection";

// -- Types ------------------------------------------------------------------

interface VerticalScore {
  vertical: string;
  priority: number;
  thresholdsMet: number;
  thresholds: {
    t1_search_demand: boolean;
    t2_organic_inbound: boolean;
    t3_competitive_vacuum: boolean;
    t4_config_readiness: boolean;
    t5_content_coverage: boolean;
  };
  details: {
    checkupCount30d: number;
    conversionRate: number;
    vocabConfigExists: boolean;
    contentPagesIndexed: number;
  };
  recommendation: string;
}

interface VerticalReadinessReport {
  scores: VerticalScore[];
  deploymentReady: string[];
  nearReady: string[];
  scannedAt: string;
}

// -- Constants --------------------------------------------------------------

const VERTICAL_QUEUE: { vertical: string; priority: number }[] = [
  { vertical: "orthodontics", priority: 1 },
  { vertical: "chiropractic", priority: 2 },
  { vertical: "physical_therapy", priority: 3 },
  { vertical: "optometry", priority: 4 },
  { vertical: "veterinary", priority: 5 },
  { vertical: "legal", priority: 6 },
  { vertical: "accounting", priority: 7 },
  { vertical: "financial_advisor", priority: 8 },
];

const ORGANIC_INBOUND_THRESHOLD = 3; // 3+ checkup submissions in 30 days
const CONTENT_PAGES_THRESHOLD = 5; // 5+ AEO pages indexed

// -- Core -------------------------------------------------------------------

/**
 * Run the monthly vertical readiness scan.
 */
export async function runVerticalReadinessScan(): Promise<VerticalReadinessReport> {
  const scores: VerticalScore[] = [];

  for (const { vertical, priority } of VERTICAL_QUEUE) {
    const score = await scoreVertical(vertical, priority);
    scores.push(score);
  }

  // Sort by thresholds met (descending), then by priority (ascending)
  scores.sort((a, b) => {
    if (b.thresholdsMet !== a.thresholdsMet) return b.thresholdsMet - a.thresholdsMet;
    return a.priority - b.priority;
  });

  const deploymentReady = scores
    .filter((s) => s.thresholdsMet >= 5)
    .map((s) => s.vertical);

  const nearReady = scores
    .filter((s) => s.thresholdsMet === 4)
    .map((s) => s.vertical);

  const report: VerticalReadinessReport = {
    scores,
    deploymentReady,
    nearReady,
    scannedAt: new Date().toISOString(),
  };

  // Write the readiness event
  await writeReadinessEvent(report);

  // Auto-create dream_team_tasks for 5/5 verticals
  for (const vertical of deploymentReady) {
    await createDeploymentTask(vertical, scores.find((s) => s.vertical === vertical)!);
  }

  console.log(
    `[VerticalReadiness] Scan complete: ${deploymentReady.length} deployment-ready, ${nearReady.length} near-ready.`
  );

  return report;
}

// -- Scoring ----------------------------------------------------------------

async function scoreVertical(
  vertical: string,
  priority: number
): Promise<VerticalScore> {
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  // T2: Organic Inbound (most important signal)
  const checkupCount30d = await countCheckupsByVertical(vertical, thirtyDaysAgo);
  const t2 = checkupCount30d >= ORGANIC_INBOUND_THRESHOLD;

  // Conversion rate: account creations from this vertical / checkup starts
  const conversionRate = await computeVerticalConversionRate(vertical, thirtyDaysAgo);

  // T4: Config Readiness (vocabulary_configs table)
  const vocabConfigExists = await checkVocabConfig(vertical);
  const t4 = vocabConfigExists;

  // T5: Content Coverage (AEO pages for this vertical)
  const contentPagesIndexed = await countContentPages(vertical);
  const t5 = contentPagesIndexed >= CONTENT_PAGES_THRESHOLD;

  // T1: Search Demand -- tracked via behavioral events (external data not available in DB)
  // Check if we have a search_demand event for this vertical
  const t1 = await checkSearchDemandSignal(vertical);

  // T3: Competitive Vacuum -- tracked via behavioral events from Competitive Scout
  const t3 = await checkCompetitiveVacuum(vertical);

  const thresholds = {
    t1_search_demand: t1,
    t2_organic_inbound: t2,
    t3_competitive_vacuum: t3,
    t4_config_readiness: t4,
    t5_content_coverage: t5,
  };

  const thresholdsMet = Object.values(thresholds).filter(Boolean).length;

  // Generate recommendation
  let recommendation: string;
  if (thresholdsMet >= 5) {
    recommendation = `Deploy ${vertical}. All 5 thresholds met. Auto-creating deployment task.`;
  } else if (thresholdsMet === 4) {
    const blocking = Object.entries(thresholds)
      .filter(([, met]) => !met)
      .map(([key]) => key)
      .join(", ");
    recommendation = `Near-ready. Blocked by: ${blocking}. Address the gap to trigger deployment.`;
  } else if (t2) {
    recommendation = `Organic signal detected (${checkupCount30d} checkups). ${5 - thresholdsMet} thresholds remaining.`;
  } else {
    recommendation = `Not ready. ${thresholdsMet}/5 thresholds. No organic inbound yet.`;
  }

  return {
    vertical,
    priority,
    thresholdsMet,
    thresholds,
    details: {
      checkupCount30d,
      conversionRate,
      vocabConfigExists,
      contentPagesIndexed,
    },
    recommendation,
  };
}

// -- Query Helpers ----------------------------------------------------------

async function countCheckupsByVertical(
  vertical: string,
  since: string
): Promise<number> {
  try {
    const result = await db("behavioral_events")
      .where("event_type", "checkup.submitted")
      .where("created_at", ">=", since)
      .whereRaw(
        `(properties->>'specialty' ILIKE ? OR properties->>'category' ILIKE ? OR properties->>'vertical' ILIKE ?)`,
        [`%${vertical}%`, `%${vertical}%`, `%${vertical}%`]
      )
      .count("* as cnt")
      .first();
    return Number(result?.cnt ?? 0);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[VerticalReadiness] Failed to count checkups for ${vertical}:`, message);
    return 0;
  }
}

async function computeVerticalConversionRate(
  vertical: string,
  since: string
): Promise<number> {
  try {
    const starts = await db("behavioral_events")
      .where("event_type", "checkup.started")
      .where("created_at", ">=", since)
      .whereRaw(
        `(properties->>'specialty' ILIKE ? OR properties->>'category' ILIKE ? OR properties->>'vertical' ILIKE ?)`,
        [`%${vertical}%`, `%${vertical}%`, `%${vertical}%`]
      )
      .count("* as cnt")
      .first();

    const completions = await db("behavioral_events")
      .where("event_type", "account.created")
      .where("created_at", ">=", since)
      .whereRaw(
        `(properties->>'specialty' ILIKE ? OR properties->>'category' ILIKE ? OR properties->>'vertical' ILIKE ?)`,
        [`%${vertical}%`, `%${vertical}%`, `%${vertical}%`]
      )
      .count("* as cnt")
      .first();

    const startCount = Number(starts?.cnt ?? 0);
    const completionCount = Number(completions?.cnt ?? 0);

    if (startCount === 0) return 0;
    return Math.round((completionCount / startCount) * 10000) / 100;
  } catch {
    return 0;
  }
}

async function checkVocabConfig(vertical: string): Promise<boolean> {
  try {
    const result = await db("vocabulary_configs")
      .whereRaw("vertical ILIKE ?", [`%${vertical}%`])
      .count("* as cnt")
      .first();
    return Number(result?.cnt ?? 0) > 0;
  } catch {
    // Table may not exist yet
    return false;
  }
}

async function countContentPages(vertical: string): Promise<number> {
  try {
    // Check behavioral_events for AEO page publications
    const result = await db("behavioral_events")
      .where("event_type", "like", "seo.page_published%")
      .whereRaw(
        `(properties->>'vertical' ILIKE ? OR properties->>'category' ILIKE ?)`,
        [`%${vertical}%`, `%${vertical}%`]
      )
      .count("* as cnt")
      .first();
    return Number(result?.cnt ?? 0);
  } catch {
    return 0;
  }
}

async function checkSearchDemandSignal(vertical: string): Promise<boolean> {
  try {
    const result = await db("behavioral_events")
      .where("event_type", "scout.search_demand")
      .whereRaw(
        `properties->>'vertical' ILIKE ?`,
        [`%${vertical}%`]
      )
      .whereRaw(
        `(properties->>'monthly_volume')::int >= 5000`
      )
      .count("* as cnt")
      .first();
    return Number(result?.cnt ?? 0) > 0;
  } catch {
    return false;
  }
}

async function checkCompetitiveVacuum(vertical: string): Promise<boolean> {
  try {
    // Check if a competitive analysis event shows no funded competitor
    const result = await db("behavioral_events")
      .where("event_type", "scout.competitive_vacuum")
      .whereRaw(
        `properties->>'vertical' ILIKE ?`,
        [`%${vertical}%`]
      )
      .whereRaw(
        `(properties->>'vacuum_confirmed')::boolean = true`
      )
      .count("* as cnt")
      .first();
    return Number(result?.cnt ?? 0) > 0;
  } catch {
    // Default to false if no data
    return false;
  }
}

// -- Task Creation ----------------------------------------------------------

async function createDeploymentTask(
  vertical: string,
  score: VerticalScore
): Promise<void> {
  try {
    // Check if a deployment task already exists for this vertical
    const existing = await db("dream_team_tasks")
      .where("title", "like", `%Vertical Deployment: ${vertical}%`)
      .where("status", "!=", "done")
      .first();

    if (existing) {
      console.log(`[VerticalReadiness] Deployment task already exists for ${vertical}.`);
      return;
    }

    await db("dream_team_tasks").insert({
      owner_name: "Corey",
      title: `Vertical Deployment: ${vertical} (5/5 thresholds met)`,
      description: [
        `All 5 deployment thresholds met for ${vertical}.`,
        "",
        `Checkup volume (30d): ${score.details.checkupCount30d}`,
        `Conversion rate: ${score.details.conversionRate}%`,
        `Vocab config: ${score.details.vocabConfigExists ? "Ready" : "Missing"}`,
        `Content pages: ${score.details.contentPagesIndexed}`,
        "",
        "Ready for deployment. Approve to proceed.",
      ].join("\n"),
      status: "open",
      priority: "high",
      source_type: "vertical_readiness",
    });

    console.log(`[VerticalReadiness] Created deployment task for ${vertical}.`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[VerticalReadiness] Failed to create deployment task:`, message);
  }
}

// -- Event Writing ----------------------------------------------------------

async function writeReadinessEvent(
  report: VerticalReadinessReport
): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "growth.vertical_readiness",
      properties: JSON.stringify({
        scores: report.scores.map((s) => ({
          vertical: s.vertical,
          priority: s.priority,
          thresholds_met: s.thresholdsMet,
          thresholds: s.thresholds,
          details: s.details,
          recommendation: s.recommendation,
        })),
        deployment_ready: report.deploymentReady,
        near_ready: report.nearReady,
        scanned_at: report.scannedAt,
      }),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[VerticalReadiness] Failed to write readiness event:", message);
  }
}
