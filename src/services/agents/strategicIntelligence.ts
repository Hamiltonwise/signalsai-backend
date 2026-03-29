/**
 * Strategic Intelligence Agent -- Execution Service
 *
 * Formerly M&A, now competitive landscape analysis.
 * Runs monthly (1st Monday 10 AM PT).
 *
 * Uses webFetch to monitor competitor websites, pricing pages,
 * and job postings. Identifies market positioning shifts, new entrants,
 * and feature launches.
 *
 * Uses Claude to generate strategic brief.
 * Writes "strategy.landscape_update" event.
 */

import { db } from "../../database/connection";
import { fetchPage } from "../webFetch";
import Anthropic from "@anthropic-ai/sdk";

// -- Types ------------------------------------------------------------------

interface CompetitorSnapshot {
  name: string;
  url: string;
  pricingUrl?: string;
  careersUrl?: string;
  pageContent?: string;
  pricingContent?: string;
  careersContent?: string;
  fetchedAt: string;
}

interface LandscapeSignal {
  competitor: string;
  signalType:
    | "pricing_change"
    | "new_feature"
    | "hiring_surge"
    | "positioning_shift"
    | "new_entrant"
    | "market_exit";
  headline: string;
  details: string;
  severity: "low" | "medium" | "high";
}

interface StrategicBrief {
  scannedAt: string;
  competitorsScanned: number;
  signals: LandscapeSignal[];
  executiveSummary: string;
  recommendations: string[];
}

// -- Constants --------------------------------------------------------------

const LLM_MODEL = process.env.MINDS_LLM_MODEL || "claude-sonnet-4-6";

/**
 * Competitors to monitor. These are business intelligence / practice
 * management analytics platforms in the specialist market.
 */
const COMPETITORS: Array<{
  name: string;
  url: string;
  pricingUrl?: string;
  careersUrl?: string;
}> = [
  {
    name: "Dental Intelligence",
    url: "https://www.dentalintel.com",
    pricingUrl: "https://www.dentalintel.com/pricing",
    careersUrl: "https://www.dentalintel.com/careers",
  },
  {
    name: "Jarvis Analytics",
    url: "https://www.jarvisanalytics.com",
    pricingUrl: "https://www.jarvisanalytics.com/pricing",
  },
  {
    name: "Dental Axess",
    url: "https://www.dentalaxess.com",
  },
  {
    name: "Practice by Numbers",
    url: "https://www.practicebynumbers.com",
    pricingUrl: "https://www.practicebynumbers.com/pricing",
  },
  {
    name: "Sikka Software",
    url: "https://www.sikkasoftware.com",
  },
];

let anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic | null {
  try {
    if (!anthropic) anthropic = new Anthropic();
    return anthropic;
  } catch {
    return null;
  }
}

// -- Core -------------------------------------------------------------------

/**
 * Run the monthly strategic intelligence scan.
 */
export async function runStrategicIntelligence(): Promise<StrategicBrief> {
  const snapshots: CompetitorSnapshot[] = [];

  // Fetch competitor pages
  for (const competitor of COMPETITORS) {
    const snapshot: CompetitorSnapshot = {
      name: competitor.name,
      url: competitor.url,
      pricingUrl: competitor.pricingUrl,
      careersUrl: competitor.careersUrl,
      fetchedAt: new Date().toISOString(),
    };

    // Fetch main page
    const mainResult = await fetchPage(competitor.url);
    if (mainResult.success && mainResult.html) {
      snapshot.pageContent = extractTextContent(mainResult.html).substring(
        0,
        3000
      );
    }

    // Fetch pricing page if available
    if (competitor.pricingUrl) {
      const pricingResult = await fetchPage(competitor.pricingUrl);
      if (pricingResult.success && pricingResult.html) {
        snapshot.pricingContent = extractTextContent(
          pricingResult.html
        ).substring(0, 2000);
      }
    }

    // Fetch careers page if available
    if (competitor.careersUrl) {
      const careersResult = await fetchPage(competitor.careersUrl);
      if (careersResult.success && careersResult.html) {
        snapshot.careersContent = extractTextContent(
          careersResult.html
        ).substring(0, 2000);
      }
    }

    snapshots.push(snapshot);
  }

  // Generate strategic brief
  const client = getAnthropic();
  const useAI = !!client && !!process.env.ANTHROPIC_API_KEY;

  let brief: StrategicBrief;

  if (useAI) {
    brief = await generateBriefWithClaude(client!, snapshots);
  } else {
    brief = generateKeywordBrief(snapshots);
  }

  // Write signals to behavioral_events
  await writeLandscapeEvent(brief);

  console.log(
    `[StrategicIntelligence] Scan complete: ${snapshots.length} competitors, ${brief.signals.length} signals`
  );

  return brief;
}

// -- Claude Brief -----------------------------------------------------------

