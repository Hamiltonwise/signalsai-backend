/**
 * Intelligence Agent -- Execution Service
 *
 * Runs daily at 5 AM PT. For each org with ranking data, queries
 * weekly_ranking_snapshots, behavioral_events, and referral_sources.
 * Produces 3 findings with the biological-economic lens (human need
 * + dollar consequence). Uses Claude API to synthesize findings from
 * raw data, falling back to template findings if ANTHROPIC_API_KEY
 * is not set.
 *
 * Writes findings to behavioral_events as "intelligence.finding".
 */

import { db } from "../../database/connection";
import {
  prepareAgentContext,
  recordAgentAction,
  closeLoop,
  type RuntimeContext,
} from "./agentRuntime";

// ── Types ───────────────────────────────────────────────────────────

interface IntelligenceFinding {
  headline: string;
  detail: string;
  humanNeed: "safety" | "belonging" | "purpose" | "status";
  economicConsequence: {
    thirtyDay: string;
    ninetyDay: string;
    yearDay: string;
  };
}

interface IntelligenceSummary {
  orgId: number;
  orgName: string;
  findings: IntelligenceFinding[];
  generatedAt: string;
}

// ── Case value defaults ─────────────────────────────────────────────

const DEFAULT_CASE_VALUE = 500; // Universal fallback, overridden by vocabulary lookup

// ── Core ────────────────────────────────────────────────────────────

/**
 * Run Intelligence Agent for a single org.
 * Returns up to 3 findings with the biological-economic lens.
 */
export async function runIntelligenceForOrg(
  orgId: number,
): Promise<IntelligenceSummary | null> {
  const agentCtx = { agentName: "intelligence_agent", orgId, topic: "intelligence_findings" };

  // Prepare runtime context (events, heuristics, orchestrator check)
  const runtime = await prepareAgentContext(agentCtx);

  if (!runtime.orchestratorApproval.allowed) {
    console.log(
      `[IntelligenceAgent] Blocked by orchestrator for org ${orgId}: ${runtime.orchestratorApproval.reason}`,
    );
    return null;
  }

  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) return null;

  // Gather raw data
  const snapshots = await db("weekly_ranking_snapshots")
    .where({ org_id: orgId })
    .orderBy("week_start", "desc")
    .limit(4);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentEvents = await db("behavioral_events")
    .where({ org_id: orgId })
    .where("created_at", ">=", sevenDaysAgo)
    .orderBy("created_at", "desc")
    .limit(50);

  const referralSources = await db("referral_sources")
    .where({ org_id: orgId })
    .orderBy("updated_at", "desc")
    .limit(20);

  // Build context for synthesis
  const context = await buildContext(org, snapshots, recentEvents, referralSources);

  // Attempt Claude synthesis (with heuristics injected), fall back to template findings
  let findings: IntelligenceFinding[];

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      findings = await synthesizeWithClaude(context, runtime);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[IntelligenceAgent] Claude synthesis failed for org ${orgId}, using templates:`,
        message,
      );
      findings = generateTemplateFindings(context);
    }
  } else {
    console.log(
      "[IntelligenceAgent] No ANTHROPIC_API_KEY set, using template findings",
    );
    findings = generateTemplateFindings(context);
  }

  // Write findings to behavioral_events
  for (const finding of findings) {
    await db("behavioral_events")
      .insert({
        id: db.raw("gen_random_uuid()"),
        event_type: "intelligence.finding",
        org_id: orgId,
        properties: JSON.stringify({
          headline: finding.headline,
          detail: finding.detail,
          humanNeed: finding.humanNeed,
          economicConsequence: finding.economicConsequence,
        }),
        created_at: new Date(),
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[IntelligenceAgent] Failed to write finding for org ${orgId}:`,
          message,
        );
      });
  }

  const summary: IntelligenceSummary = {
    orgId,
    orgName: org.name,
    findings,
    generatedAt: new Date().toISOString(),
  };

  // Record the agent action
  await recordAgentAction(agentCtx, {
    type: "findings_produced",
    headline: `${findings.length} finding(s) produced for ${org.name}`,
    detail: findings.map((f) => f.headline).join("; "),
    humanNeed: findings[0]?.humanNeed,
    economicConsequence: findings[0]?.economicConsequence?.thirtyDay,
  });

  // Close the loop
  await closeLoop(agentCtx, {
    expected: "Produce 3 intelligence findings with biological-economic lens",
    actual: `${findings.length} finding(s) produced for ${org.name}`,
    success: findings.length > 0,
    learning:
      findings.length < 3
        ? `Only produced ${findings.length}/3 findings, may need more data`
        : undefined,
  });

  console.log(
    `[IntelligenceAgent] ${org.name}: ${findings.length} finding(s) produced`,
  );
  return summary;
}

/**
 * Run Intelligence Agent for ALL orgs with ranking data.
 */
