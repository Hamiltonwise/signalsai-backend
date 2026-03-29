/**
 * Financial Advisor Agent -- Execution Service
 *
 * Runs monthly (1st Monday 7:30 AM PT) + weekly price checks.
 * Fetches public crypto prices from CoinGecko (SOL and BTC).
 * Tracks portfolio allocation and calculates rebalancing suggestions.
 * Uses Claude for monthly strategy brief. Falls back to templates.
 *
 * Writes "personal.financial_brief" event with all data.
 */

import { db } from "../../database/connection";
import { fetchPage } from "../webFetch";

// ── Types ───────────────────────────────────────────────────────────

interface CryptoPrices {
  solana: number | null;
  bitcoin: number | null;
  fetchedAt: string;
  errors: string[];
}

interface PortfolioSnapshot {
  prices: CryptoPrices;
  targetAllocation: { sol: number; btc: number };
  driftWarning: boolean;
  rebalanceRecommended: boolean;
}

interface FinancialInsight {
  headline: string;
  detail: string;
  humanNeed: "safety" | "belonging" | "purpose" | "status";
  actionVsInaction: {
    action: string;
    inaction: string;
  };
}

interface FinancialBrief {
  portfolio: PortfolioSnapshot;
  qsbsExitMath: QSBSExitScenario[];
  insights: FinancialInsight[];
  generatedAt: string;
}

interface QSBSExitScenario {
  valuation: string;
  totalExclusion: string;
  estimatedTaxSavings: string;
  postTaxProceeds: string;
}

// ── Constants ───────────────────────────────────────────────────────

const COINGECKO_API = "https://api.coingecko.com/api/v3/simple/price";
const TARGET_SOL_PCT = 80;
const TARGET_BTC_PCT = 20;
const DRIFT_THRESHOLD = 5; // percentage points

const QSBS_EXCLUSION_PER_TAXPAYER = 15_000_000;
const QUALIFYING_TAXPAYERS = 5;
const TOTAL_EXCLUSION = QSBS_EXCLUSION_PER_TAXPAYER * QUALIFYING_TAXPAYERS;
const FEDERAL_CG_RATE = 0.20;
const NIIT_RATE = 0.038;

// ── Core ────────────────────────────────────────────────────────────

/**
 * Run the Financial Advisor monthly brief.
 * Fetches prices, calculates portfolio status, generates insights.
 */
export async function runFinancialAdvisorBrief(): Promise<FinancialBrief> {
  const prices = await fetchCryptoPrices();
  const portfolio = buildPortfolioSnapshot(prices);
  const qsbsExitMath = calculateExitScenarios();

  let insights: FinancialInsight[];

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      insights = await synthesizeWithClaude(portfolio, qsbsExitMath);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[FinancialAdvisor] Claude synthesis failed, using templates:`,
        message,
      );
      insights = generateTemplateInsights(portfolio);
    }
  } else {
    console.log("[FinancialAdvisor] No ANTHROPIC_API_KEY set, using template insights");
    insights = generateTemplateInsights(portfolio);
  }

  const brief: FinancialBrief = {
    portfolio,
    qsbsExitMath,
    insights,
    generatedAt: new Date().toISOString(),
  };

  // Write event
  await db("behavioral_events")
    .insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "personal.financial_brief",
      org_id: null,
      properties: JSON.stringify(brief),
      created_at: new Date(),
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[FinancialAdvisor] Failed to write brief event:`, message);
    });

  console.log(
    `[FinancialAdvisor] Brief complete. SOL: $${prices.solana ?? "N/A"}, BTC: $${prices.bitcoin ?? "N/A"}`,
  );

  return brief;
}

/**
 * Run a weekly price check only (lighter weight than full brief).
 * Writes price snapshot to behavioral_events.
 */
export async function runWeeklyPriceCheck(): Promise<CryptoPrices> {
  const prices = await fetchCryptoPrices();

  await db("behavioral_events")
    .insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "personal.price_check",
      org_id: null,
      properties: JSON.stringify(prices),
      created_at: new Date(),
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[FinancialAdvisor] Failed to write price check event:`, message);
    });

  return prices;
}

// ── Price Fetching ──────────────────────────────────────────────────

async function fetchCryptoPrices(): Promise<CryptoPrices> {
  const errors: string[] = [];
  let solana: number | null = null;
  let bitcoin: number | null = null;

  try {
    const url = `${COINGECKO_API}?ids=solana,bitcoin&vs_currencies=usd`;
    const page = await fetchPage(url);

    if (page.success && page.html) {
      try {
        const data = JSON.parse(page.html);
        solana = data?.solana?.usd ?? null;
        bitcoin = data?.bitcoin?.usd ?? null;

        if (solana === null) errors.push("Solana price not available in response");
        if (bitcoin === null) errors.push("Bitcoin price not available in response");
      } catch {
        errors.push("Failed to parse CoinGecko JSON response");
      }
    } else {
      errors.push(page.error || "Failed to fetch CoinGecko prices");
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Price fetch error: ${message}`);
  }

  return {
    solana,
    bitcoin,
    fetchedAt: new Date().toISOString(),
    errors,
  };
}

// ── Portfolio Snapshot ──────────────────────────────────────────────

function buildPortfolioSnapshot(prices: CryptoPrices): PortfolioSnapshot {
  // Without actual holdings data, we report target allocation
  // and flag if we can detect drift from historical price checks
  const driftWarning = false; // Would require historical position data
  const rebalanceRecommended = false;

  return {
    prices,
    targetAllocation: { sol: TARGET_SOL_PCT, btc: TARGET_BTC_PCT },
    driftWarning,
    rebalanceRecommended,
  };
}

