/**
 * CPA Personal Agent -- Execution Service
 *
 * Runs monthly (1st Monday 7 AM PT) + quarterly.
 * On-demand function that accepts financial data input.
 * Uses Claude to generate: QSBS clock status, entity optimization
 * recommendations, quarterly tax prep checklist.
 * Falls back to template checklists if no API key.
 *
 * Writes "personal.tax_brief" event with all outputs.
 */

import { db } from "../../database/connection";

// ── Types ───────────────────────────────────────────────────────────

interface QSBSStatus {
  issuanceDate: string;
  fiveYearExpiry: string;
  daysRemaining: number;
  daysElapsed: number;
  percentComplete: number;
  qualified: boolean;
  exclusionPerTaxpayer: string;
  totalExclusionCapacity: string;
  warnings: string[];
}

interface EntityRecommendation {
  entity: string;
  recommendation: string;
  ircSection: string;
  priority: "high" | "medium" | "low";
}

interface TaxChecklistItem {
  task: string;
  deadline: string;
  ircSection?: string;
  status: "pending" | "complete" | "not_applicable";
}

interface TaxBrief {
  qsbsStatus: QSBSStatus;
  entityRecommendations: EntityRecommendation[];
  quarterlyChecklist: TaxChecklistItem[];
  insights: TaxInsight[];
  generatedAt: string;
}

interface TaxInsight {
  headline: string;
  detail: string;
  ircSection: string;
  dollarConsequence: string;
  humanNeed: "safety" | "belonging" | "purpose" | "status";
}

interface FinancialDataInput {
  currentMRR?: number;
  currentValuation?: number;
  ownershipPercentage?: number;
  qualifyingTaxpayers?: number;
  recentEntityChanges?: string[];
  upcomingCPACall?: boolean;
}

// ── Constants ───────────────────────────────────────────────────────

const QSBS_ISSUANCE_DATE = new Date("2025-10-28");
const QSBS_FIVE_YEAR_EXPIRY = new Date("2030-10-28");
const QSBS_EXCLUSION_PER_TAXPAYER = 15_000_000; // $15M per OBBBA
const DEFAULT_QUALIFYING_TAXPAYERS = 5; // Corey + Lindsey + 3 trusts
const WYOMING_DOMICILE_DEADLINE = new Date("2027-12-31");

// ── Core ────────────────────────────────────────────────────────────

/**
 * Run the CPA Personal monthly/quarterly tax brief.
 * Accepts optional financial data input for richer analysis.
 */
export async function runCPAPersonalBrief(
  input?: FinancialDataInput,
): Promise<TaxBrief> {
  const qsbsStatus = calculateQSBSStatus();
  const entityRecommendations = generateEntityRecommendations(input);
  const quarterlyChecklist = generateQuarterlyChecklist();

  let insights: TaxInsight[];

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      insights = await synthesizeWithClaude(qsbsStatus, entityRecommendations, input);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[CPAPersonal] Claude synthesis failed, using templates:`,
        message,
      );
      insights = generateTemplateInsights(qsbsStatus, input);
    }
  } else {
    console.log("[CPAPersonal] No ANTHROPIC_API_KEY set, using template insights");
    insights = generateTemplateInsights(qsbsStatus, input);
  }

  const brief: TaxBrief = {
    qsbsStatus,
    entityRecommendations,
    quarterlyChecklist,
    insights,
    generatedAt: new Date().toISOString(),
  };

  // Write event
  await db("behavioral_events")
    .insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "personal.tax_brief",
      org_id: null,
      properties: JSON.stringify(brief),
      created_at: new Date(),
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[CPAPersonal] Failed to write tax brief event:`, message);
    });

  console.log(
    `[CPAPersonal] Tax brief complete. QSBS: ${qsbsStatus.daysRemaining} days remaining, ${qsbsStatus.percentComplete.toFixed(1)}% complete`,
  );

  return brief;
}

// ── QSBS Clock ──────────────────────────────────────────────────────

