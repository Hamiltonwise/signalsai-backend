/**
 * Competitive Intel Agent -- Execution Service
 *
 * On-demand function called by the Intelligence Agent when competitor
 * movement is detected by the Competitive Scout. The Scout detects
 * movements (data-driven, SQL only). The Intel Agent analyzes what
 * those movements mean strategically.
 *
 * Uses Claude to produce a strategic brief: what the competitor is
 * doing, why, and what it means for the client.
 *
 * Export: analyzeCompetitorMovement() -- not a cron job.
 */

import { db } from "../../database/connection";

// -- Types ------------------------------------------------------------------

interface CompetitorMovementInput {
  orgId: number;
  competitorName: string;
  movementType: string;
  headline: string;
  details: string;
  metadata: Record<string, unknown>;
}

type ThreatLevel = "low" | "medium" | "high" | "critical";

interface CompetitiveIntelBrief {
  brief: string;
  threatLevel: ThreatLevel;
  recommendedResponse: string;
  humanNeed: "safety" | "belonging" | "purpose" | "status";
  economicConsequence: {
    thirtyDay: string;
    ninetyDay: string;
    yearDay: string;
  };
}

// -- Constants ---------------------------------------------------------------

const DEFAULT_CASE_VALUE = 1200;
const POSITION_DROP_REVENUE_PERCENT = 0.175; // 15-20% midpoint
const MONTHLY_SEARCH_REVENUE_ESTIMATE = 50000;

// -- Core -------------------------------------------------------------------

/**
 * Analyze a competitor movement detected by the Competitive Scout.
 * Returns a strategic brief with threat level and recommended response.
 */
