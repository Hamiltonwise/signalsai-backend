/**
 * CRO Engine -- Data-Driven Website Micro-Changes
 *
 * Reads GSC + GA4 data for an org, identifies optimization opportunities
 * using rule-based analysis, then generates specific copy changes via LLM.
 *
 * The website gets smarter every week without the owner touching it.
 *
 * Opportunity rules:
 *   1. High impression, low CTR queries -> rewrite title/meta to match
 *   2. Position 8-15 queries -> enhance content targeting that query
 *   3. High traffic, low conversion pages -> adjust CTA placement
 *   4. Queries with no matching page -> suggest new page
 */

import { db } from "../database/connection";
import { runAgent } from "../agents/service.llm-runner";
import { fetchGA4Data, fetchGSCData } from "./analyticsService";
import type { GA4Summary, GSCSummary } from "./analyticsService";

// =====================================================================
// TYPES
// =====================================================================

export interface CRORecommendation {
  pageUrl: string;
  changeType: "title" | "meta_description" | "content_section" | "cta" | "new_page";
  currentValue: string | null;
  recommendedValue: string;
  trigger: string;
  expectedImpact: string;
  autoExecutable: boolean;
}

interface PageMeta {
  id: string;
  path: string;
  metaTitle: string | null;
  metaDescription: string | null;
  content: string | null;
}

interface RawOpportunity {
  type: "low_ctr" | "striking_distance" | "low_conversion" | "content_gap";
  query: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
  matchingPage: PageMeta | null;
  /** For low_conversion: the page path + bounce/conversion data */
  pagePath?: string;
  pageViews?: number;
  bounceRate?: number;
  conversions?: number;
}

// =====================================================================
// THRESHOLDS
// =====================================================================

/** Minimum impressions to consider a query relevant */
const MIN_IMPRESSIONS = 50;

/** CTR below this with high impressions triggers a title/meta rewrite */
const LOW_CTR_THRESHOLD = 0.03;

/** Position range for "striking distance" queries worth targeting */
const STRIKING_DISTANCE_MIN = 8;
const STRIKING_DISTANCE_MAX = 20;

/** Bounce rate above this on a high-traffic page triggers CTA review */
const HIGH_BOUNCE_THRESHOLD = 0.65;

// =====================================================================
// CORE: ANALYZE + GENERATE
// =====================================================================

/**
 * Run the full CRO analysis for an organization.
 *
 * 1. Fetch GSC + GA4 data
 * 2. Load PatientPath page metadata
 * 3. Identify opportunities via rules
 * 4. Generate specific copy changes via LLM
 * 5. Return structured recommendations
 */
export async function runCROEngine(orgId: number): Promise<{
  recommendations: CRORecommendation[];
  summary: {
    queriesAnalyzed: number;
    pagesAnalyzed: number;
    opportunitiesFound: number;
    autoExecutableCount: number;
  };
}> {
  console.log(`[CRO Engine] Starting analysis for org ${orgId}`);

  // Step 1: Fetch analytics data
  const [gscData, ga4Data] = await Promise.all([
    fetchGSCData(orgId, 30),
    fetchGA4Data(orgId, 30),
  ]);

  if (!gscData && !ga4Data) {
    console.log(`[CRO Engine] No analytics data available for org ${orgId}`);
    return {
      recommendations: [],
      summary: { queriesAnalyzed: 0, pagesAnalyzed: 0, opportunitiesFound: 0, autoExecutableCount: 0 },
    };
  }

  // Step 2: Load PatientPath pages for this org
  const pages = await loadPatientPathPages(orgId);
  const orgInfo = await loadOrgContext(orgId);

  // Step 3: Identify opportunities
  const opportunities = identifyOpportunities(gscData, ga4Data, pages);

  if (opportunities.length === 0) {
    console.log(`[CRO Engine] No opportunities found for org ${orgId}`);
    return {
      recommendations: [],
      summary: {
        queriesAnalyzed: gscData?.topQueries.length || 0,
        pagesAnalyzed: pages.length,
        opportunitiesFound: 0,
        autoExecutableCount: 0,
      },
    };
  }

  // Step 4: Generate specific copy changes via LLM (batch up to 10)
  const topOpportunities = opportunities.slice(0, 10);
  const recommendations = await generateRecommendations(topOpportunities, orgInfo);

  const autoExecutableCount = recommendations.filter((r) => r.autoExecutable).length;

  console.log(
    `[CRO Engine] Org ${orgId}: ${recommendations.length} recommendations ` +
    `(${autoExecutableCount} auto-executable) from ${opportunities.length} opportunities`
  );

  return {
    recommendations,
    summary: {
      queriesAnalyzed: gscData?.topQueries.length || 0,
      pagesAnalyzed: pages.length,
      opportunitiesFound: opportunities.length,
      autoExecutableCount,
    },
  };
}

