/**
 * Alloro Experiment Lab -- The Kenji Lopez-Alt Method
 *
 * Kenji doesn't guess. He hypothesizes, isolates one variable,
 * tests both versions, measures the outcome, and documents why.
 *
 * This service tracks A/B experiments across the product.
 * Each experiment has:
 * - A hypothesis ("Named competitor CTA converts 40% better than generic")
 * - A control (the current version)
 * - A variant (the thing we're testing)
 * - A metric (what we measure: click rate, signup rate, share rate)
 * - A sample size target (how many impressions before we declare a winner)
 * - Results (control rate vs variant rate, statistical significance)
 *
 * Experiments are assigned per-session using a hash of session ID.
 * No cookies. No tracking pixels. Just math.
 */

import { db } from "../database/connection";
import crypto from "crypto";

// ─── Types ───────────────────────────────────────────────────────

export interface Experiment {
  id: string;
  name: string;
  hypothesis: string;
  controlLabel: string;
  variantLabel: string;
  metric: string;
  targetSampleSize: number;
  status: "running" | "concluded" | "paused";
  winner?: "control" | "variant" | "inconclusive";
  conclusion?: string;
}

export interface ExperimentAssignment {
  experimentId: string;
  group: "control" | "variant";
}

// ─── Assignment ──────────────────────────────────────────────────

/**
 * Deterministically assign a session to control or variant.
 * Same session always gets the same assignment (no flicker).
 * 50/50 split using hash of session ID + experiment ID.
 */
export function assignGroup(
  sessionId: string,
  experimentId: string
): "control" | "variant" {
  const hash = crypto
    .createHash("sha256")
    .update(`${sessionId}:${experimentId}`)
    .digest("hex");
  // First byte determines group: 0-127 = control, 128-255 = variant
  const byte = parseInt(hash.substring(0, 2), 16);
  return byte < 128 ? "control" : "variant";
}

// ─── Recording ───────────────────────────────────────────────────

/**
 * Record an impression (the user saw the experiment).
 */
export async function recordImpression(
  experimentId: string,
  group: "control" | "variant",
  sessionId: string
): Promise<void> {
  const hasTable = await db.schema.hasTable("experiment_events");
  if (!hasTable) await createExperimentTables();

  await db("experiment_events").insert({
    id: db.raw("gen_random_uuid()"),
    experiment_id: experimentId,
    session_id: sessionId,
    group_name: group,
    event_type: "impression",
    created_at: new Date(),
  });
}

/**
 * Record a conversion (the user took the desired action).
 */
export async function recordConversion(
  experimentId: string,
  group: "control" | "variant",
  sessionId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const hasTable = await db.schema.hasTable("experiment_events");
  if (!hasTable) return;

  await db("experiment_events").insert({
    id: db.raw("gen_random_uuid()"),
    experiment_id: experimentId,
    session_id: sessionId,
    group_name: group,
    event_type: "conversion",
    metadata: metadata ? JSON.stringify(metadata) : null,
    created_at: new Date(),
  });
}

// ─── Analysis ────────────────────────────────────────────────────

export interface ExperimentResults {
  experimentId: string;
  control: { impressions: number; conversions: number; rate: number };
  variant: { impressions: number; conversions: number; rate: number };
  lift: number; // percentage improvement of variant over control
  significant: boolean; // rough significance check
  sampleSufficient: boolean;
}

/**
 * Calculate results for an experiment.
 */