function calculateQSBSStatus(): QSBSStatus {
  const now = new Date();
  const totalDays = Math.ceil(
    (QSBS_FIVE_YEAR_EXPIRY.getTime() - QSBS_ISSUANCE_DATE.getTime()) /
      (1000 * 60 * 60 * 24),
  );
  const daysElapsed = Math.ceil(
    (now.getTime() - QSBS_ISSUANCE_DATE.getTime()) /
      (1000 * 60 * 60 * 24),
  );
  const daysRemaining = Math.max(0, totalDays - daysElapsed);
  const percentComplete = Math.min(100, (daysElapsed / totalDays) * 100);

  const warnings: string[] = [];

  // Check if we're past issuance
  if (now < QSBS_ISSUANCE_DATE) {
    warnings.push("QSBS clock has not started yet. Issuance date is October 28, 2025.");
  }

  // Wyoming domicile reminder
  const daysToWyomingDeadline = Math.ceil(
    (WYOMING_DOMICILE_DEADLINE.getTime() - now.getTime()) /
      (1000 * 60 * 60 * 24),
  );
  if (daysToWyomingDeadline < 365) {
    warnings.push(
      `Wyoming domicile deadline in ${daysToWyomingDeadline} days. Property acquisition should close by Q2 2027.`,
    );
  }

  return {
    issuanceDate: "2025-10-28",
    fiveYearExpiry: "2030-10-28",
    daysRemaining,
    daysElapsed: Math.max(0, daysElapsed),
    percentComplete,
    qualified: true, // Assumed qualified until a disqualifying event
    exclusionPerTaxpayer: `$${(QSBS_EXCLUSION_PER_TAXPAYER / 1_000_000).toFixed(0)}M`,
    totalExclusionCapacity: `$${((QSBS_EXCLUSION_PER_TAXPAYER * DEFAULT_QUALIFYING_TAXPAYERS) / 1_000_000).toFixed(0)}M`,
    warnings,
  };
}

// ── Entity Recommendations ──────────────────────────────────────────

function generateEntityRecommendations(
  input?: FinancialDataInput,
): EntityRecommendation[] {
  const recs: EntityRecommendation[] = [];

  // Trust stacking
  recs.push({
    entity: "Non-Grantor Trusts (3)",
    recommendation: "Verify all 3 non-grantor trusts are established and funded before any triggering exit event. Each trust is a separate QSBS taxpayer.",
    ircSection: "IRC 1202",
    priority: "high",
  });

  // Filing status
  recs.push({
    entity: "Filing Status (Corey + Lindsey)",
    recommendation: "Evaluate separate vs. joint filing annually. Separate filing preserves $15M QSBS exclusion each. Joint filing limits to $15M combined.",
    ircSection: "IRC 1202(a)",
    priority: "high",
  });

  // C-Corp maintenance
  recs.push({
    entity: "Alloro (Delaware C-Corp)",
    recommendation: "Maintain C-Corp status. Any S-Corp election disqualifies QSBS. Ensure gross assets remain under $50M at time of any new stock issuance.",
    ircSection: "IRC 1202(d)",
    priority: "high",
  });

  // Foundation
  recs.push({
    entity: "501(c)(3) Foundation",
    recommendation: "Plan foundation contributions of appreciated stock pre-exit when possible. Deduction up to 20% AGI for appreciated assets, 30% for cash.",
    ircSection: "IRC 170(b)",
    priority: "medium",
  });

  // Wyoming domicile
  recs.push({
    entity: "Wyoming Domicile",
    recommendation: "Establish domicile well before exit. Wyoming has 0% state income tax. Requirements: physical presence, driver's license, voter registration, primary residence.",
    ircSection: "State tax law",
    priority: "high",
  });

  return recs;
}

// ── Quarterly Checklist ─────────────────────────────────────────────

function generateQuarterlyChecklist(): TaxChecklistItem[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);

  const items: TaxChecklistItem[] = [];

  // Estimated tax payment
  const estTaxDeadlines: Record<number, string> = {
    1: `${currentYear}-04-15`,
    2: `${currentYear}-06-15`,
    3: `${currentYear}-09-15`,
    4: `${currentYear + 1}-01-15`,
  };

  items.push({
    task: `Q${currentQuarter} estimated tax payment`,
    deadline: estTaxDeadlines[currentQuarter] || "Check IRS schedule",
    ircSection: "IRC 6654",
    status: "pending",
  });

  // Delaware franchise tax
  items.push({
    task: "Delaware franchise tax and annual report",
    deadline: `${currentYear}-03-01`,
    ircSection: "Delaware Title 8",
    status: now.getMonth() >= 2 ? "complete" : "pending",
  });

  // QSBS active business test
  items.push({
    task: "Verify QSBS active business test (80%+ assets in active use)",
    deadline: "Quarterly review",
    ircSection: "IRC 1202(e)(1)",
    status: "pending",
  });

  // Foundation 990-PF
  items.push({
    task: "Foundation Form 990-PF preparation check",
    deadline: `${currentYear}-05-15`,
    ircSection: "IRC 6033",
    status: "pending",
  });

  // VetCert recertification
  items.push({
    task: "SDVOSB VetCert annual recertification status",
    deadline: "Annual (check SBA for exact date)",
    status: "pending",
  });

  // Wyoming domicile progress
  items.push({
    task: "Wyoming domicile establishment progress check",
    deadline: "Q4 2027 hard deadline",
    status: "pending",
  });

  return items;
}

