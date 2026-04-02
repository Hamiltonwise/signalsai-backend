/**
 * Analytics Service -- GA4 + GSC Data Fetching
 *
 * Fetches website analytics from Google Analytics 4 and Google Search
 * Console for customers who have connected accounts. Stores results
 * in google_data_store alongside GBP data.
 *
 * OAuth tokens and property IDs are stored in google_connections.
 * This service reads them, calls the Google APIs, and writes the
 * results. No manual setup per customer.
 *
 * "The product comes to you. You never go to it."
 */

import { google } from "googleapis";
import { db } from "../database/connection";

// =====================================================================
// TYPES
// =====================================================================

export interface GA4Summary {
  dateRange: { start: string; end: string };
  sessions: number;
  users: number;
  pageViews: number;
  conversions: number;
  bounceRate: number;
  avgSessionDuration: number;
  topPages: Array<{ path: string; views: number }>;
  topSources: Array<{ source: string; medium: string; sessions: number }>;
  dailyBreakdown: Array<{ date: string; sessions: number; users: number }>;
}

export interface GSCSummary {
  dateRange: { start: string; end: string };
  totalClicks: number;
  totalImpressions: number;
  avgPosition: number;
  avgCTR: number;
  topQueries: Array<{ query: string; clicks: number; impressions: number; position: number; ctr: number }>;
  topPages: Array<{ page: string; clicks: number; impressions: number; position: number }>;
}

// =====================================================================
// OAUTH CLIENT
// =====================================================================

function createOAuthClient(accessToken: string, refreshToken: string) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
  client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  return client;
}

// =====================================================================
// GA4 FETCH
// =====================================================================

/**
 * Fetch GA4 analytics for an organization.
 * Returns null if no GA4 property connected or on error.
 */
/**
 * Fetch GA4 analytics for an organization.
 * Tries the org's own connection first, falls back to the master
 * HW analytics connection (info@hamiltonwise.com, org 36) if the
 * org's token doesn't have analytics scope.
 */
export async function fetchGA4Data(
  orgId: number,
  daysBack: number = 30,
): Promise<GA4Summary | null> {
  const conn = await db("google_connections").where({ organization_id: orgId }).first();
  if (!conn?.refresh_token) return null;

  const pids = typeof conn.google_property_ids === "string"
    ? JSON.parse(conn.google_property_ids)
    : conn.google_property_ids;

  const ga4Property = pids?.ga4?.propertyId;
  if (!ga4Property) return null;

  // Try the org's own token first
  let auth = createOAuthClient(conn.access_token, conn.refresh_token);

  // If the org's token fails with permissions, try the master HW connection
  const tryFetch = async (authClient: any): Promise<GA4Summary | null> => {
    return fetchGA4WithAuth(authClient, ga4Property, daysBack, orgId);
  };

  try {
    return await tryFetch(auth);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("permission") || message.includes("scope")) {
      // Fallback to master HW connection
      const masterConn = await db("google_connections").where({ email: "info@hamiltonwise.com" }).first();
      if (masterConn?.refresh_token) {
        console.log(`[Analytics] Org ${orgId}: falling back to HW master token`);
        auth = createOAuthClient(masterConn.access_token, masterConn.refresh_token);
        try {
          return await tryFetch(auth);
        } catch {
          // Master token also failed
        }
      }
    }
    console.error(`[Analytics] GA4 fetch failed for org ${orgId}:`, message);
    return null;
  }
}