// =====================================================================
// DATA LOADING
// =====================================================================

async function loadPatientPathPages(orgId: number): Promise<PageMeta[]> {
  // Find the website project for this org
  const project = await db("website_builder.projects")
    .where({ organization_id: orgId })
    .whereIn("status", ["published", "live", "draft"])
    .orderBy("updated_at", "desc")
    .first();

  if (!project) return [];

  const rows = await db("website_builder.pages")
    .where({ project_id: project.id })
    .whereIn("status", ["published", "draft"])
    .select("id", "path", "seo_data", "content");

  // Deduplicate by path (prefer published, then highest version)
  const byPath = new Map<string, PageMeta>();
  for (const row of rows) {
    const seo = typeof row.seo_data === "string" ? JSON.parse(row.seo_data) : row.seo_data;
    const contentStr = typeof row.content === "string" ? row.content : JSON.stringify(row.content || "");

    const existing = byPath.get(row.path);
    if (!existing || row.status === "published") {
      byPath.set(row.path, {
        id: row.id,
        path: row.path,
        metaTitle: seo?.meta_title || null,
        metaDescription: seo?.meta_description || null,
        content: contentStr.slice(0, 2000), // Truncate for LLM context
      });
    }
  }

  return Array.from(byPath.values());
}

async function loadOrgContext(orgId: number): Promise<{
  name: string;
  specialty: string;
  city: string;
  state: string;
  domain: string | null;
}> {
  const org = await db("organizations")
    .where({ id: orgId })
    .select("name", "specialty", "city", "state", "domain")
    .first();

  return {
    name: org?.name || "Unknown Business",
    specialty: org?.specialty || "specialist",
    city: org?.city || "",
    state: org?.state || "",
    domain: org?.domain || null,
  };
}

// =====================================================================
// OPPORTUNITY IDENTIFICATION (Rule-Based)
// =====================================================================

function identifyOpportunities(
  gsc: GSCSummary | null,
  ga4: GA4Summary | null,
  pages: PageMeta[],
): RawOpportunity[] {
  const opportunities: RawOpportunity[] = [];

  if (gsc) {
    for (const q of gsc.topQueries) {
      const matchingPage = findMatchingPage(q.query, pages);

      // Rule 1: High impressions, low CTR
      if (q.impressions >= MIN_IMPRESSIONS && q.ctr < LOW_CTR_THRESHOLD * 100) {
        opportunities.push({
          type: "low_ctr",
          query: q.query,
          impressions: q.impressions,
          clicks: q.clicks,
          ctr: q.ctr,
          position: q.position,
          matchingPage,
        });
      }

      // Rule 2: Striking distance (position 8-20)
      if (
        q.position >= STRIKING_DISTANCE_MIN &&
        q.position <= STRIKING_DISTANCE_MAX &&
        q.impressions >= MIN_IMPRESSIONS / 2
      ) {
        opportunities.push({
          type: "striking_distance",
          query: q.query,
          impressions: q.impressions,
          clicks: q.clicks,
          ctr: q.ctr,
          position: q.position,
          matchingPage,
        });
      }

      // Rule 4: Content gap (query has impressions but no matching page)
      if (!matchingPage && q.impressions >= MIN_IMPRESSIONS) {
        opportunities.push({
          type: "content_gap",
          query: q.query,
          impressions: q.impressions,
          clicks: q.clicks,
          ctr: q.ctr,
          position: q.position,
          matchingPage: null,
        });
      }
    }
  }

  // Rule 3: High traffic, low conversion pages (from GA4)
  if (ga4) {
    for (const page of ga4.topPages) {
      const matchingMeta = pages.find((p) => p.path === page.path);
      // If bounce rate is high overall and this is a top page, flag it
      if (
        ga4.bounceRate > HIGH_BOUNCE_THRESHOLD &&
        page.views > 10
      ) {
        opportunities.push({
          type: "low_conversion",
          query: "",
          impressions: 0,
          clicks: 0,
          ctr: 0,
          position: 0,
          matchingPage: matchingMeta || null,
          pagePath: page.path,
          pageViews: page.views,
          bounceRate: ga4.bounceRate,
          conversions: ga4.conversions,
        });
      }
    }
  }

  // Deduplicate: same query can trigger both low_ctr and striking_distance.
  // Keep both, but sort by impact potential.
  opportunities.sort((a, b) => {
    // Content gaps first (new pages have highest potential)
    if (a.type === "content_gap" && b.type !== "content_gap") return -1;
    if (b.type === "content_gap" && a.type !== "content_gap") return 1;
    // Then by impressions (higher = more potential traffic)
    return b.impressions - a.impressions;
  });

  return opportunities;
}

