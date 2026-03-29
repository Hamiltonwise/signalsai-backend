/**
 * Programmatic SEO Agent -- Execution Service
 *
 * Runs weekly Monday 4am PT (before morning brief fires).
 * Queries programmatic_pages for pages needing refresh or creation.
 * Checks page performance via behavioral_events (page views,
 * checkup starts from programmatic pages).
 * Identifies underperforming pages and writes recommendations.
 *
 * Writes to behavioral_events as "seo.page_analysis".
 * Data-driven (SQL queries only). No AI calls.
 */

import { db } from "../../database/connection";

// ── Types ──────────────────────────────────────────────────────────

interface PageAnalysis {
  pageId: number;
  slug: string;
  specialty: string;
  city: string;
  status: "rising" | "optimization_zone" | "declining" | "not_ranking" | "new";
  pageViews7d: number;
  checkupStarts7d: number;
  conversionRate: number;
  recommendation: string;
  priority: "high" | "medium" | "low";
}

interface SEOScanSummary {
  scannedAt: string;
  totalPages: number;
  rising: number;
  optimizationZone: number;
  declining: number;
  notRanking: number;
  newPages: number;
  topConvertingPages: string[];
  underperformingPages: string[];
}

// ── Core ───────────────────────────────────────────────────────────

/**
 * Run the Programmatic SEO analysis for all pages.
 */
export async function runProgrammaticSEOAnalysis(): Promise<SEOScanSummary> {
  // Fetch all programmatic pages
  const pages = await db("programmatic_pages")
    .select("id", "slug", "specialty", "city", "state", "status", "created_at")
    .orderBy("created_at", "desc");

  if (pages.length === 0) {
    console.log("[ProgrammaticSEO] No programmatic pages found");
    return emptySummary();
  }

  const analyses: PageAnalysis[] = [];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  for (const page of pages) {
    try {
      const analysis = await analyzePage(page, sevenDaysAgo);
      analyses.push(analysis);
      await writeAnalysisEvent(analysis);
    } catch (err: any) {
      console.error(
        `[ProgrammaticSEO] Error analyzing page ${page.slug}:`,
        err.message
      );
    }
  }

  // Build summary
  const summary: SEOScanSummary = {
    scannedAt: new Date().toISOString(),
    totalPages: analyses.length,
    rising: analyses.filter((a) => a.status === "rising").length,
    optimizationZone: analyses.filter((a) => a.status === "optimization_zone").length,
    declining: analyses.filter((a) => a.status === "declining").length,
    notRanking: analyses.filter((a) => a.status === "not_ranking").length,
    newPages: analyses.filter((a) => a.status === "new").length,
    topConvertingPages: analyses
      .filter((a) => a.conversionRate > 0)
      .sort((a, b) => b.conversionRate - a.conversionRate)
      .slice(0, 5)
      .map((a) => a.slug),
    underperformingPages: analyses
      .filter((a) => a.priority === "high")
      .map((a) => a.slug),
  };

  await writeSummaryEvent(summary);

  console.log(
    `[ProgrammaticSEO] Analysis complete: ${summary.totalPages} pages (${summary.rising} rising, ${summary.optimizationZone} optimize, ${summary.declining} declining)`
  );

  return summary;
}

// ── Page Analysis ──────────────────────────────────────────────────