async function fetchGA4WithAuth(
  auth: any,
  ga4Property: string,
  daysBack: number,
  orgId: number,
): Promise<GA4Summary | null> {
  const analyticsData = google.analyticsdata({ version: "v1beta", auth });

  const startDate = `${daysBack}daysAgo`;
  const endDate = "today";

  try {
    // Main metrics
    const [metricsRes, pagesRes, sourcesRes, dailyRes] = await Promise.all([
      // Aggregate metrics
      analyticsData.properties.runReport({
        property: ga4Property,
        requestBody: {
          dateRanges: [{ startDate, endDate }],
          metrics: [
            { name: "sessions" },
            { name: "totalUsers" },
            { name: "screenPageViews" },
            { name: "conversions" },
            { name: "bounceRate" },
            { name: "averageSessionDuration" },
          ],
        },
      }),
      // Top pages
      analyticsData.properties.runReport({
        property: ga4Property,
        requestBody: {
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: "pagePath" }],
          metrics: [{ name: "screenPageViews" }],
          orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
          limit: "10",
        },
      }),
      // Top traffic sources
      analyticsData.properties.runReport({
        property: ga4Property,
        requestBody: {
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
          metrics: [{ name: "sessions" }],
          orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
          limit: "10",
        },
      }),
      // Daily breakdown
      analyticsData.properties.runReport({
        property: ga4Property,
        requestBody: {
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: "date" }],
          metrics: [{ name: "sessions" }, { name: "totalUsers" }],
          orderBys: [{ dimension: { dimensionName: "date" }, desc: false }],
        },
      }),
    ]);

    const mainRow = metricsRes.data.rows?.[0];

    const summary: GA4Summary = {
      dateRange: { start: startDate, end: endDate },
      sessions: parseInt(mainRow?.metricValues?.[0]?.value || "0"),
      users: parseInt(mainRow?.metricValues?.[1]?.value || "0"),
      pageViews: parseInt(mainRow?.metricValues?.[2]?.value || "0"),
      conversions: parseInt(mainRow?.metricValues?.[3]?.value || "0"),
      bounceRate: parseFloat(mainRow?.metricValues?.[4]?.value || "0"),
      avgSessionDuration: parseFloat(mainRow?.metricValues?.[5]?.value || "0"),
      topPages: (pagesRes.data.rows || []).map((r) => ({
        path: r.dimensionValues?.[0]?.value || "/",
        views: parseInt(r.metricValues?.[0]?.value || "0"),
      })),
      topSources: (sourcesRes.data.rows || []).map((r) => ({
        source: r.dimensionValues?.[0]?.value || "(direct)",
        medium: r.dimensionValues?.[1]?.value || "(none)",
        sessions: parseInt(r.metricValues?.[0]?.value || "0"),
      })),
      dailyBreakdown: (dailyRes.data.rows || []).map((r) => ({
        date: r.dimensionValues?.[0]?.value || "",
        sessions: parseInt(r.metricValues?.[0]?.value || "0"),
        users: parseInt(r.metricValues?.[1]?.value || "0"),
      })),
    };

    console.log(`[Analytics] GA4 fetched for org ${orgId}: ${summary.sessions} sessions, ${summary.users} users (${daysBack}d)`);
    return summary;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Analytics] GA4 fetch failed for org ${orgId}:`, message);
    return null;
  }
}

// =====================================================================
// GSC FETCH
// =====================================================================

/**
 * Fetch Google Search Console data for an organization.
 * Returns null if no GSC property connected or on error.
 */
/**
 * Fetch GSC data for an organization.
 * Same fallback pattern as GA4: tries org token, falls back to HW master.
 */
export async function fetchGSCData(
  orgId: number,
  daysBack: number = 30,
): Promise<GSCSummary | null> {
  const conn = await db("google_connections").where({ organization_id: orgId }).first();
  if (!conn?.refresh_token) return null;

  const pids = typeof conn.google_property_ids === "string"
    ? JSON.parse(conn.google_property_ids)
    : conn.google_property_ids;

  const gscSite = pids?.gsc?.siteUrl;
  if (!gscSite) return null;

  let auth = createOAuthClient(conn.access_token, conn.refresh_token);

  try {
    return await fetchGSCWithAuth(auth, gscSite, daysBack, orgId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("permission") || message.includes("scope")) {
      const masterConn = await db("google_connections").where({ email: "info@hamiltonwise.com" }).first();
      if (masterConn?.refresh_token) {
        console.log(`[Analytics] GSC org ${orgId}: falling back to HW master token`);
        auth = createOAuthClient(masterConn.access_token, masterConn.refresh_token);
        try {
          return await fetchGSCWithAuth(auth, gscSite, daysBack, orgId);
        } catch { /* master also failed */ }
      }
    }
    console.error(`[Analytics] GSC fetch failed for org ${orgId}:`, message);
    return null;
  }
}

async function fetchGSCWithAuth(
  auth: any,
  gscSite: string,
  daysBack: number,
  orgId: number,
): Promise<GSCSummary | null> {
  const searchconsole = google.searchconsole({ version: "v1", auth });

  const endDate = new Date().toISOString().split("T")[0];
  const startDateObj = new Date();
  startDateObj.setDate(startDateObj.getDate() - daysBack);
  const startDate = startDateObj.toISOString().split("T")[0];

  try {
    const [queryRes, pageRes] = await Promise.all([
      // Top queries
      searchconsole.searchanalytics.query({
        siteUrl: gscSite,
        requestBody: {
          startDate,
          endDate,
          dimensions: ["query"],
          rowLimit: 20,
          type: "web",
        },
      }),
      // Top pages
      searchconsole.searchanalytics.query({
        siteUrl: gscSite,
        requestBody: {
          startDate,
          endDate,
          dimensions: ["page"],
          rowLimit: 10,
          type: "web",
        },
      }),
    ]);

    const queryRows = queryRes.data.rows || [];
    const pageRows = pageRes.data.rows || [];

    const totalClicks = queryRows.reduce((s, r) => s + (r.clicks || 0), 0);
    const totalImpressions = queryRows.reduce((s, r) => s + (r.impressions || 0), 0);
    const avgPosition = queryRows.length > 0
      ? queryRows.reduce((s, r) => s + (r.position || 0), 0) / queryRows.length
      : 0;
    const avgCTR = totalImpressions > 0 ? totalClicks / totalImpressions : 0;

    const summary: GSCSummary = {
      dateRange: { start: startDate, end: endDate },
      totalClicks,
      totalImpressions,
      avgPosition: Math.round(avgPosition * 10) / 10,
      avgCTR: Math.round(avgCTR * 1000) / 10,
      topQueries: queryRows.map((r) => ({
        query: r.keys?.[0] || "",
        clicks: r.clicks || 0,
        impressions: r.impressions || 0,
        position: Math.round((r.position || 0) * 10) / 10,
        ctr: Math.round((r.ctr || 0) * 1000) / 10,
      })),
      topPages: pageRows.map((r) => ({
        page: r.keys?.[0] || "",
        clicks: r.clicks || 0,
        impressions: r.impressions || 0,
        position: Math.round((r.position || 0) * 10) / 10,
      })),
    };

    console.log(`[Analytics] GSC fetched for org ${orgId}: ${totalClicks} clicks, ${totalImpressions} impressions (${daysBack}d)`);
    return summary;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Analytics] GSC fetch failed for org ${orgId}:`, message);
    return null;
  }
}

