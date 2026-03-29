/**
 * Technology Horizon Agent -- Execution Service
 *
 * Runs daily at 6am PT.
 * Monitors AI company blogs and tech RSS feeds for capability changes
 * that affect what Alloro agents can do.
 *
 * Single filter: "Does this change what an Alloro agent can do,
 * reduce cost by 50%+, or eliminate a human dependency?"
 *
 * Writes signals to behavioral_events as "tech.horizon_signal".
 * Data-driven (keyword matching only). No AI calls.
 */

import { db } from "../../database/connection";
import { fetchRSS, RSSItem } from "../webFetch";

// ── Types ──────────────────────────────────────────────────────────

interface HorizonSignal {
  source: string;
  title: string;
  link: string;
  date: string;
  summary?: string;
  category: "model_release" | "api_change" | "capability" | "platform" | "ecosystem";
  relevanceScore: number;
  matchedKeywords: string[];
  recommendation: "adopt_now" | "pilot" | "watch" | "log";
}

interface HorizonSummary {
  scannedAt: string;
  sourcesChecked: number;
  sourcesSucceeded: number;
  itemsScanned: number;
  signalsDetected: number;
  byCategory: Record<string, number>;
}

// ── RSS Feed Sources ───────────────────────────────────────────────

const TECH_SOURCES: Array<{ name: string; url: string }> = [
  {
    name: "Anthropic Blog",
    url: "https://www.anthropic.com/rss.xml",
  },
  {
    name: "OpenAI Blog",
    url: "https://openai.com/blog/rss.xml",
  },
  {
    name: "Google AI Blog",
    url: "https://blog.google/technology/ai/rss/",
  },
  {
    name: "HuggingFace Blog",
    url: "https://huggingface.co/blog/feed.xml",
  },
  {
    name: "Vercel Blog",
    url: "https://vercel.com/atom",
  },
];

// ── Keyword Categories ─────────────────────────────────────────────

const MODEL_RELEASE_KEYWORDS = [
  "model release",
  "new model",
  "gpt-",
  "claude",
  "gemini",
  "llama",
  "sonnet",
  "opus",
  "haiku",
  "context window",
  "token limit",
  "benchmark",
  "model card",
];

const API_CHANGE_KEYWORDS = [
  "api update",
  "api change",
  "breaking change",
  "deprecation",
  "new endpoint",
  "rate limit",
  "pricing change",
  "mcp",
  "model context protocol",
  "tool use",
  "function calling",
];

const CAPABILITY_KEYWORDS = [
  "agent",
  "multi-agent",
  "rag",
  "retrieval",
  "fine-tuning",
  "fine tuning",
  "embedding",
  "vision",
  "multimodal",
  "reasoning",
  "code generation",
  "structured output",
  "json mode",
];

const PLATFORM_KEYWORDS = [
  "google business",
  "apple business",
  "local search",
  "maps api",
  "places api",
  "stripe",
  "billing api",
  "edge function",
  "serverless",
];

// ── Core ───────────────────────────────────────────────────────────

/**
 * Run the Technology Horizon scan across all tech RSS sources.
 */
export async function runTechnologyHorizon(): Promise<HorizonSummary> {
  let sourcesSucceeded = 0;
  let itemsScanned = 0;
  const allSignals: HorizonSignal[] = [];

  for (const source of TECH_SOURCES) {
    try {
      const result = await fetchRSS(source.url);

      if (!result.success || !result.items) {
        console.warn(
          `[TechnologyHorizon] Failed to fetch ${source.name}: ${result.error}`
        );
        continue;
      }

      sourcesSucceeded++;
      itemsScanned += result.items.length;

      // Filter to items from the last 48 hours
      const recentItems = filterRecentItems(result.items, 48);

      for (const item of recentItems) {
        const signal = classifyTechItem(item, source.name);
        if (signal) {
          allSignals.push(signal);
        }
      }
    } catch (err: any) {
      console.error(
        `[TechnologyHorizon] Error processing ${source.name}:`,
        err.message
      );
    }
  }

  // Write signals to behavioral_events
  for (const signal of allSignals) {
    await writeHorizonEvent(signal);
  }

  // Build category counts
  const byCategory: Record<string, number> = {};
  for (const signal of allSignals) {
    byCategory[signal.category] = (byCategory[signal.category] || 0) + 1;
  }

  const summary: HorizonSummary = {
    scannedAt: new Date().toISOString(),
    sourcesChecked: TECH_SOURCES.length,
    sourcesSucceeded,
    itemsScanned,
    signalsDetected: allSignals.length,
    byCategory,
  };

  // Write summary event
  await writeSummaryEvent(summary);

  console.log(
    `[TechnologyHorizon] Scan complete: ${summary.signalsDetected} signals from ${sourcesSucceeded}/${TECH_SOURCES.length} sources`
  );

  return summary;
}