export async function getExperimentResults(
  experimentId: string,
  targetSampleSize: number = 100
): Promise<ExperimentResults> {
  const hasTable = await db.schema.hasTable("experiment_events");
  if (!hasTable) {
    return {
      experimentId,
      control: { impressions: 0, conversions: 0, rate: 0 },
      variant: { impressions: 0, conversions: 0, rate: 0 },
      lift: 0,
      significant: false,
      sampleSufficient: false,
    };
  }

  const counts = await db("experiment_events")
    .where({ experiment_id: experimentId })
    .groupBy("group_name", "event_type")
    .select("group_name", "event_type")
    .count("id as count");

  const get = (group: string, type: string): number => {
    const row = counts.find(
      (r: any) => r.group_name === group && r.event_type === type
    );
    return Number(row?.count || 0);
  };

  const controlImpressions = get("control", "impression");
  const controlConversions = get("control", "conversion");
  const variantImpressions = get("variant", "impression");
  const variantConversions = get("variant", "conversion");

  const controlRate = controlImpressions > 0 ? controlConversions / controlImpressions : 0;
  const variantRate = variantImpressions > 0 ? variantConversions / variantImpressions : 0;
  const lift = controlRate > 0 ? ((variantRate - controlRate) / controlRate) * 100 : 0;

  // Rough significance: at least 100 impressions per group and lift > 10%
  const totalImpressions = controlImpressions + variantImpressions;
  const sampleSufficient = totalImpressions >= targetSampleSize;
  const significant = sampleSufficient && Math.abs(lift) > 10;

  return {
    experimentId,
    control: { impressions: controlImpressions, conversions: controlConversions, rate: Math.round(controlRate * 1000) / 10 },
    variant: { impressions: variantImpressions, conversions: variantConversions, rate: Math.round(variantRate * 1000) / 10 },
    lift: Math.round(lift * 10) / 10,
    significant,
    sampleSufficient,
  };
}

// ─── Table Creation ──────────────────────────────────────────────

async function createExperimentTables(): Promise<void> {
  const exists = await db.schema.hasTable("experiment_events");
  if (exists) return;

  await db.schema.createTable("experiment_events", (t) => {
    t.uuid("id").primary().defaultTo(db.raw("gen_random_uuid()"));
    t.string("experiment_id", 100).notNullable().index();
    t.string("session_id", 100).notNullable();
    t.string("group_name", 20).notNullable(); // "control" or "variant"
    t.string("event_type", 20).notNullable(); // "impression" or "conversion"
    t.jsonb("metadata").nullable();
    t.timestamp("created_at", { useTz: true }).defaultTo(db.fn.now()).index();
  });

  console.log("[ExperimentLab] Created experiment_events table");
}

// ─── Active Experiments Registry ─────────────────────────────────

/**
 * The experiments currently running.
 * Each experiment isolates ONE variable (Kenji's rule).
 *
 * Add new experiments here. Remove concluded ones.
 * The Learning Agent can analyze results weekly and auto-conclude.
 */
export const ACTIVE_EXPERIMENTS: Experiment[] = [
  {
    id: "oz-reveal-header",
    name: "Oz Moment Section Header",
    hypothesis: "\"The pattern we spotted\" converts better than no header because it creates ownership of the discovery.",
    controlLabel: "No section header (just the dark cards)",
    variantLabel: "\"The pattern we spotted\" header above cards",
    metric: "checkup_email_capture_rate",
    targetSampleSize: 200,
    status: "running",
  },
  {
    id: "competitor-invite-framing",
    name: "Competitor Invite CTA",
    hypothesis: "\"Your competitors haven't seen this yet\" drives more shares than \"Know any of these businesses?\" because it creates competitive urgency.",
    controlLabel: "Know any of these businesses?",
    variantLabel: "Your competitors haven't seen this yet",
    metric: "competitor_invite_click_rate",
    targetSampleSize: 200,
    status: "running",
  },
  {
    id: "sequential-reveal-timing",
    name: "Sequential Reveal Speed",
    hypothesis: "2-second intervals between reveals create more anticipation than showing everything at once, increasing time-on-page and email capture.",
    controlLabel: "All results shown immediately",
    variantLabel: "Sequential reveal (2s, 4s, 6s stages)",
    metric: "checkup_email_capture_rate",
    targetSampleSize: 300,
    status: "running",
  },
  {
    id: "monday-email-subject",
    name: "Monday Email Subject Line",
    hypothesis: "Subject lines with the owner's last name + a named finding (\"Morrison, Dr. Chen went quiet\") get higher open rates than generic subject lines.",
    controlLabel: "Generic: \"Your weekly intelligence brief\"",
    variantLabel: "Named: \"{LastName}, {specific finding}\"",
    metric: "monday_email_open_rate",
    targetSampleSize: 100,
    status: "running",
  },
];
