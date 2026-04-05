/**
 * Trend Scout Agent -- Execution Service
 *
 * Runs weekly Sunday 6pm PT.
 * Monitors Google Trends (RSS), Reddit (subreddit RSS), and
 * YouTube trending for content topics relevant to Alloro.
 * Identifies 3 best content topics for the week.
 * Writes "content.trend_detected" events to behavioral_events.
 *
 * Data-driven (RSS + keyword matching). No AI calls.
 */

import { db } from "../../database/connection";
import { fetchRSS, RSSItem } from "../webFetch";

// -- Types ------------------------------------------------------------------

interface TrendSignal {
  topic: string;
  source: string;
  sourceUrl: string;
  title: string;
  link: string;
  relevanceScore: number;
  suggestedAngle: string;
  matchedKeywords: string[];
  woundAddressed: string;
}

interface TrendScoutResult {
  scannedAt: string;
  sourcesChecked: number;
  sourcesSucceeded: number;
  itemsScanned: number;
  topicsDetected: number;
  topics: TrendSignal[];
}

// -- RSS Sources ------------------------------------------------------------

const RSS_SOURCES: Array<{ name: string; url: string; category: string }> = [
  // Google Trends (via RSS)
  {
    name: "Google Trends - Business",
    url: "https://trends.google.com/trending/rss?geo=US&category=12",
    category: "trends",
  },
  {
    name: "Google Trends - Health",
    url: "https://trends.google.com/trending/rss?geo=US&category=7",
    category: "trends",
  },
  // Reddit subreddits
  {
    name: "Reddit r/dentistry",
    url: "https://www.reddit.com/r/dentistry/top/.rss?t=week",
    category: "reddit",
  },
  {
    name: "Reddit r/smallbusiness",
    url: "https://www.reddit.com/r/smallbusiness/top/.rss?t=week",
    category: "reddit",
  },
  {
    name: "Reddit r/healthcare",
    url: "https://www.reddit.com/r/healthcare/top/.rss?t=week",
    category: "reddit",
  },
  // YouTube trending (RSS feeds for relevant channels)
  {
    name: "YouTube - My First Million",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCkw-Abon4bOkFmeGSjB4L3Q",
    category: "youtube",
  },
  {
    name: "YouTube - Alex Hormozi",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCo1ssLJtPILPt1gS2QfFL_Q",
    category: "youtube",
  },
];

// -- Relevance Keywords (with wound mapping) --------------------------------

const TOPIC_KEYWORDS: Array<{
  keyword: string;
  weight: number;
  wound: string;
  angle: string;
}> = [
  { keyword: "referral", weight: 5, wound: "Safety: invisible loss of referral sources", angle: "How Alloro tracks referral network shifts in real time" },
  { keyword: "online reviews", weight: 4, wound: "Status: competitors more visible on Google with more reviews", angle: "The review gap and what it means for your visibility" },
  { keyword: "practice growth", weight: 4, wound: "Purpose: bought a practice for freedom, got a second job", angle: "Growth that does not require the owner to do the marketing" },
  { keyword: "patient acquisition", weight: 4, wound: "Safety: new patients going to competitors", angle: "Where your next 10 patients are actually coming from" },
  { keyword: "small business owner", weight: 3, wound: "Purpose: trained for years in a craft, ended up managing a business", angle: "Business clarity without a business degree" },
  { keyword: "google business", weight: 4, wound: "Status: your Google profile is your storefront and you do not control it", angle: "What patients see when they Google you" },
  { keyword: "local seo", weight: 3, wound: "Status: invisible online despite being excellent in person", angle: "The gap between clinical skill and online presence" },
  { keyword: "reputation", weight: 3, wound: "Status: a single bad review feels like a personal attack", angle: "Reputation is measurable. Here is your score." },
  { keyword: "dental", weight: 2, wound: "Belonging: the specialist community dealing with shared challenges", angle: "What the data says about specialists in your market" },
  { keyword: "specialist", weight: 3, wound: "Belonging: specialists are different from generalists, and the business challenges reflect that", angle: "The specialist-specific business blind spots" },
  { keyword: "entrepreneur", weight: 2, wound: "Purpose: the entrepreneurship journey nobody prepared them for", angle: "From clinician to business owner, the untold story" },
  { keyword: "healthcare business", weight: 3, wound: "Safety: the business side of healthcare is changing faster than the clinical side", angle: "Healthcare business trends that affect your bottom line" },
  { keyword: "business intelligence", weight: 4, wound: "Safety: decisions made without data are gambles", angle: "What your business has been trying to tell you" },
  { keyword: "marketing", weight: 2, wound: "Purpose: spending time on marketing instead of the craft they love", angle: "Marketing that runs itself so you can do what you trained for" },
  { keyword: "competitor", weight: 3, wound: "Safety: competitors you cannot see are taking your patients", angle: "Your competitive landscape, mapped" },
];

