/**
 * Conversion Optimizer Agent -- Execution Service
 *
 * Runs weekly Monday 6 AM PT. Queries behavioral_events for funnel
 * metrics: checkup starts, completions, account creations, TTFV,
 * and billing activations. Calculates conversion rates at each
 * stage, identifies the weakest stage, and writes a recommendation.
 *
 * Writes "conversion.funnel_analysis" event. No AI needed, pure
 * funnel math.
 */

import { db } from "../../database/connection";

// ── Types ───────────────────────────────────────────────────────────

interface FunnelStage {
  stage: string;
  count: number;
  rate: number | null;
  priorStage: string | null;
}

interface ConversionAnalysis {
  stages: FunnelStage[];
  weakestStage: string | null;
  weakestRate: number | null;
  recommendation: string;
  analyzedAt: string;
  periodStart: string;
  periodEnd: string;
}

// ── Core ────────────────────────────────────────────────────────────

/**
 * Run the Conversion Optimizer weekly funnel analysis.
 */
export async function runConversionAnalysis(): Promise<ConversionAnalysis> {
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Count events at each funnel stage
  const checkupStarts = await countEvents("checkup.started", sevenDaysAgo, now);
  const checkupCompletions = await countEvents("checkup.completed", sevenDaysAgo, now);
  const accountCreations = await countEvents("checkup.account_created", sevenDaysAgo, now);
  const ttfvDelivered = await countEvents("ttfv.delivered", sevenDaysAgo, now);
  const billingActivations = await countEvents("billing.activated", sevenDaysAgo, now);

  // Build funnel stages with conversion rates
  const stages: FunnelStage[] = [
    {
      stage: "checkup_started",
      count: checkupStarts,
      rate: null,
      priorStage: null,
    },
    {
      stage: "checkup_completed",
      count: checkupCompletions,
      rate: checkupStarts > 0 ? checkupCompletions / checkupStarts : null,
      priorStage: "checkup_started",
    },
    {
      stage: "account_created",
      count: accountCreations,
      rate:
        checkupCompletions > 0
          ? accountCreations / checkupCompletions
          : null,
      priorStage: "checkup_completed",
    },
    {
      stage: "ttfv_delivered",
      count: ttfvDelivered,
      rate:
        accountCreations > 0 ? ttfvDelivered / accountCreations : null,
      priorStage: "account_created",
    },
    {
      stage: "billing_activated",
      count: billingActivations,
      rate: ttfvDelivered > 0 ? billingActivations / ttfvDelivered : null,
      priorStage: "ttfv_delivered",
    },
  ];

  // Find the weakest stage (lowest rate, excluding null and top of funnel)
  let weakestStage: string | null = null;
  let weakestRate: number | null = null;

  for (const stage of stages) {
    if (stage.rate === null) continue;
    if (weakestRate === null || stage.rate < weakestRate) {
      weakestRate = stage.rate;
      weakestStage = stage.stage;
    }
  }

  // Generate recommendation based on weakest stage
  const recommendation = generateRecommendation(
    weakestStage,
    weakestRate,
    stages,
  );

  const analysis: ConversionAnalysis = {
    stages,
    weakestStage,
    weakestRate,
    recommendation,
    analyzedAt: new Date().toISOString(),
    periodStart: sevenDaysAgo.toISOString(),
    periodEnd: now.toISOString(),
  };

  // Write funnel analysis event
  await db("behavioral_events")
    .insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "conversion.funnel_analysis",
      org_id: null,
      properties: JSON.stringify({
        stages: stages.map((s) => ({
          stage: s.stage,
          count: s.count,
          rate: s.rate !== null ? Math.round(s.rate * 1000) / 1000 : null,
        })),
        weakestStage,
        weakestRate:
          weakestRate !== null ? Math.round(weakestRate * 1000) / 1000 : null,
        recommendation,
      }),
      created_at: new Date(),
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[ConversionOptimizer] Failed to write funnel analysis event:`,
        message,
      );
    });

  console.log(
    `[ConversionOptimizer] Analysis complete. Weakest stage: ${weakestStage || "N/A"} at ${
      weakestRate !== null ? Math.round(weakestRate * 100) + "%" : "N/A"
    }`,
  );

  return analysis;
}

// ── Helpers ─────────────────────────────────────────────────────────

async function countEvents(
  eventType: string,
  from: Date,
  to: Date,
): Promise<number> {
  const result = await db("behavioral_events")
    .where("event_type", eventType)
    .where("created_at", ">=", from)
    .where("created_at", "<", to)
    .count("* as cnt")
    .first();
  return Number(result?.cnt ?? 0);
}

function generateRecommendation(
  weakestStage: string | null,
  weakestRate: number | null,
  stages: FunnelStage[],
): string {
  if (!weakestStage || weakestRate === null) {
    return "Insufficient funnel data to identify the weakest stage. Monitor event tracking to ensure all funnel stages are instrumented.";
  }

  const pct = Math.round(weakestRate * 100);

  const recommendations: Record<string, string> = {
    checkup_completed: `Checkup completion rate is ${pct}%. The entry experience may be causing friction. Review the search field UX, loading states during Scanning Theater, and intent chip clarity. People who start but do not finish likely hit a confusion point or a speed issue.`,
    account_created: `Finding-to-account conversion is ${pct}%. The blur gate findings may not be compelling enough to trigger account creation. Review which finding types show above the gate and whether competitor context is specific enough to create the "how did they know that?" moment.`,
    ttfv_delivered: `TTFV delivery rate is ${pct}% of new accounts. The gap between account creation and first value may be too long. Review the Welcome Intelligence timing and ensure the first finding arrives within hours, not days.`,
    billing_activated: `Billing activation rate is ${pct}% after TTFV. Clients are seeing value but not converting to paid. Review whether the TTFV finding is remarkable enough to justify the subscription, or whether the pricing page creates friction.`,
  };

  return (
    recommendations[weakestStage] ||
    `The weakest funnel stage is ${weakestStage} at ${pct}%. Investigate the drop-off between ${weakestStage} and the prior stage to identify friction.`
  );
}