// =====================================================================
// STORE
// =====================================================================

/**
 * Fetch GA4 + GSC for an org and store in google_data_store.
 */
export async function fetchAndStoreAnalytics(orgId: number): Promise<{
  ga4: boolean;
  gsc: boolean;
}> {
  const [ga4Data, gscData] = await Promise.all([
    fetchGA4Data(orgId),
    fetchGSCData(orgId),
  ]);

  const org = await db("organizations").where({ id: orgId }).select("domain").first();
  const domain = org?.domain || "unknown";
  const locationId = await db("locations")
    .where({ organization_id: orgId, is_primary: true })
    .select("id")
    .first()
    .then((l) => l?.id || null);

  if (ga4Data || gscData) {
    await db("google_data_store").insert({
      organization_id: orgId,
      location_id: locationId,
      domain,
      run_type: "analytics",
      gbp_data: null,
      ga4_data: ga4Data ? JSON.stringify(ga4Data) : null,
      gsc_data: gscData ? JSON.stringify(gscData) : null,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }

  return {
    ga4: !!ga4Data,
    gsc: !!gscData,
  };
}

// =====================================================================
// BATCH (all connected orgs)
// =====================================================================

/**
 * Fetch GA4 + GSC for ALL orgs that have connected properties.
 * Designed to run daily alongside GBP data aggregation.
 */
export async function fetchAnalyticsForAllOrgs(): Promise<{
  processed: number;
  ga4Success: number;
  gscSuccess: number;
  errors: number;
}> {
  const connections = await db("google_connections")
    .select("organization_id", "google_property_ids")
    .whereNotNull("refresh_token");

  let processed = 0;
  let ga4Success = 0;
  let gscSuccess = 0;
  let errors = 0;

  for (const conn of connections) {
    const pids = typeof conn.google_property_ids === "string"
      ? JSON.parse(conn.google_property_ids)
      : conn.google_property_ids;

    // Only process orgs that have GA4 or GSC
    if (!pids?.ga4?.propertyId && !pids?.gsc?.siteUrl) continue;

    try {
      const result = await fetchAndStoreAnalytics(conn.organization_id);
      processed++;
      if (result.ga4) ga4Success++;
      if (result.gsc) gscSuccess++;
    } catch (err: unknown) {
      errors++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Analytics] Error for org ${conn.organization_id}:`, message);
    }
  }

  console.log(`[Analytics] Complete: ${processed} processed, ${ga4Success} GA4, ${gscSuccess} GSC, ${errors} errors`);
  return { processed, ga4Success, gscSuccess, errors };
}