// ── Classification ─────────────────────────────────────────────────

function classifyTechItem(
  item: RSSItem,
  sourceName: string
): HorizonSignal | null {
  const searchText = `${item.title} ${item.summary || ""}`.toLowerCase();
  const matchedKeywords: string[] = [];

  // Check each category
  let modelScore = 0;
  let apiScore = 0;
  let capabilityScore = 0;
  let platformScore = 0;

  for (const kw of MODEL_RELEASE_KEYWORDS) {
    if (searchText.includes(kw.toLowerCase())) {
      matchedKeywords.push(kw);
      modelScore++;
    }
  }
  for (const kw of API_CHANGE_KEYWORDS) {
    if (searchText.includes(kw.toLowerCase())) {
      matchedKeywords.push(kw);
      apiScore++;
    }
  }
  for (const kw of CAPABILITY_KEYWORDS) {
    if (searchText.includes(kw.toLowerCase())) {
      matchedKeywords.push(kw);
      capabilityScore++;
    }
  }
  for (const kw of PLATFORM_KEYWORDS) {
    if (searchText.includes(kw.toLowerCase())) {
      matchedKeywords.push(kw);
      platformScore++;
    }
  }

  // Must match at least one keyword
  if (matchedKeywords.length === 0) return null;

  // Determine primary category
  const scores = { model_release: modelScore, api_change: apiScore, capability: capabilityScore, platform: platformScore };
  const category = (Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0] as HorizonSignal["category"]) || "ecosystem";

  const relevanceScore = matchedKeywords.length;

  // Determine recommendation
  let recommendation: HorizonSignal["recommendation"];
  if (relevanceScore >= 4) {
    recommendation = "adopt_now";
  } else if (relevanceScore >= 3) {
    recommendation = "pilot";
  } else if (relevanceScore >= 2) {
    recommendation = "watch";
  } else {
    recommendation = "log";
  }

  return {
    source: sourceName,
    title: item.title,
    link: item.link,
    date: item.date,
    summary: item.summary,
    category,
    relevanceScore,
    matchedKeywords,
    recommendation,
  };
}

function filterRecentItems(items: RSSItem[], hoursBack: number): RSSItem[] {
  const cutoff = Date.now() - hoursBack * 60 * 60 * 1000;
  return items.filter((item) => {
    if (!item.date) return true;
    const itemDate = new Date(item.date).getTime();
    return !isNaN(itemDate) ? itemDate >= cutoff : true;
  });
}

// ── Writers ────────────────────────────────────────────────────────

async function writeHorizonEvent(signal: HorizonSignal): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "tech.horizon_signal",
      properties: JSON.stringify({
        source: signal.source,
        title: signal.title,
        link: signal.link,
        date: signal.date,
        category: signal.category,
        relevance_score: signal.relevanceScore,
        matched_keywords: signal.matchedKeywords,
        recommendation: signal.recommendation,
        summary: signal.summary?.substring(0, 500),
      }),
    });
  } catch (err: any) {
    console.error(
      `[TechnologyHorizon] Failed to write horizon event:`,
      err.message
    );
  }
}

async function writeSummaryEvent(summary: HorizonSummary): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "tech.horizon_summary",
      properties: JSON.stringify({
        scanned_at: summary.scannedAt,
        sources_checked: summary.sourcesChecked,
        sources_succeeded: summary.sourcesSucceeded,
        items_scanned: summary.itemsScanned,
        signals_detected: summary.signalsDetected,
        by_category: summary.byCategory,
      }),
    });
  } catch (err: any) {
    console.error(
      `[TechnologyHorizon] Failed to write summary event:`,
      err.message
    );
  }
}