// ── Claude Synthesis ────────────────────────────────────────────────

async function synthesizeWithClaude(
  qsbs: QSBSStatus,
  entityRecs: EntityRecommendation[],
  input?: FinancialDataInput,
): Promise<TaxInsight[]> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic();

  const valuationInfo = input?.currentValuation
    ? `Current valuation: $${input.currentValuation}. Ownership: ${input.ownershipPercentage || "unknown"}%.`
    : "Valuation data not provided.";

  const prompt = `You are the CPA Personal Agent for Alloro's founder. You provide tax strategy intelligence, not tax advice. Every recommendation must cite the IRC section.

QSBS STATUS:
- Days remaining: ${qsbs.daysRemaining}
- Percent complete: ${qsbs.percentComplete.toFixed(1)}%
- Exclusion per taxpayer: ${qsbs.exclusionPerTaxpayer} (OBBBA rules, never cite $10M)
- Total exclusion capacity: ${qsbs.totalExclusionCapacity} (${DEFAULT_QUALIFYING_TAXPAYERS} taxpayers)
- Warnings: ${qsbs.warnings.length > 0 ? qsbs.warnings.join("; ") : "None"}

ENTITY STRUCTURE:
${entityRecs.map((r) => `- ${r.entity}: ${r.recommendation} (${r.ircSection})`).join("\n")}

FINANCIAL DATA:
${valuationInfo}
MRR: ${input?.currentMRR ? `$${input.currentMRR}` : "Not provided"}

IMPORTANT: Never use em-dashes. Use commas or periods instead. Every recommendation must cite the IRC section.

Return a JSON array of exactly 3 tax insights. Each must have:
- headline: one sentence, specific
- detail: 2-3 sentences with IRC citations
- ircSection: the primary IRC section referenced
- dollarConsequence: the dollar cost of getting this wrong
- humanNeed: one of "safety", "belonging", "purpose", "status"

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
        ircSection: String(f.ircSection || ""),
        dollarConsequence: String(f.dollarConsequence || "$0"),
        humanNeed: f.humanNeed || "safety",
      }));
    }
  } catch {
    // Fall through to template
  }

  return generateTemplateInsights(qsbs, input);
}

// ── Template Insights (fallback) ────────────────────────────────────

function generateTemplateInsights(
  qsbs: QSBSStatus,
  input?: FinancialDataInput,
): TaxInsight[] {
  const insights: TaxInsight[] = [];

  // QSBS clock status
  insights.push({
    headline: `QSBS clock: ${qsbs.daysRemaining} days remaining (${qsbs.percentComplete.toFixed(1)}% complete)`,
    detail: `5-year holding period started ${qsbs.issuanceDate}, expires ${qsbs.fiveYearExpiry}. ${qsbs.totalExclusionCapacity} total exclusion capacity across ${DEFAULT_QUALIFYING_TAXPAYERS} taxpayers under IRC 1202 with OBBBA rules ($15M per taxpayer). Any disqualifying event resets the clock.`,
    ircSection: "IRC 1202",
    dollarConsequence: `Up to $15M-$20M in lost federal tax exclusion per disqualification event`,
    humanNeed: "safety",
  });

  // Filing strategy
  insights.push({
    headline: "Separate filing preserves maximum QSBS exclusion capacity",
    detail: `Under IRC 1202(a), married filing separately allows $15M exclusion per spouse. Joint filing limits to $15M combined. The delta grows with exit valuation. Confirm with Breinig before filing season.`,
    ircSection: "IRC 1202(a)",
    dollarConsequence: `$15M additional exclusion from separate filing ($2.25M-$3.57M tax savings at exit)`,
    humanNeed: "safety",
  });

  // Wyoming domicile
  const now = new Date();
  const daysToDeadline = Math.ceil(
    (WYOMING_DOMICILE_DEADLINE.getTime() - now.getTime()) /
      (1000 * 60 * 60 * 24),
  );
  insights.push({
    headline: `Wyoming domicile: ${daysToDeadline} days to Q4 2027 deadline`,
    detail: `Wyoming has 0% state income tax. Domicile must be established well before exit to withstand audit. Requirements: physical presence, voter registration, driver's license, primary residence. Property acquisition should close by Q2 2027.`,
    ircSection: "State tax law (no IRC section, state-specific)",
    dollarConsequence: `State capital gains tax on entire exit proceeds if domicile not established`,
    humanNeed: "safety",
  });

  return insights;
}
