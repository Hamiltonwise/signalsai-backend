/**
 * CFO Agent -- Execution Service
 *
 * Runs monthly, first Monday 8 AM PT.
 * Queries organizations table for active org count, subscription tiers,
 * and created_at dates. Calculates MRR, monthly churn rate, CAC estimate,
 * LTV estimate, and FYM score. Uses Claude to generate 3 financial insights
 * with recommendations. Falls back to template calculations if no API key.
 *
 * Writes "cfo.monthly_report" event with all metrics.
 */

import { db } from "../../database/connection";

// ── Types ───────────────────────────────────────────────────────────

interface StageDistribution {
  stage1: number; // Checkup only ($0)
  stage2: number; // GBP connected ($150)
  stage3: number; // PMS connected ($300)
  stage4: number; // PatientPath live ($500)
}

interface CFOMetrics {
  activeOrgs: number;
  stageDistribution: StageDistribution;
  mrr: number;
  monthlyChurnRate: number;
  cacEstimate: number;
  ltvEstimate: number;
  ltvCacRatio: number;
  fymScore: number;
  runway: string;
}

interface CFOInsight {
  headline: string;
  detail: string;
  recommendation: string;
  humanNeed: "safety" | "belonging" | "purpose" | "status";
  economicConsequence: {
    thirtyDay: string;
    ninetyDay: string;
    yearDay: string;
  };
}

interface CFOMonthlyReport {
  metrics: CFOMetrics;
  insights: CFOInsight[];
  generatedAt: string;
}

// ── Stage Pricing ──────────────────────────────────────────────────

const STAGE_PRICING: Record<string, number> = {
  checkup_only: 0,
  gbp_connected: 150,
  pms_connected: 300,
  patientpath_live: 500,
};

// ── Core ────────────────────────────────────────────────────────────

/**
 * Run the CFO Agent monthly report.
 * Returns metrics + 3 financial insights.
 */
export async function runCFOMonthlyReport(): Promise<CFOMonthlyReport> {
  const metrics = await calculateMetrics();
  let insights: CFOInsight[];

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      insights = await synthesizeWithClaude(metrics);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[CFOAgent] Claude synthesis failed, using templates:`,
        message,
      );
      insights = generateTemplateInsights(metrics);
    }
  } else {
    console.log("[CFOAgent] No ANTHROPIC_API_KEY set, using template insights");
    insights = generateTemplateInsights(metrics);
  }

  const report: CFOMonthlyReport = {
    metrics,
    insights,
    generatedAt: new Date().toISOString(),
  };

  // Write event
  await db("behavioral_events")
    .insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "cfo.monthly_report",
      org_id: null,
      properties: JSON.stringify(report),
      created_at: new Date(),
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[CFOAgent] Failed to write monthly report event:`, message);
    });

  console.log(
    `[CFOAgent] Monthly report complete. MRR: $${metrics.mrr}, Churn: ${(metrics.monthlyChurnRate * 100).toFixed(1)}%, FYM: ${metrics.fymScore}`,
  );

  return report;
}

// ── Metrics Calculation ─────────────────────────────────────────────

