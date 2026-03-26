/**
 * PatientPath CRO A/B Testing (WO-8)
 *
 * Three CTA variants per experiment. Deterministic assignment via hash.
 * After 30 days + 100 visits: winning variant becomes permanent.
 */

import crypto from "crypto";
import { db } from "../database/connection";

interface Experiment {
  id: string;
  experiment_name: string;
  variant_a: string;
  variant_b: string;
  variant_c: string | null;
  winning_variant: string | null;
  concluded: boolean;
}

interface VariantAssignment {
  experimentId: string;
  variant: "a" | "b" | "c";
  ctaText: string;
}

/**
 * Deterministic variant assignment via hash
 * Same visitor always sees the same variant for a given experiment
 */
function assignVariant(visitorId: string, experimentId: string, hasVariantC: boolean): "a" | "b" | "c" {
  const hash = crypto.createHash("sha256").update(`${visitorId}:${experimentId}`).digest("hex");
  const num = parseInt(hash.substring(0, 8), 16);
  const buckets = hasVariantC ? 3 : 2;
  const bucket = num % buckets;
  if (bucket === 0) return "a";
  if (bucket === 1) return "b";
  return "c";
}

/**
 * Get variant assignment for a visitor on a specific experiment
 */
export async function getVariantForVisitor(
  visitorId: string,
  experimentName: string,
  orgId: number
): Promise<VariantAssignment | null> {
  const experiment = await db("cro_experiments")
    .where({ organization_id: orgId, experiment_name: experimentName })
    .first() as Experiment | undefined;

  if (!experiment) return null;

  // If experiment concluded, return winning variant
  if (experiment.concluded && experiment.winning_variant) {
    const ctaText = experiment[`variant_${experiment.winning_variant}` as keyof Experiment] as string;
    return {
      experimentId: experiment.id,
      variant: experiment.winning_variant as "a" | "b" | "c",
      ctaText,
    };
  }

  const variant = assignVariant(visitorId, experiment.id, !!experiment.variant_c);
  const ctaText = experiment[`variant_${variant}` as keyof Experiment] as string;

  return { experimentId: experiment.id, variant, ctaText };
}

/**
 * Record an impression for an experiment
 */
export async function recordImpression(experimentId: string): Promise<void> {
  await db("cro_experiments")
    .where({ id: experimentId })
    .increment("total_impressions", 1);
}

/**
 * Record a conversion for a specific variant
 */
export async function recordConversion(experimentId: string, variant: "a" | "b" | "c"): Promise<void> {
  const column = `variant_${variant}_conversions`;
  await db("cro_experiments")
    .where({ id: experimentId })
    .increment(column, 1);
}

/**
 * Check if any experiments should be concluded
 * Criteria: 30+ days old AND 100+ total impressions
 */
export async function concludeExperiments(): Promise<void> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const eligible = await db("cro_experiments")
    .where("concluded", false)
    .where("started_at", "<", thirtyDaysAgo)
    .where("total_impressions", ">=", 100);

  for (const exp of eligible) {
    const rates: { variant: string; rate: number }[] = [
      { variant: "a", rate: exp.total_impressions > 0 ? exp.variant_a_conversions / exp.total_impressions : 0 },
      { variant: "b", rate: exp.total_impressions > 0 ? exp.variant_b_conversions / exp.total_impressions : 0 },
    ];
    if (exp.variant_c) {
      rates.push({ variant: "c", rate: exp.total_impressions > 0 ? exp.variant_c_conversions / exp.total_impressions : 0 });
    }

    const winner = rates.sort((a, b) => b.rate - a.rate)[0];

    await db("cro_experiments")
      .where({ id: exp.id })
      .update({
        concluded: true,
        concluded_at: new Date(),
        winning_variant: winner.variant,
      });

    console.log(`[CRO] Experiment "${exp.experiment_name}" concluded. Winner: variant ${winner.variant} (${(winner.rate * 100).toFixed(1)}% conversion)`);
  }
}

/**
 * Create a new CTA experiment for a practice
 */
export async function createExperiment(
  orgId: number,
  name: string,
  variantA: string,
  variantB: string,
  variantC?: string
): Promise<string> {
  const [result] = await db("cro_experiments")
    .insert({
      organization_id: orgId,
      experiment_name: name,
      variant_a: variantA,
      variant_b: variantB,
      variant_c: variantC || null,
    })
    .returning("id");

  return result.id;
}