/**
 * Match a search query to an existing page by checking if the query terms
 * appear in the page path, title, or meta description.
 */
function findMatchingPage(query: string, pages: PageMeta[]): PageMeta | null {
  const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  if (queryTerms.length === 0) return null;

  let bestMatch: PageMeta | null = null;
  let bestScore = 0;

  for (const page of pages) {
    const haystack = [
      page.path,
      page.metaTitle || "",
      page.metaDescription || "",
    ].join(" ").toLowerCase();

    let score = 0;
    for (const term of queryTerms) {
      if (haystack.includes(term)) score++;
    }

    const matchRatio = score / queryTerms.length;
    if (matchRatio > bestScore && matchRatio >= 0.4) {
      bestScore = matchRatio;
      bestMatch = page;
    }
  }

  return bestMatch;
}

// =====================================================================
// LLM-POWERED RECOMMENDATION GENERATION
// =====================================================================

const CRO_SYSTEM_PROMPT = `You are a conversion rate optimization specialist for local service businesses. You generate specific, actionable website changes based on search data.

Rules:
- Write for humans, not search engines. Natural language that reads well.
- Never stuff keywords. One primary keyword per title, naturally placed.
- Titles: 50-60 characters. Include the city name when relevant.
- Meta descriptions: 140-155 characters. Include a clear value proposition and call to action.
- Content sections: 2-3 paragraphs, conversational, addresses the searcher's intent directly.
- Never use em-dashes. Use commas or periods instead.
- Never use generic phrases like "trusted provider" or "quality care." Be specific.
- Match the business's actual specialty and location.

Return a JSON array of objects. Each object must have exactly these keys:
{
  "pageUrl": "the page path this change applies to",
  "changeType": "title" | "meta_description" | "content_section" | "cta" | "new_page",
  "currentValue": "what's there now (null if new page)",
  "recommendedValue": "the specific new text",
  "trigger": "one-sentence explanation of which data point triggered this",
  "expectedImpact": "one-sentence expected result with a percentage range",
  "autoExecutable": true or false
}

Auto-executable rules:
- title and meta_description changes: true (safe, reversible, SEO-only)
- content_section changes to existing pages: false (needs review)
- cta changes: false (needs review)
- new_page: false (always needs review)`;