export async function analyzeCompetitorMovement(
  input: CompetitorMovementInput,
): Promise<CompetitiveIntelBrief> {
  const { orgId, competitorName, movementType, headline, details, metadata } = input;

  // Gather org context
  const org = await db("organizations").where({ id: orgId }).first();
  const orgName = org?.name || "Unknown Practice";

  // Fetch recent snapshots for competitive context
  const snapshots = await db("weekly_ranking_snapshots")
    .where({ org_id: orgId })
    .orderBy("week_start", "desc")
    .limit(4);

  const snapshotContext = snapshots
    .map(
      (s: any) =>
        `Week ${s.week_start}: client position #${s.client_position ?? "N/A"}, ` +
        `client reviews ${s.client_review_count ?? 0}, ` +
        `competitor ${s.competitor_name ?? "none"} at ${s.competitor_review_count ?? 0} reviews`,
    )
    .join("\n");

  // Attempt Claude synthesis
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await synthesizeWithClaude({
        orgName,
        competitorName,
        movementType,
        headline,
        details,
        metadata,
        snapshotContext,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[CompetitiveIntel] Claude synthesis failed for org ${orgId}, using template:`,
        message,
      );
    }
  }

  // Fallback to template brief
  return generateTemplateBrief({
    orgName,
    competitorName,
    movementType,
    headline,
    details,
    metadata,
  });
}

// -- Claude Synthesis -------------------------------------------------------

interface SynthesisContext {
  orgName: string;
  competitorName: string;
  movementType: string;
  headline: string;
  details: string;
  metadata: Record<string, unknown>;
  snapshotContext: string;
}

async function synthesizeWithClaude(
  ctx: SynthesisContext,
): Promise<CompetitiveIntelBrief> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic();

  const prompt = `You are the Competitive Intelligence Agent for Alloro, a business intelligence platform for licensed specialists.

The Competitive Scout detected a movement. Analyze what it means strategically.

Practice: ${ctx.orgName}
Competitor: ${ctx.competitorName}
Movement Type: ${ctx.movementType}
Headline: ${ctx.headline}
Details: ${ctx.details}
Metadata: ${JSON.stringify(ctx.metadata)}

Recent Ranking History:
${ctx.snapshotContext || "No ranking history available"}

Economic assumptions:
- Each position drop costs approximately 15-20% of search-driven new patient acquisition
- Average specialist generates $50,000/month from search-driven patients
- Average case value: $${DEFAULT_CASE_VALUE}

Produce a JSON object with these fields:
- brief: 3-5 sentences analyzing what the competitor is doing, why they might be doing it, and what it means for the client. Use the biological-economic lens: name the human need threatened (safety, belonging, purpose, or status) and the dollar consequence.
- threatLevel: "low", "medium", "high", or "critical"
- recommendedResponse: 2-3 sentences of specific, actionable advice for the client
- humanNeed: one of "safety", "belonging", "purpose", "status"
- economicConsequence: object with thirtyDay, ninetyDay, yearDay strings (dollar figures)

Rules:
- No em-dashes. Use commas, periods, or semicolons.
- Be specific. Name the competitor. Cite numbers.
- The brief should make the client feel informed, not panicked.
- Every claim must be grounded in the data provided.

Return ONLY the JSON object, no markdown fences.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const parsed = JSON.parse(text);
    return {
      brief: String(parsed.brief || ""),
      threatLevel: parsed.threatLevel || "medium",
      recommendedResponse: String(parsed.recommendedResponse || ""),
      humanNeed: parsed.humanNeed || "status",
      economicConsequence: {
        thirtyDay: String(parsed.economicConsequence?.thirtyDay || "$0"),
        ninetyDay: String(parsed.economicConsequence?.ninetyDay || "$0"),
        yearDay: String(parsed.economicConsequence?.yearDay || "$0"),
      },
    };
  } catch {
    // Fall through to template
  }

  return generateTemplateBrief({
    orgName: ctx.orgName,
    competitorName: ctx.competitorName,
    movementType: ctx.movementType,
    headline: ctx.headline,
    details: ctx.details,
    metadata: ctx.metadata,
  });
}

// -- Template Fallback ------------------------------------------------------

interface TemplateBriefInput {
  orgName: string;
  competitorName: string;
  movementType: string;
  headline: string;
  details: string;
  metadata: Record<string, unknown>;
}

function generateTemplateBrief(input: TemplateBriefInput): CompetitiveIntelBrief {
  const { competitorName, movementType, metadata } = input;

  const monthlyRisk = Math.round(MONTHLY_SEARCH_REVENUE_ESTIMATE * POSITION_DROP_REVENUE_PERCENT);
  const ninetyDayRisk = monthlyRisk * 3;
  const yearRisk = monthlyRisk * 12;

  let threatLevel: ThreatLevel = "medium";
  let humanNeed: "safety" | "belonging" | "purpose" | "status" = "status";
  let brief: string;
  let recommendedResponse: string;

  switch (movementType) {
    case "competitor.reviews_surge": {
      const delta = Number(metadata.delta || 0);
      threatLevel = delta >= 15 ? "high" : delta >= 10 ? "medium" : "low";
      humanNeed = "status";
      brief =
        `${competitorName} added ${delta} reviews in a single week. ` +
        `This pace indicates an active review acquisition campaign, likely driven by ` +
        `a new marketing agency or systematic patient outreach program. ` +
        `This is a status threat: if the gap widens, GPs searching for referral partners ` +
        `will see ${competitorName} first.`;
      recommendedResponse =
        `Accelerate your review request cadence this week. ` +
        `Send review requests to your last 10 satisfied patients. ` +
        `Each review you gain narrows the gap before it compounds.`;
      break;
    }
    case "competitor.new_entrant": {
      threatLevel = "high";
      humanNeed = "belonging";
      brief =
        `A new competitor, ${competitorName}, has entered your top competitive set. ` +
        `They have ${metadata.new_reviews || "unknown"} reviews and displaced ` +
        `${metadata.displaced_competitor || "the previous #1"}. ` +
        `New entrants with strong review counts signal a well-funded or well-established ` +
        `practice expanding into your market. This is a belonging threat: your referral ` +
        `sources may discover an alternative.`;
      recommendedResponse =
        `Strengthen your GP relationships this week. A personal call or visit to your ` +
        `top 3 referring GPs reinforces loyalty before they notice the new option. ` +
        `Monitor this competitor's review velocity over the next 4 weeks.`;
      break;
    }
    case "competitor.went_inactive": {
      threatLevel = "low";
      humanNeed = "purpose";
      brief =
        `${competitorName} is no longer appearing in your competitive rankings or ` +
        `their review acquisition has stalled. This may indicate they closed, moved, ` +
        `or lost their listing. This is an opportunity: their patients and referral ` +
        `sources need a new home.`;
      recommendedResponse =
        `This is a window to capture market share. Increase your visibility in the ` +
        `areas this competitor served. Consider targeted outreach to GPs in their ` +
        `referral network.`;
      break;
    }
    default: {
      brief =
        `${competitorName} showed notable activity in your market this week. ` +
        `${input.details} Monitor this competitor over the next 2-3 weeks to determine ` +
        `if this is a one-time event or the start of a sustained campaign.`;
      recommendedResponse =
        `Review your current competitive position and ensure your review request ` +
        `cadence is consistent. Consistent effort compounds; sporadic effort doesn't.`;
    }
  }

  return {
    brief,
    threatLevel,
    recommendedResponse,
    humanNeed,
    economicConsequence: {
      thirtyDay: `$${monthlyRisk.toLocaleString()} at risk if position drops`,
      ninetyDay: `$${ninetyDayRisk.toLocaleString()} if trend continues unchecked`,
      yearDay: `$${yearRisk.toLocaleString()} structural market position shift`,
    },
  };
}

// -- Event Writer -----------------------------------------------------------

/**
 * Log a competitive intel brief to behavioral_events.
 * Called after analysis is complete.
 */
export async function logCompetitiveIntelEvent(
  orgId: number,
  brief: CompetitiveIntelBrief,
  competitorName: string,
): Promise<void> {
  try {
    await db("behavioral_events").insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "competitor.material_move",
      org_id: orgId,
      properties: JSON.stringify({
        brief: brief.brief,
        threat_level: brief.threatLevel,
        recommended_response: brief.recommendedResponse,
        human_need: brief.humanNeed,
        economic_consequence: brief.economicConsequence,
        competitor_name: competitorName,
      }),
      created_at: new Date(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[CompetitiveIntel] Failed to log event for org ${orgId}:`,
      message,
    );
  }
}