async function generateBriefWithClaude(
  client: Anthropic,
  snapshots: CompetitorSnapshot[]
): Promise<StrategicBrief> {
  try {
    const snapshotSummary = snapshots
      .map((s) => {
        const parts = [`## ${s.name} (${s.url})`];
        if (s.pageContent)
          parts.push(`Main page excerpt:\n${s.pageContent.substring(0, 1500)}`);
        if (s.pricingContent)
          parts.push(
            `Pricing page excerpt:\n${s.pricingContent.substring(0, 1000)}`
          );
        if (s.careersContent)
          parts.push(
            `Careers page excerpt:\n${s.careersContent.substring(0, 1000)}`
          );
        if (!s.pageContent && !s.pricingContent && !s.careersContent)
          parts.push("(Page content not available)");
        return parts.join("\n");
      })
      .join("\n\n---\n\n");

    const response = await client.messages.create({
      model: LLM_MODEL,
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `You are a strategic intelligence analyst for Alloro, a universal business clarity platform targeting licensed specialists (initial beachhead: dental practices).

Analyze the following competitor website snapshots and produce a strategic brief.

${snapshotSummary}

Respond in this exact JSON format:
{
  "signals": [
    {
      "competitor": "Name",
      "signalType": "pricing_change|new_feature|hiring_surge|positioning_shift|new_entrant|market_exit",
      "headline": "One-line summary",
      "details": "2-3 sentences of analysis",
      "severity": "low|medium|high"
    }
  ],
  "executiveSummary": "3-5 sentence overview of the competitive landscape",
  "recommendations": ["Action item 1", "Action item 2"]
}

Rules:
- Only include signals where you see actual evidence in the page content
- If a page was not fetchable, note that as a gap, not a signal
- Focus on changes that affect Alloro's positioning
- Do not use em-dashes`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        scannedAt: new Date().toISOString(),
        competitorsScanned: snapshots.length,
        signals: parsed.signals || [],
        executiveSummary:
          parsed.executiveSummary || "Unable to generate summary.",
        recommendations: parsed.recommendations || [],
      };
    }
  } catch (err: any) {
    console.error(
      `[StrategicIntelligence] Claude brief generation failed:`,
      err.message
    );
  }

  // Fall back to keyword analysis
  return generateKeywordBrief(snapshots);
}

// -- Keyword Fallback -------------------------------------------------------

function generateKeywordBrief(
  snapshots: CompetitorSnapshot[]
): StrategicBrief {
  const signals: LandscapeSignal[] = [];

  for (const snapshot of snapshots) {
    const allContent = [
      snapshot.pageContent || "",
      snapshot.pricingContent || "",
      snapshot.careersContent || "",
    ]
      .join(" ")
      .toLowerCase();

    if (!allContent.trim()) {
      signals.push({
        competitor: snapshot.name,
        signalType: "market_exit",
        headline: `${snapshot.name} website not accessible`,
        details: `Could not fetch content from ${snapshot.url}. This may indicate a website change, outage, or market exit.`,
        severity: "low",
      });
      continue;
    }

    // Check for pricing indicators
    if (
      snapshot.pricingContent &&
      /(?:new|updated|changed|starting at|per month|annual)/i.test(
        snapshot.pricingContent
      )
    ) {
      signals.push({
        competitor: snapshot.name,
        signalType: "pricing_change",
        headline: `${snapshot.name} pricing page has active pricing content`,
        details: `Pricing page detected with active pricing language. Monitor for changes month over month.`,
        severity: "low",
      });
    }

    // Check for hiring signals
    if (
      snapshot.careersContent &&
      /(?:hiring|open position|join our team|we're growing|apply now)/i.test(
        snapshot.careersContent
      )
    ) {
      signals.push({
        competitor: snapshot.name,
        signalType: "hiring_surge",
        headline: `${snapshot.name} is actively hiring`,
        details: `Careers page indicates active hiring. This may signal expansion or new product development.`,
        severity: "medium",
      });
    }

    // Check for new feature indicators
    if (
      /(?:new feature|announcing|launch|introducing|now available|beta|coming soon)/i.test(
        allContent
      )
    ) {
      signals.push({
        competitor: snapshot.name,
        signalType: "new_feature",
        headline: `${snapshot.name} may have a new feature launch`,
        details: `Product announcement language detected on ${snapshot.name}'s website. Review for specific feature details.`,
        severity: "medium",
      });
    }

    // Check for AI/analytics positioning
    if (/(?:ai|artificial intelligence|machine learning|predictive|automated)/i.test(allContent)) {
      signals.push({
        competitor: snapshot.name,
        signalType: "positioning_shift",
        headline: `${snapshot.name} emphasizing AI capabilities`,
        details: `AI-related language found on ${snapshot.name}'s website. They may be positioning toward automated analytics.`,
        severity: "medium",
      });
    }
  }

  return {
    scannedAt: new Date().toISOString(),
    competitorsScanned: snapshots.length,
    signals,
    executiveSummary: `Scanned ${snapshots.length} competitors. Detected ${signals.length} signal(s) via keyword analysis. Claude API unavailable for deeper analysis.`,
    recommendations: [
      "Review competitor pricing pages manually for specific changes.",
      "Monitor competitor careers pages for engineering hiring patterns.",
    ],
  };
}

// -- Utilities --------------------------------------------------------------

/**
 * Strip HTML tags and extract text content from raw HTML.
 */
function extractTextContent(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// -- Writers ----------------------------------------------------------------

async function writeLandscapeEvent(brief: StrategicBrief): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "strategy.landscape_update",
      properties: JSON.stringify({
        scanned_at: brief.scannedAt,
        competitors_scanned: brief.competitorsScanned,
        signals_count: brief.signals.length,
        signals: brief.signals.map((s) => ({
          competitor: s.competitor,
          signal_type: s.signalType,
          headline: s.headline,
          severity: s.severity,
        })),
        executive_summary: brief.executiveSummary.substring(0, 1000),
        recommendations: brief.recommendations,
      }),
    });
  } catch (err: any) {
    console.error(
      `[StrategicIntelligence] Failed to write landscape event:`,
      err.message
    );
  }
}