async function calculateMetrics(): Promise<CFOMetrics> {
  // Count active orgs
  const activeResult = await db("organizations")
    .where("subscription_status", "active")
    .count("* as cnt")
    .first()
    .catch(() => ({ cnt: 0 }));
  const activeOrgs = Number(activeResult?.cnt ?? 0);

  // Stage distribution
  const stageDistribution = await calculateStageDistribution();

  // MRR from stage distribution
  const mrr =
    stageDistribution.stage1 * STAGE_PRICING.checkup_only +
    stageDistribution.stage2 * STAGE_PRICING.gbp_connected +
    stageDistribution.stage3 * STAGE_PRICING.pms_connected +
    stageDistribution.stage4 * STAGE_PRICING.patientpath_live;

  // Churn rate: orgs that went inactive in last 30 days / total active at start
  const monthlyChurnRate = await calculateChurnRate();

  // CAC estimate: total marketing spend / new orgs this month
  // For now, use a conservative estimate since we lack Stripe data
  const newOrgsThisMonth = await countNewOrgs(30);
  const estimatedMonthlySpend = 2000; // conservative placeholder
  const cacEstimate = newOrgsThisMonth > 0 ? estimatedMonthlySpend / newOrgsThisMonth : 0;

  // LTV: average revenue per org per month / churn rate
  const avgRevenuePerOrg = activeOrgs > 0 ? mrr / activeOrgs : 0;
  const ltvEstimate = monthlyChurnRate > 0 ? avgRevenuePerOrg / monthlyChurnRate : avgRevenuePerOrg * 24;

  // LTV:CAC ratio
  const ltvCacRatio = cacEstimate > 0 ? ltvEstimate / cacEstimate : 0;

  // FYM score (0-100): composite of MRR growth, churn, CAC payback
  const fymScore = calculateFYMScore(mrr, monthlyChurnRate, ltvCacRatio, activeOrgs);

  // Runway estimate
  const monthlyBurn = 9500; // from CFO spec
  const runway = mrr >= monthlyBurn
    ? "Sustainable (MRR covers burn)"
    : `${Math.floor((50000 + mrr * 6) / (monthlyBurn - mrr))} months estimated`;

  return {
    activeOrgs,
    stageDistribution,
    mrr,
    monthlyChurnRate,
    cacEstimate,
    ltvEstimate,
    ltvCacRatio,
    fymScore,
    runway,
  };
}

async function calculateStageDistribution(): Promise<StageDistribution> {
  const dist: StageDistribution = { stage1: 0, stage2: 0, stage3: 0, stage4: 0 };

  try {
    // Stage 4: has PatientPath site deployed
    const s4 = await db("organizations")
      .where("subscription_status", "active")
      .whereNotNull("patientpath_site_id")
      .count("* as cnt")
      .first();
    dist.stage4 = Number(s4?.cnt ?? 0);

    // Stage 3: has PMS data but no PatientPath
    const s3 = await db("organizations")
      .where("subscription_status", "active")
      .whereNull("patientpath_site_id")
      .whereExists(function () {
        this.select(db.raw("1"))
          .from("referral_sources")
          .whereRaw("referral_sources.org_id = organizations.id");
      })
      .count("* as cnt")
      .first();
    dist.stage3 = Number(s3?.cnt ?? 0);

    // Stage 2: has GBP connected but no PMS data and no PatientPath
    const s2 = await db("organizations")
      .where("subscription_status", "active")
      .whereNull("patientpath_site_id")
      .whereNotNull("gbp_place_id")
      .whereNotExists(function () {
        this.select(db.raw("1"))
          .from("referral_sources")
          .whereRaw("referral_sources.org_id = organizations.id");
      })
      .count("* as cnt")
      .first();
    dist.stage2 = Number(s2?.cnt ?? 0);

    // Stage 1: everything else active
    const totalActive = await db("organizations")
      .where("subscription_status", "active")
      .count("* as cnt")
      .first();
    dist.stage1 = Number(totalActive?.cnt ?? 0) - dist.stage2 - dist.stage3 - dist.stage4;
    if (dist.stage1 < 0) dist.stage1 = 0;
  } catch {
    // If tables don't exist yet, return zeros
  }

  return dist;
}

async function calculateChurnRate(): Promise<number> {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    // Orgs that were active 30 days ago
    const activeAtStart = await db("organizations")
      .where("created_at", "<", thirtyDaysAgo)
      .where(function () {
        this.where("subscription_status", "active")
          .orWhere("updated_at", ">", thirtyDaysAgo);
      })
      .count("* as cnt")
      .first();

    // Orgs that churned in last 30 days
    const churned = await db("organizations")
      .where("subscription_status", "!=", "active")
      .where("updated_at", ">=", thirtyDaysAgo)
      .where("created_at", "<", thirtyDaysAgo)
      .count("* as cnt")
      .first();

    const activeCount = Number(activeAtStart?.cnt ?? 0);
    const churnedCount = Number(churned?.cnt ?? 0);

    return activeCount > 0 ? churnedCount / activeCount : 0;
  } catch {
    return 0;
  }
}