// -- Core -------------------------------------------------------------------

/**
 * Run the Trend Scout. Scan all RSS sources, score items,
 * return top 3 topics for the week.
 */
export async function runTrendScout(): Promise<TrendScoutResult> {
  let sourcesSucceeded = 0;
  let itemsScanned = 0;
  const allSignals: TrendSignal[] = [];

  // Also pull behavioral intelligence (Tier 1 data)
  const behavioralTopics = await getBehavioralIntelligence();

  for (const source of RSS_SOURCES) {
    try {
      const result = await fetchRSS(source.url);

      if (!result.success || !result.items) {
        console.warn(
          `[TrendScout] Failed to fetch ${source.name}: ${result.error}`
        );
        continue;
      }

      sourcesSucceeded++;
      itemsScanned += result.items.length;

      for (const item of result.items) {
        const signal = scoreItem(item, source.name, source.category);
        if (signal) {
          allSignals.push(signal);
        }
      }
    } catch (err: any) {
      console.error(
        `[TrendScout] Error processing ${source.name}:`,
        err.message
      );
    }
  }

  // Add behavioral intelligence signals (these get priority boost)
  for (const bt of behavioralTopics) {
    allSignals.push({
      ...bt,
      relevanceScore: bt.relevanceScore + 10, // Tier 1 boost
    });
  }

  // Deduplicate by topic similarity and take top 3
  const deduped = deduplicateByTopic(allSignals);
  const top3 = deduped
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 3);

  // Check for repetition against last 30 days
  const recentTopics = await getRecentTopics();
  const filtered = avoidRepetition(top3, recentTopics);

  // Write events
  for (const topic of filtered) {
    await writeTopicEvent(topic);
  }

  const summary: TrendScoutResult = {
    scannedAt: new Date().toISOString(),
    sourcesChecked: RSS_SOURCES.length,
    sourcesSucceeded,
    itemsScanned,
    topicsDetected: filtered.length,
    topics: filtered,
  };

  await writeSummaryEvent(summary);

  console.log(
    `[TrendScout] Scan complete: ${filtered.length} topics from ${sourcesSucceeded}/${RSS_SOURCES.length} sources, ${itemsScanned} items scanned`
  );

  return summary;
}

// -- Scoring ----------------------------------------------------------------

function scoreItem(
  item: RSSItem,
  sourceName: string,
  category: string
): TrendSignal | null {
  const searchText = `${item.title} ${item.summary || ""}`.toLowerCase();
  const matchedKeywords: string[] = [];
  let totalScore = 0;
  let bestWound = "";
  let bestAngle = "";

  for (const tk of TOPIC_KEYWORDS) {
    if (searchText.includes(tk.keyword.toLowerCase())) {
      matchedKeywords.push(tk.keyword);
      totalScore += tk.weight;
      if (!bestWound || tk.weight > (TOPIC_KEYWORDS.find((k) => k.keyword === matchedKeywords[0])?.weight || 0)) {
        bestWound = tk.wound;
        bestAngle = tk.angle;
      }
    }
  }

  // Minimum threshold: at least 1 keyword match with weight >= 3
  if (matchedKeywords.length === 0 || totalScore < 3) {
    return null;
  }

  // Extract a clean topic from the item title
  const topic = item.title.length > 100 ? item.title.substring(0, 100) : item.title;

  return {
    topic,
    source: sourceName,
    sourceUrl: item.link,
    title: item.title,
    link: item.link,
    relevanceScore: totalScore,
    suggestedAngle: bestAngle,
    matchedKeywords,
    woundAddressed: bestWound,
  };
}