async function generateRecommendations(
  opportunities: RawOpportunity[],
  orgInfo: { name: string; specialty: string; city: string; state: string; domain: string | null },
): Promise<CRORecommendation[]> {
  const userMessage = buildUserMessage(opportunities, orgInfo);

  const model = process.env.LLM_MODEL || "claude-sonnet-4-6";

  try {
    const result = await runAgent({
      systemPrompt: CRO_SYSTEM_PROMPT,
      userMessage,
      model,
      maxTokens: 8192,
      temperature: 0.3,
      prefill: "[",
    });

    if (result.parsed && Array.isArray(result.parsed)) {
      return validateRecommendations(result.parsed);
    }

    console.error("[CRO Engine] LLM returned non-array response");
    return [];
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[CRO Engine] LLM generation failed: ${message}`);
    return [];
  }
}

function buildUserMessage(
  opportunities: RawOpportunity[],
  orgInfo: { name: string; specialty: string; city: string; state: string; domain: string | null },
): string {
  const parts: string[] = [];

  parts.push(`Business: ${orgInfo.name}`);
  parts.push(`Specialty: ${orgInfo.specialty}`);
  parts.push(`Location: ${orgInfo.city}, ${orgInfo.state}`);
  if (orgInfo.domain) parts.push(`Website: ${orgInfo.domain}`);
  parts.push("");
  parts.push("== Search Opportunities ==");
  parts.push("");

  for (const opp of opportunities) {
    switch (opp.type) {
      case "low_ctr":
        parts.push(
          `LOW CTR: Query "${opp.query}" has ${opp.impressions} impressions but only ${opp.ctr}% CTR (${opp.clicks} clicks). Position: ${opp.position}.`
        );
        if (opp.matchingPage) {
          parts.push(`  Current page: ${opp.matchingPage.path}`);
          parts.push(`  Current title: ${opp.matchingPage.metaTitle || "(none)"}`);
          parts.push(`  Current meta: ${opp.matchingPage.metaDescription || "(none)"}`);
        } else {
          parts.push("  No matching page found.");
        }
        parts.push("");
        break;

      case "striking_distance":
        parts.push(
          `STRIKING DISTANCE: Query "${opp.query}" ranks at position ${opp.position} with ${opp.impressions} impressions. A content boost could push it to page 1.`
        );
        if (opp.matchingPage) {
          parts.push(`  Current page: ${opp.matchingPage.path}`);
          parts.push(`  Current title: ${opp.matchingPage.metaTitle || "(none)"}`);
        }
        parts.push("");
        break;

      case "content_gap":
        parts.push(
          `CONTENT GAP: Query "${opp.query}" has ${opp.impressions} impressions and ${opp.clicks} clicks, but no page on the site targets this topic.`
        );
        parts.push("");
        break;

      case "low_conversion":
        parts.push(
          `LOW CONVERSION: Page "${opp.pagePath}" has ${opp.pageViews} page views but the site bounce rate is ${((opp.bounceRate || 0) * 100).toFixed(0)}% with only ${opp.conversions} total conversions.`
        );
        if (opp.matchingPage) {
          parts.push(`  Current title: ${opp.matchingPage.metaTitle || "(none)"}`);
        }
        parts.push("");
        break;
    }
  }

  parts.push("Generate one recommendation per opportunity. Return a JSON array.");

  return parts.join("\n");
}

/**
 * Validate and normalize LLM output into typed recommendations.
 */
function validateRecommendations(raw: unknown[]): CRORecommendation[] {
  const validChangeTypes = new Set(["title", "meta_description", "content_section", "cta", "new_page"]);
  const results: CRORecommendation[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;

    const changeType = String(rec.changeType || "");
    if (!validChangeTypes.has(changeType)) continue;

    const recommendation: CRORecommendation = {
      pageUrl: String(rec.pageUrl || "/"),
      changeType: changeType as CRORecommendation["changeType"],
      currentValue: rec.currentValue != null ? String(rec.currentValue) : null,
      recommendedValue: String(rec.recommendedValue || ""),
      trigger: String(rec.trigger || ""),
      expectedImpact: String(rec.expectedImpact || ""),
      autoExecutable: changeType === "title" || changeType === "meta_description",
    };

    // Skip empty recommendations
    if (!recommendation.recommendedValue) continue;

    results.push(recommendation);
  }

  return results;
}

// =====================================================================
// PERSISTENCE: Store recommendations for review/execution
// =====================================================================

/**
 * Run the engine and persist results to the database.
 * Returns the recommendations for immediate use.
 */
export async function runAndStoreRecommendations(orgId: number): Promise<CRORecommendation[]> {
  const { recommendations, summary } = await runCROEngine(orgId);

  if (recommendations.length === 0) return [];

  // Store in behavioral_events for the Dream Team to reference
  await db("behavioral_events").insert({
    organization_id: orgId,
    event_type: "cro_engine_run",
    event_data: JSON.stringify({
      recommendations,
      summary,
      generated_at: new Date().toISOString(),
    }),
    created_at: new Date(),
  });

  console.log(`[CRO Engine] Stored ${recommendations.length} recommendations for org ${orgId}`);
  return recommendations;
}

/**
 * Run CRO engine for all orgs that have both a PatientPath site and analytics data.
 * Designed to run weekly (e.g., Sunday night before Monday email).
 */
export async function runCROForAllOrgs(): Promise<{
  processed: number;
  totalRecommendations: number;
  errors: number;
}> {
  // Find orgs with both a website project and connected analytics
  const orgs = await db("website_builder.projects")
    .join("google_connections", "website_builder.projects.organization_id", "google_connections.organization_id")
    .whereNotNull("google_connections.refresh_token")
    .select("website_builder.projects.organization_id")
    .groupBy("website_builder.projects.organization_id");

  let processed = 0;
  let totalRecommendations = 0;
  let errors = 0;

  for (const row of orgs) {
    try {
      const recs = await runAndStoreRecommendations(row.organization_id);
      processed++;
      totalRecommendations += recs.length;
    } catch (err: unknown) {
      errors++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[CRO Engine] Error for org ${row.organization_id}: ${message}`);
    }
  }

  console.log(`[CRO Engine] Complete: ${processed} orgs, ${totalRecommendations} recommendations, ${errors} errors`);
  return { processed, totalRecommendations, errors };
}
