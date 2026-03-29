/**
 * AEO Monitor Agent -- Execution Service
 *
 * Runs weekly Monday 5am PT (before Monday email sends).
 * Checks if Alloro appears in Google search results for key queries
 * related to the business intelligence market for specialists.
 *
 * Tracks presence/absence over time in behavioral_events as
 * "aeo.search_presence". Data-driven, no AI calls.
 */

import { db } from "../../database/connection";
import { fetchPage, extractText } from "../webFetch";

// ── Types ──────────────────────────────────────────────────────────

interface AEOQueryResult {
  query: string;
  present: boolean;
  position: "featured" | "mentioned" | "absent";
  competitorsMentioned: string[];
  snippet?: string;
  error?: string;
}

interface AEOScanSummary {
  scannedAt: string;
  queriesChecked: number;
  queriesPresent: number;
  queriesAbsent: number;
  results: AEOQueryResult[];
}

// ── Monitoring Queries ─────────────────────────────────────────────

const MONITORING_QUERIES: string[] = [
  "how do I know if my endodontist rankings are dropping",
  "best software to track GP referrals for endodontist",
  "how to get more referrals for my specialty practice",
  "what is business clarity for a medical practice",
  "endodontist marketing software",
  "how to track which GPs send me the most patients",
  "best way to follow up with referring dentists",
  "how do I know if my practice is losing referrals",
  "dental specialist practice management dashboard",
  "automated referral tracking for dental specialists",
  "how do patients find an endodontist near me",
  "why is my dental practice not showing up on Google",
  "how to improve Google Business Profile for dentist",
  "best way to get more Google reviews for dental practice",
  "patient journey tracking for dental specialists",
  "how to see what competitors rank for in dental marketing",
  "endodontist competitor analysis tool",
  "how do I know if another practice is taking my referrals",
  "dental practice market share analysis",
  "specialist practice benchmarking software",
  "will AI replace dental marketing agencies",
  "how to optimize dental practice for AI search",
  "Apple Business listing for dental practice",
  "how to claim Apple Business profile for dentist",
  "answer engine optimization for healthcare practices",
];

// Known competitors to watch for in results
const KNOWN_COMPETITORS = [
  "dental intelligence",
  "dentalintel",
  "patient prism",
  "weave",
  "birdeye",
  "podium",
  "swell",
  "rethink dental",
  "dental marketing guy",
  "nifty thrifty dentists",
];

// ── Core ───────────────────────────────────────────────────────────

/**
 * Run the AEO scan for all monitoring queries.
 */
export async function runAEOMonitor(): Promise<AEOScanSummary> {
  const results: AEOQueryResult[] = [];

  for (const query of MONITORING_QUERIES) {
    try {
      const result = await checkSearchPresence(query);
      results.push(result);

      // Write each result to behavioral_events
      await writePresenceEvent(result);

      // Small delay between requests to avoid rate limiting
      await delay(2000);
    } catch (err: any) {
      console.error(`[AEOMonitor] Error checking "${query}":`, err.message);
      results.push({
        query,
        present: false,
        position: "absent",
        competitorsMentioned: [],
        error: err.message,
      });
    }
  }

  const summary: AEOScanSummary = {
    scannedAt: new Date().toISOString(),
    queriesChecked: results.length,
    queriesPresent: results.filter((r) => r.present).length,
    queriesAbsent: results.filter((r) => !r.present).length,
    results,
  };

  // Write summary event
  await writeSummaryEvent(summary);

  console.log(
    `[AEOMonitor] Scan complete: ${summary.queriesPresent}/${summary.queriesChecked} present`
  );

  return summary;
}

// ── Search Check ───────────────────────────────────────────────────

async function checkSearchPresence(query: string): Promise<AEOQueryResult> {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://www.google.com/search?q=${encodedQuery}&num=20`;

  const page = await fetchPage(url);

  if (!page.success || !page.html) {
    return {
      query,
      present: false,
      position: "absent",
      competitorsMentioned: [],
      error: page.error || "Failed to fetch search results",
    };
  }

  const text = await extractText(page.html);
  const textLower = text.toLowerCase();

  // Check for Alloro presence
  const alloroPresent =
    textLower.includes("alloro") || textLower.includes("getalloro");

  // Determine position
  let position: "featured" | "mentioned" | "absent" = "absent";
  if (alloroPresent) {
    // Check if it appears in the first 500 chars (roughly top results)
    const first500 = textLower.substring(0, 500);
    position =
      first500.includes("alloro") || first500.includes("getalloro")
        ? "featured"
        : "mentioned";
  }

  // Find snippet if present
  let snippet: string | undefined;
  if (alloroPresent) {
    const idx = textLower.indexOf("alloro");
    if (idx >= 0) {
      const start = Math.max(0, idx - 80);
      const end = Math.min(text.length, idx + 120);
      snippet = text.substring(start, end).trim();
    }
  }

  // Check for competitor mentions
  const competitorsMentioned = KNOWN_COMPETITORS.filter((c) =>
    textLower.includes(c.toLowerCase())
  );

  return {
    query,
    present: alloroPresent,
    position,
    competitorsMentioned,
    snippet,
  };
}

// ── Writers ────────────────────────────────────────────────────────

async function writePresenceEvent(result: AEOQueryResult): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "aeo.search_presence",
      properties: JSON.stringify({
        query: result.query,
        present: result.present,
        position: result.position,
        competitors_mentioned: result.competitorsMentioned,
        snippet: result.snippet,
        error: result.error,
      }),
    });
  } catch (err: any) {
    console.error(
      `[AEOMonitor] Failed to write presence event:`,
      err.message
    );
  }
}

async function writeSummaryEvent(summary: AEOScanSummary): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "aeo.weekly_summary",
      properties: JSON.stringify({
        scanned_at: summary.scannedAt,
        queries_checked: summary.queriesChecked,
        queries_present: summary.queriesPresent,
        queries_absent: summary.queriesAbsent,
        coverage_pct: Math.round(
          (summary.queriesPresent / summary.queriesChecked) * 100
        ),
        absent_queries: summary.results
          .filter((r) => !r.present)
          .map((r) => r.query),
      }),
    });
  } catch (err: any) {
    console.error(
      `[AEOMonitor] Failed to write summary event:`,
      err.message
    );
  }
}

// ── Utilities ──────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