export async function runIntelligenceForAll(): Promise<{
  scanned: number;
  totalFindings: number;
}> {
  const orgIds = await db("weekly_ranking_snapshots")
    .select("org_id")
    .groupBy("org_id")
    .havingRaw("count(*) >= 1");

  let scanned = 0;
  let totalFindings = 0;

  for (const row of orgIds) {
    try {
      const summary = await runIntelligenceForOrg(row.org_id);
      if (summary) {
        scanned++;
        totalFindings += summary.findings.length;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[IntelligenceAgent] Failed for org ${row.org_id}:`,
        message,
      );
    }
  }

  console.log(
    `[IntelligenceAgent] Scanned ${scanned} orgs, ${totalFindings} total findings`,
  );
  return { scanned, totalFindings };
}

// ── Context Builder ─────────────────────────────────────────────────

interface OrgContext {
  orgName: string;
  orgId: number;
  snapshotSummary: string;
  eventSummary: string;
  referralSummary: string;
  caseValue: number;
}

async function buildContext(
  org: any,
  snapshots: any[],
  events: any[],
  referralSources: any[],
): Promise<OrgContext> {
  const snapshotLines = snapshots.map((s: any) => {
    return `Week ${s.week_start}: position #${s.client_position ?? "N/A"}, reviews ${s.client_review_count ?? 0}, competitor ${s.competitor_name ?? "none"} at ${s.competitor_review_count ?? 0} reviews`;
  });

  const eventTypes: Record<string, number> = {};
  for (const e of events) {
    const t = e.event_type || "unknown";
    eventTypes[t] = (eventTypes[t] || 0) + 1;
  }
  const eventLines = Object.entries(eventTypes).map(
    ([type, count]) => `${type}: ${count}`,
  );

  const referralLines = referralSources.slice(0, 5).map((r: any) => {
    return `${r.source_name || "Unknown"}: ${r.referral_count ?? 0} referrals`;
  });

  // Look up avgCaseValue from vocabulary config for the org's vertical
  let caseValue = DEFAULT_CASE_VALUE;
  try {
    const config = await db("vocabulary_configs").where({ org_id: org.id }).first();
    if (config?.vertical) {
      const defaults = await db("vocabulary_defaults").where({ vertical: config.vertical }).first();
      if (defaults?.config) {
        const parsed = typeof defaults.config === "string" ? JSON.parse(defaults.config) : defaults.config;
        if (parsed.avgCaseValue) caseValue = parsed.avgCaseValue;
      }
    }
  } catch {
    // Fall through to default
  }

  return {
    orgName: org.name,
    orgId: org.id,
    snapshotSummary: snapshotLines.join("\n") || "No ranking snapshots",
    eventSummary: eventLines.join(", ") || "No recent events",
    referralSummary: referralLines.join("\n") || "No referral sources",
    caseValue,
  };
}

// ── Claude Synthesis ────────────────────────────────────────────────

async function synthesizeWithClaude(
  context: OrgContext,
  runtime?: RuntimeContext,
): Promise<IntelligenceFinding[]> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic();

  // Build heuristic guidance section from Knowledge Bridge
  let heuristicSection = "";
  if (runtime?.heuristics && runtime.heuristics.length > 0) {
    heuristicSection = `

KNOWLEDGE LATTICE HEURISTICS (apply these lenses to your analysis):
${runtime.heuristics.map((h, i) => `${i + 1}. ${h}`).join("\n")}
`;
  }

  const prompt = `You are the Intelligence Agent for Alloro, a business clarity platform for local service businesses.

Analyze this data for ${context.orgName} and produce exactly 3 findings. Each finding must pass the biological-economic lens: identify which core human need is threatened (safety, belonging, purpose, or status) and the dollar consequence at 30, 90, and 365 days.

Case value per referral: $${context.caseValue}

RANKING DATA:
${context.snapshotSummary}

RECENT EVENTS (last 7 days):
${context.eventSummary}

REFERRAL SOURCES:
${context.referralSummary}
${heuristicSection}
Return a JSON array of exactly 3 findings. Each finding must have:
- headline: one sentence, specific and data-backed
- detail: 2-3 sentences with context and recommended action
- humanNeed: one of "safety", "belonging", "purpose", "status"
- economicConsequence: object with thirtyDay, ninetyDay, yearDay strings (dollar figures)

Important: never use em-dashes. Use commas or periods instead.

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

  return generateTemplateFindings(context);
}

// ── Template Findings (fallback) ────────────────────────────────────

function generateTemplateFindings(context: OrgContext): IntelligenceFinding[] {
  const findings: IntelligenceFinding[] = [];

  // Finding 1: Ranking position
  findings.push({
    headline: `${context.orgName} ranking data available for review`,
    detail: `Your latest ranking snapshots show activity in your market. Review your position relative to competitors and identify opportunities to improve visibility. Focus on the lever that moves the most revenue.`,
    humanNeed: "safety",
    economicConsequence: {
      thirtyDay: `$${context.caseValue} per missed referral this month`,
      ninetyDay: `$${context.caseValue * 3} if trend continues over 3 months`,
      yearDay: `$${context.caseValue * 12} annual revenue at risk from lost position`,
    },
  });

  // Finding 2: Engagement
  findings.push({
    headline: `Weekly engagement summary for ${context.orgName}`,
    detail: `Recent activity: ${context.eventSummary}. Consistent engagement with the platform correlates with faster identification of market shifts and referral drift.`,
    humanNeed: "purpose",
    economicConsequence: {
      thirtyDay: `Engaged practices catch revenue threats 2-3 weeks faster`,
      ninetyDay: `$${context.caseValue * 4} protected through early detection`,
      yearDay: `$${context.caseValue * 15} in compounded early-detection value`,
    },
  });

  // Finding 3: Referral network
  findings.push({
    headline: `Referral network status for ${context.orgName}`,
    detail: `${context.referralSummary}. Monitor referral velocity weekly. A GP who stops referring without explanation is a belonging signal, not random variation. The window to act is typically 30 days.`,
    humanNeed: "belonging",
    economicConsequence: {
      thirtyDay: `$${context.caseValue * 2} if one GP drifts this month`,
      ninetyDay: `$${context.caseValue * 8} if drift becomes permanent`,
      yearDay: `$${context.caseValue * 24} annual from one lost referral relationship`,
    },
  });

  return findings;
}