async function analyzePage(
  page: any,
  since: Date
): Promise<PageAnalysis> {
  // Count page views from behavioral_events
  const viewEvents = await db("behavioral_events")
    .where("event_type", "page.view")
    .where("created_at", ">=", since)
    .whereRaw("properties::text LIKE ?", [`%${page.slug}%`])
    .count("id as count")
    .first();

  const pageViews7d = parseInt(String(viewEvents?.count || 0), 10);

  // Count checkup starts from this page
  const checkupEvents = await db("behavioral_events")
    .where("event_type", "checkup.started")
    .where("created_at", ">=", since)
    .whereRaw("properties::text LIKE ?", [`%${page.slug}%`])
    .count("id as count")
    .first();

  const checkupStarts7d = parseInt(String(checkupEvents?.count || 0), 10);

  // Calculate conversion rate
  const conversionRate =
    pageViews7d > 0 ? checkupStarts7d / pageViews7d : 0;

  // Determine page status and recommendation
  const isNew =
    new Date(page.created_at).getTime() > Date.now() - 14 * 24 * 60 * 60 * 1000;

  // Check previous week for comparison
  const twoWeeksAgo = new Date(since.getTime() - 7 * 24 * 60 * 60 * 1000);
  const prevViewEvents = await db("behavioral_events")
    .where("event_type", "page.view")
    .where("created_at", ">=", twoWeeksAgo)
    .where("created_at", "<", since)
    .whereRaw("properties::text LIKE ?", [`%${page.slug}%`])
    .count("id as count")
    .first();

  const prevPageViews = parseInt(String(prevViewEvents?.count || 0), 10);

  let status: PageAnalysis["status"];
  let recommendation: string;
  let priority: PageAnalysis["priority"];

  if (isNew) {
    status = "new";
    recommendation = "Monitor for initial indexing. Check Google Search Console in 2 weeks.";
    priority = "low";
  } else if (pageViews7d === 0 && prevPageViews === 0) {
    status = "not_ranking";
    recommendation = "Page has zero traffic for 2+ weeks. Evaluate keyword volume. If volume exists, refresh content and internal linking. If not, consider deprecating.";
    priority = "high";
  } else if (pageViews7d > prevPageViews * 1.3 && prevPageViews > 0) {
    status = "rising";
    recommendation = "Traffic growing. Protect ranking by monitoring competitors and refreshing content monthly.";
    priority = "low";
  } else if (pageViews7d < prevPageViews * 0.7 && prevPageViews > 5) {
    status = "declining";
    recommendation = "Traffic dropped 30%+. Check for algorithm update impact, competitor content, or technical issues.";
    priority = "high";
  } else {
    status = "optimization_zone";
    recommendation =
      pageViews7d > 10 && conversionRate < 0.02
        ? "High traffic, low conversion. Review CTA placement, page speed, and content relevance."
        : "Stable traffic. Consider adding internal links and refreshing content for position improvement.";
    priority = pageViews7d > 10 && conversionRate < 0.02 ? "high" : "medium";
  }

  return {
    pageId: page.id,
    slug: page.slug,
    specialty: page.specialty,
    city: page.city,
    status,
    pageViews7d,
    checkupStarts7d,
    conversionRate: Math.round(conversionRate * 10000) / 10000,
    recommendation,
    priority,
  };
}

// ── Writers ────────────────────────────────────────────────────────

async function writeAnalysisEvent(analysis: PageAnalysis): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "seo.page_analysis",
      properties: JSON.stringify({
        page_id: analysis.pageId,
        slug: analysis.slug,
        specialty: analysis.specialty,
        city: analysis.city,
        status: analysis.status,
        page_views_7d: analysis.pageViews7d,
        checkup_starts_7d: analysis.checkupStarts7d,
        conversion_rate: analysis.conversionRate,
        recommendation: analysis.recommendation,
        priority: analysis.priority,
      }),
    });
  } catch (err: any) {
    console.error(
      `[ProgrammaticSEO] Failed to write analysis event:`,
      err.message
    );
  }
}

async function writeSummaryEvent(summary: SEOScanSummary): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "seo.weekly_summary",
      properties: JSON.stringify({
        scanned_at: summary.scannedAt,
        total_pages: summary.totalPages,
        rising: summary.rising,
        optimization_zone: summary.optimizationZone,
        declining: summary.declining,
        not_ranking: summary.notRanking,
        new_pages: summary.newPages,
        top_converting: summary.topConvertingPages,
        underperforming: summary.underperformingPages,
      }),
    });
  } catch (err: any) {
    console.error(
      `[ProgrammaticSEO] Failed to write summary event:`,
      err.message
    );
  }
}

// ── Utilities ──────────────────────────────────────────────────────

function emptySummary(): SEOScanSummary {
  return {
    scannedAt: new Date().toISOString(),
    totalPages: 0,
    rising: 0,
    optimizationZone: 0,
    declining: 0,
    notRanking: 0,
    newPages: 0,
    topConvertingPages: [],
    underperformingPages: [],
  };
}