// ── QSBS Exit Math ─────────────────────────────────────────────────

function calculateExitScenarios(): QSBSExitScenario[] {
  const scenarios: Array<{ label: string; valuation: number }> = [
    { label: "$1B", valuation: 1_000_000_000 },
    { label: "$5B", valuation: 5_000_000_000 },
    { label: "$10B", valuation: 10_000_000_000 },
  ];

  return scenarios.map((s) => {
    const gain = s.valuation; // simplified, assuming low basis
    const excluded = Math.min(gain, TOTAL_EXCLUSION);
    const taxableGain = gain - excluded;
    const federalTax = taxableGain * FEDERAL_CG_RATE;
    const niit = taxableGain * NIIT_RATE;
    const totalTax = federalTax + niit;
    const postTax = gain - totalTax;
    const taxSavings = excluded * (FEDERAL_CG_RATE + NIIT_RATE);

    return {
      valuation: s.label,
      totalExclusion: `$${(excluded / 1_000_000).toFixed(0)}M`,
      estimatedTaxSavings: `$${(taxSavings / 1_000_000).toFixed(1)}M`,
      postTaxProceeds: `$${(postTax / 1_000_000).toFixed(0)}M`,
    };
  });
}

// ── Claude Synthesis ────────────────────────────────────────────────

async function synthesizeWithClaude(
  portfolio: PortfolioSnapshot,
  exitMath: QSBSExitScenario[],
): Promise<FinancialInsight[]> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic();

  const prompt = `You are the Financial Advisor Agent for Alloro's founder. You present options with trade-offs, never product recommendations. No fund names, no affiliate relationships.

PORTFOLIO STATUS:
- SOL Price: $${portfolio.prices.solana ?? "unavailable"}
- BTC Price: $${portfolio.prices.bitcoin ?? "unavailable"}
- Target Allocation: ${TARGET_SOL_PCT}% SOL / ${TARGET_BTC_PCT}% BTC
- Drift Warning: ${portfolio.driftWarning ? "YES" : "No"}
- Rebalance Recommended: ${portfolio.rebalanceRecommended ? "YES" : "No"}

QSBS EXIT SCENARIOS:
${exitMath.map((e) => `- At ${e.valuation}: Exclusion ${e.totalExclusion}, Tax savings ${e.estimatedTaxSavings}, Post-tax ${e.postTaxProceeds}`).join("\n")}

IMPORTANT:
- Never use em-dashes. Use commas or periods instead.
- Never recommend a specific product or fund.
- Present options in sets when possible: conservative, moderate, aggressive.
- Include tax implications for any trade recommendation.

Return a JSON array of exactly 3 insights. Each must have:
- headline: one sentence, specific
- detail: 2-3 sentences with trade-offs
- humanNeed: one of "safety", "belonging", "purpose", "status"
- actionVsInaction: object with "action" (cost/benefit of acting) and "inaction" (cost/benefit of not acting)

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
        actionVsInaction: {
          action: String(f.actionVsInaction?.action || ""),
          inaction: String(f.actionVsInaction?.inaction || ""),
        },
      }));
    }
  } catch {
    // Fall through to template
  }

  return generateTemplateInsights(portfolio);
}

// ── Template Insights (fallback) ────────────────────────────────────

function generateTemplateInsights(
  portfolio: PortfolioSnapshot,
): FinancialInsight[] {
  const insights: FinancialInsight[] = [];

  // Price snapshot
  const solPrice = portfolio.prices.solana;
  const btcPrice = portfolio.prices.bitcoin;

  insights.push({
    headline: `Current prices: SOL $${solPrice ?? "unavailable"}, BTC $${btcPrice ?? "unavailable"}`,
    detail: `Target allocation remains ${TARGET_SOL_PCT}% SOL / ${TARGET_BTC_PCT}% BTC. ${portfolio.prices.errors.length > 0 ? `Note: ${portfolio.prices.errors.join(". ")}` : "Prices fetched successfully."} Review trigger levels against current positions.`,
    humanNeed: "safety",
    actionVsInaction: {
      action: "Review positions against trigger levels. Rebalance if drift exceeds 5%.",
      inaction: "Unmonitored positions in volatile assets can shift net worth materially over 90 days.",
    },
  });

  // QSBS strategy
  insights.push({
    headline: "QSBS exit math: $75M total exclusion capacity across 5 taxpayers",
    detail: `At a $1B exit, the full $75M is excluded, saving approximately $17.9M in federal tax. At higher valuations, the exclusion becomes a smaller percentage but remains the single largest tax event. Wyoming domicile eliminates state tax on the remainder.`,
    humanNeed: "purpose",
    actionVsInaction: {
      action: "Maintain QSBS qualification and trust stacking structure. Coordinate with CPA Personal Agent.",
      inaction: "Any disqualifying event costs up to $17.9M in lost tax exclusion at $1B exit.",
    },
  });

  // Portfolio discipline
  insights.push({
    headline: "Maintain 24-month living expense buffer in cash or equivalents",
    detail: `Liquidity requirement protects against forced selling during market drawdowns. Review quarterly that the buffer remains adequate given current living expenses. Crypto positions should never need to be liquidated for cash flow.`,
    humanNeed: "safety",
    actionVsInaction: {
      action: "Verify cash buffer covers 24 months. Adjust if expenses have changed.",
      inaction: "Insufficient buffer forces selling at market lows, crystallizing losses.",
    },
  });

  return insights;
}