async function countNewOrgs(days: number): Promise<number> {
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const result = await db("organizations")
      .where("created_at", ">=", since)
      .count("* as cnt")
      .first();
    return Number(result?.cnt ?? 0);
  } catch {
    return 0;
  }
}

function calculateFYMScore(
  mrr: number,
  churnRate: number,
  ltvCacRatio: number,
  activeOrgs: number,
): number {
  let score = 0;

  // MRR component (0-30 points): $0=0, $50k+=30
  score += Math.min(30, Math.round((mrr / 50000) * 30));

  // Churn component (0-25 points): 0% churn=25, 10%+ churn=0
  score += Math.max(0, Math.round(25 * (1 - churnRate * 10)));

  // LTV:CAC component (0-25 points): 3:1=25, 0=0
  score += Math.min(25, Math.round((ltvCacRatio / 3) * 25));

  // Client count component (0-20 points): 100+ clients=20
  score += Math.min(20, Math.round((activeOrgs / 100) * 20));

  return Math.min(100, Math.max(0, score));
}

// ── Claude Synthesis ────────────────────────────────────────────────

async function synthesizeWithClaude(
  metrics: CFOMetrics,
): Promise<CFOInsight[]> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic();

  const prompt = `You are the CFO Agent for Alloro, a business intelligence platform for licensed specialists.

Analyze these financial metrics and produce exactly 3 insights. Each insight must identify which core human need is threatened (safety, belonging, purpose, or status) and the dollar consequence at 30, 90, and 365 days.

METRICS:
- Active Organizations: ${metrics.activeOrgs}
- Stage Distribution: Stage 1 (free): ${metrics.stageDistribution.stage1}, Stage 2 ($150): ${metrics.stageDistribution.stage2}, Stage 3 ($300): ${metrics.stageDistribution.stage3}, Stage 4 ($500): ${metrics.stageDistribution.stage4}
- MRR: $${metrics.mrr}
- Monthly Churn Rate: ${(metrics.monthlyChurnRate * 100).toFixed(1)}%
- CAC Estimate: $${metrics.cacEstimate}
- LTV Estimate: $${metrics.ltvEstimate.toFixed(0)}
- LTV:CAC Ratio: ${metrics.ltvCacRatio.toFixed(1)}:1
- FYM Score: ${metrics.fymScore}/100
- Runway: ${metrics.runway}

TARGETS:
- CAC under $200
- LTV $3,600+
- LTV:CAC 3:1+
- NRR 115%+
- MRR covering $9,500/month burn

IMPORTANT: Never use em-dashes. Use commas or periods instead.

Return a JSON array of exactly 3 insights. Each insight must have:
- headline: one sentence, specific and data-backed
- detail: 2-3 sentences with context
- recommendation: one actionable sentence
- humanNeed: one of "safety", "belonging", "purpose", "status"
- economicConsequence: object with thirtyDay, ninetyDay, yearDay strings (dollar figures)

Return ONLY the JSON array, no markdown fences.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.slice(0, 3).map((f: any) => ({
        headline: String(f.headline || ""),
        detail: String(f.detail || ""),
        recommendation: String(f.recommendation || ""),
        humanNeed: f.humanNeed || "safety",
        economicConsequence: {
          thirtyDay: String(f.economicConsequence?.thirtyDay || "$0"),
          ninetyDay: String(f.economicConsequence?.ninetyDay || "$0"),
          yearDay: String(f.economicConsequence?.yearDay || "$0"),
        },
      }));
    }
  } catch {
    // Fall through to template
  }

  return generateTemplateInsights(metrics);
}

// ── Template Insights (fallback) ────────────────────────────────────

function generateTemplateInsights(metrics: CFOMetrics): CFOInsight[] {
  const insights: CFOInsight[] = [];

  // Insight 1: MRR and runway
  const mrrHealthy = metrics.mrr >= 9500;
  insights.push({
    headline: `MRR at $${metrics.mrr}${mrrHealthy ? ", covering monthly burn" : ", below $9,500 burn target"}`,
    detail: `${metrics.activeOrgs} active organizations across 4 stages. Stage distribution shows ${metrics.stageDistribution.stage2 + metrics.stageDistribution.stage3 + metrics.stageDistribution.stage4} paying clients. Runway: ${metrics.runway}.`,
    recommendation: mrrHealthy
      ? "Focus on stage progression to increase NRR. Each Stage 2 client that moves to Stage 3 adds $150/month."
      : "Prioritize converting Stage 1 free users to Stage 2 paid. Each conversion adds $150 MRR.",
    humanNeed: "safety",
    economicConsequence: {
      thirtyDay: mrrHealthy ? "Stable" : `$${9500 - metrics.mrr} gap to cover burn`,
      ninetyDay: mrrHealthy ? "Building buffer" : `$${(9500 - metrics.mrr) * 3} cumulative deficit`,
      yearDay: mrrHealthy
        ? `$${(metrics.mrr - 9500) * 12} annual surplus at current rate`
        : `Runway exhaustion risk without growth`,
    },
  });

  // Insight 2: Churn analysis
  const churnPct = (metrics.monthlyChurnRate * 100).toFixed(1);
  const churnHealthy = metrics.monthlyChurnRate < 0.05;
  insights.push({
    headline: `Monthly churn rate at ${churnPct}%${churnHealthy ? ", within healthy range" : ", above 5% target"}`,
    detail: `At ${churnPct}% monthly churn, approximately ${Math.round(metrics.monthlyChurnRate * 12 * 100)}% of the client base turns over annually. ${churnHealthy ? "This is sustainable for early stage." : "This rate compounds quickly and erodes growth."}`,
    recommendation: churnHealthy
      ? "Maintain engagement quality. Monitor for early churn signals through Client Monitor."
      : "Investigate churn causes immediately. Each lost client at average MRR costs more than acquiring a new one.",
    humanNeed: "safety",
    economicConsequence: {
      thirtyDay: `${Math.round(metrics.activeOrgs * metrics.monthlyChurnRate)} client(s) at risk`,
      ninetyDay: `$${Math.round(metrics.mrr * metrics.monthlyChurnRate * 3)} potential MRR loss`,
      yearDay: `$${Math.round(metrics.mrr * metrics.monthlyChurnRate * 12)} annualized churn impact`,
    },
  });

  // Insight 3: Unit economics
  const ltvCacHealthy = metrics.ltvCacRatio >= 3;
  insights.push({
    headline: `LTV:CAC ratio at ${metrics.ltvCacRatio.toFixed(1)}:1${ltvCacHealthy ? ", exceeding 3:1 target" : ", below 3:1 target"}`,
    detail: `Estimated CAC: $${metrics.cacEstimate}. Estimated LTV: $${metrics.ltvEstimate.toFixed(0)}. ${ltvCacHealthy ? "Unit economics support scaling." : "Improve conversion efficiency before increasing spend."}`,
    recommendation: ltvCacHealthy
      ? "Unit economics are healthy. Increase acquisition spend incrementally while monitoring CAC."
      : "Reduce CAC through PLG improvements or increase LTV through stage progression before scaling spend.",
    humanNeed: "purpose",
    economicConsequence: {
      thirtyDay: `$${metrics.cacEstimate} per new client acquired`,
      ninetyDay: `${Math.round(metrics.cacEstimate / (metrics.mrr / Math.max(1, metrics.activeOrgs)))} month payback period`,
      yearDay: `$${metrics.ltvEstimate.toFixed(0)} lifetime value per client`,
    },
  });

  return insights;
}
