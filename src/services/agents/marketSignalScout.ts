/**
 * Market Signal Scout Agent -- Execution Service
 *
 * Runs daily at 6am PT.
 * Monitors RSS feeds from key sources for signals relevant to Alloro.
 * Classifies relevance via keyword matching, writes relevant signals
 * to behavioral_events as "market.signal_detected".
 *
 * Data-driven (keyword matching only). No AI calls.
 */

import { db } from "../../database/connection";
import { fetchRSS, RSSItem } from "../webFetch";

// ── Types ──────────────────────────────────────────────────────────

interface MarketSignal {
  source: string;
  title: string;
  link: string;
  date: string;
  summary?: string;
  relevanceScore: number;
  matchedKeywords: string[];
  tier: "P0" | "P1" | "discard";
}

interface ScoutSummary {
  scannedAt: string;
  sourcesChecked: number;
  sourcesSucceeded: number;
  itemsScanned: number;
  signalsDetected: number;
  p0Signals: number;
  p1Signals: number;
}

// ── RSS Feed Sources ───────────────────────────────────────────────

const RSS_SOURCES: Array<{ name: string; url: string; tier: number }> = [
  {
    name: "Google Search Central Blog",
    url: "https://developers.google.com/search/blog/rss",
    tier: 1,
  },
  {
    name: "SearchEngineLand",
    url: "https://searchengineland.com/feed",
    tier: 3,
  },
  {
    name: "Anthropic Blog",
    url: "https://www.anthropic.com/rss.xml",
    tier: 1,
  },
  {
    name: "TechCrunch AI",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    tier: 2,
  },
  {
    name: "Becker's Dental Review",
    url: "https://www.beckersdental.com/rss.html",
    tier: 3,
  },
];

// ── Relevance Keywords (weighted) ──────────────────────────────────

// P0 keywords: changes that rewrite the rules for Alloro clients
const P0_KEYWORDS = [
  "local search update",
  "local pack",
  "google business profile",
  "apple business",
  "apple maps",
  "business profile api",
  "local seo algorithm",
  "ai overview",
  "search generative experience",
];

// P1 keywords: generally relevant to Alloro market
const P1_KEYWORDS = [
  "local search",
  "reviews",
  "business intelligence",
  "healthcare tech",
  "practice management",
  "dental",
  "specialist",
  "referral",
  "small business",
  "ai search",
  "answer engine",
  "structured data",
  "schema markup",
  "google maps",
  "yelp",
  "reputation management",
  "patient acquisition",
  "medical marketing",
  "saas growth",
  "product-led growth",
];

// ── Core ───────────────────────────────────────────────────────────

/**
 * Run the Market Signal Scout across all RSS sources.
 */
export async function runMarketSignalScout(): Promise<ScoutSummary> {
  let sourcesSucceeded = 0;
  let itemsScanned = 0;
  const allSignals: MarketSignal[] = [];

  for (const source of RSS_SOURCES) {
    try {
      const result = await fetchRSS(source.url);

      if (!result.success || !result.items) {
        console.warn(
          `[MarketSignalScout] Failed to fetch ${source.name}: ${result.error}`
        );
        continue;
      }

      sourcesSucceeded++;
      itemsScanned += result.items.length;

      // Filter to items from the last 48 hours (catch weekend gaps)
      const recentItems = filterRecentItems(result.items, 48);

      for (const item of recentItems) {
        const signal = classifyItem(item, source.name, source.tier);
        if (signal.tier !== "discard") {
          allSignals.push(signal);
        }
      }
    } catch (err: any) {
      console.error(
        `[MarketSignalScout] Error processing ${source.name}:`,
        err.message
      );
    }
  }

  // Write signals to behavioral_events
  for (const signal of allSignals) {
    await writeSignalEvent(signal);
  }

  const summary: ScoutSummary = {
    scannedAt: new Date().toISOString(),
    sourcesChecked: RSS_SOURCES.length,
    sourcesSucceeded,
    itemsScanned,
    signalsDetected: allSignals.length,
    p0Signals: allSignals.filter((s) => s.tier === "P0").length,
    p1Signals: allSignals.filter((s) => s.tier === "P1").length,
  };

  // Write summary event
  await writeSummaryEvent(summary);

  console.log(
    `[MarketSignalScout] Scan complete: ${summary.signalsDetected} signals (${summary.p0Signals} P0, ${summary.p1Signals} P1) from ${sourcesSucceeded}/${RSS_SOURCES.length} sources`
  );

  return summary;
}

// ── Classification ─────────────────────────────────────────────────

function classifyItem(
  item: RSSItem,
  sourceName: string,
  sourceTier: number
): MarketSignal {
  const searchText = `${item.title} ${item.summary || ""}`.toLowerCase();
  const matchedKeywords: string[] = [];
  let isP0 = false;

  // Check P0 keywords first
  for (const keyword of P0_KEYWORDS) {
    if (searchText.includes(keyword.toLowerCase())) {
      matchedKeywords.push(keyword);
      isP0 = true;
    }
  }

  // Check P1 keywords
  for (const keyword of P1_KEYWORDS) {
    if (searchText.includes(keyword.toLowerCase())) {
      matchedKeywords.push(keyword);
    }
  }

  // Calculate relevance score: keyword count * source tier weight
  const tierWeight = sourceTier === 1 ? 3 : sourceTier === 2 ? 2 : 1;
  const relevanceScore = matchedKeywords.length * tierWeight;

  // Determine tier
  let tier: "P0" | "P1" | "discard";
  if (isP0 && sourceTier <= 2) {
    tier = "P0";
  } else if (matchedKeywords.length >= 2 || (matchedKeywords.length >= 1 && sourceTier === 1)) {
    tier = "P1";
  } else {
    tier = "discard";
  }

  return {
    source: sourceName,
    title: item.title,
    link: item.link,
    date: item.date,
    summary: item.summary,
    relevanceScore,
    matchedKeywords,
    tier,
  };
}

function filterRecentItems(items: RSSItem[], hoursBack: number): RSSItem[] {
  const cutoff = Date.now() - hoursBack * 60 * 60 * 1000;

  return items.filter((item) => {
    if (!item.date) return true; // Include items with no date (assume recent)
    const itemDate = new Date(item.date).getTime();
    return !isNaN(itemDate) ? itemDate >= cutoff : true;
  });
}

// ── Writers ────────────────────────────────────────────────────────

async function writeSignalEvent(signal: MarketSignal): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "market.signal_detected",
      properties: JSON.stringify({
        source: signal.source,
        title: signal.title,
        link: signal.link,
        date: signal.date,
        tier: signal.tier,
        relevance_score: signal.relevanceScore,
        matched_keywords: signal.matchedKeywords,
        summary: signal.summary?.substring(0, 500),
      }),
    });
  } catch (err: any) {
    console.error(
      `[MarketSignalScout] Failed to write signal event:`,
      err.message
    );
  }
}

async function writeSummaryEvent(summary: ScoutSummary): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "market.scout_summary",
      properties: JSON.stringify({
        scanned_at: summary.scannedAt,
        sources_checked: summary.sourcesChecked,
        sources_succeeded: summary.sourcesSucceeded,
        items_scanned: summary.itemsScanned,
        signals_detected: summary.signalsDetected,
        p0_signals: summary.p0Signals,
        p1_signals: summary.p1Signals,
      }),
    });
  } catch (err: any) {
    console.error(
      `[MarketSignalScout] Failed to write summary event:`,
      err.message
    );
  }
}