// -- Behavioral Intelligence (Tier 1) --------------------------------------

async function getBehavioralIntelligence(): Promise<TrendSignal[]> {
  const signals: TrendSignal[] = [];

  try {
    // What Checkup findings got the most engagement?
    const engagementEvents = await db("behavioral_events")
      .whereIn("event_type", [
        "checkup.submitted",
        "checkup.viewed",
        "email.link_clicked",
      ])
      .where("created_at", ">=", db.raw("NOW() - INTERVAL '7 days'"))
      .orderBy("created_at", "desc")
      .limit(20);

    if (engagementEvents.length > 5) {
      signals.push({
        topic: "Checkup engagement is spiking this week",
        source: "Alloro behavioral data (Tier 1)",
        sourceUrl: "",
        title: "Checkup engagement trend",
        link: "",
        relevanceScore: 8,
        suggestedAngle: "Real data from this week showing what business owners are checking",
        matchedKeywords: ["behavioral", "engagement"],
        woundAddressed: "Safety: business owners are actively seeking clarity, which means uncertainty is high",
      });
    }
  } catch {
    // Behavioral queries are best-effort
  }

  return signals;
}

// -- Dedup and Repetition ---------------------------------------------------

function deduplicateByTopic(signals: TrendSignal[]): TrendSignal[] {
  const seen = new Set<string>();
  const result: TrendSignal[] = [];

  for (const signal of signals) {
    const normalizedTopic = signal.topic.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 50);
    if (!seen.has(normalizedTopic)) {
      seen.add(normalizedTopic);
      result.push(signal);
    }
  }

  return result;
}

async function getRecentTopics(): Promise<string[]> {
  try {
    const events = await db("behavioral_events")
      .where("event_type", "content.trend_detected")
      .where("created_at", ">=", db.raw("NOW() - INTERVAL '30 days'"))
      .orderBy("created_at", "desc")
      .limit(30);

    return events.map((e: any) => {
      const props = typeof e.properties === "string" ? JSON.parse(e.properties) : e.properties;
      return (props?.topic || "").toLowerCase();
    });
  } catch {
    return [];
  }
}

function avoidRepetition(topics: TrendSignal[], recentTopics: string[]): TrendSignal[] {
  return topics.filter((t) => {
    const normalized = t.topic.toLowerCase();
    return !recentTopics.some(
      (recent) =>
        recent.includes(normalized.substring(0, 20)) ||
        normalized.includes(recent.substring(0, 20))
    );
  });
}

// -- Writers ----------------------------------------------------------------

async function writeTopicEvent(signal: TrendSignal): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "content.trend_detected",
      properties: JSON.stringify({
        topic: signal.topic,
        source: signal.source,
        relevance_score: signal.relevanceScore,
        suggested_angle: signal.suggestedAngle,
        matched_keywords: signal.matchedKeywords,
        wound_addressed: signal.woundAddressed,
        source_url: signal.sourceUrl,
      }),
    });
  } catch (err: any) {
    console.error("[TrendScout] Failed to write topic event:", err.message);
  }
}

async function writeSummaryEvent(summary: TrendScoutResult): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "content.trend_scout_summary",
      properties: JSON.stringify({
        scanned_at: summary.scannedAt,
        sources_checked: summary.sourcesChecked,
        sources_succeeded: summary.sourcesSucceeded,
        items_scanned: summary.itemsScanned,
        topics_detected: summary.topicsDetected,
        topics: summary.topics.map((t) => ({
          topic: t.topic,
          source: t.source,
          relevance_score: t.relevanceScore,
        })),
      }),
    });
  } catch (err: any) {
    console.error("[TrendScout] Failed to write summary event:", err.message);
  }
}
