import express from "express";
import axios from "axios";
import { mybusinessaccountmanagement_v1 } from "@googleapis/mybusinessaccountmanagement";
import { mybusinessbusinessinformation_v1 } from "@googleapis/mybusinessbusinessinformation";
// Calls client is optional — only import if you installed it
// import { mybusinessbusinesscalls_v1 } from "@googleapis/mybusinessbusinesscalls";
import { businessprofileperformance_v1 } from "@googleapis/businessprofileperformance";
import {
  tokenRefreshMiddleware,
  AuthenticatedRequest,
} from "../middleware/tokenRefresh";

const gbpRoutes = express.Router();

// Apply token refresh middleware to all GBP routes
gbpRoutes.use(tokenRefreshMiddleware);

/** API clients (no legacy google.mybusiness calls) */
const createClients = (req: AuthenticatedRequest) => {
  if (!req.oauth2Client) {
    throw new Error("OAuth2 client not initialized");
  }

  const auth = req.oauth2Client;

  const acctMgmt =
    new mybusinessaccountmanagement_v1.Mybusinessaccountmanagement({ auth });
  const bizInfo =
    new mybusinessbusinessinformation_v1.Mybusinessbusinessinformation({
      auth,
    });
  const perf = new businessprofileperformance_v1.Businessprofileperformance({
    auth,
  });

  // Optional calls client; comment out entirely if you didn't install the package
  // const calls =
  //   new mybusinessbusinesscalls_v1.Mybusinessbusinesscalls({ auth });

  return { acctMgmt, bizInfo, perf, /* calls, */ auth };
};

/** Error helper */
const handleError = (res: express.Response, error: any, operation: string) => {
  console.error(
    `${operation} Error:`,
    error?.response?.data || error?.message || error
  );
  return res
    .status(500)
    .json({ error: `Failed to ${operation.toLowerCase()}` });
};

/** Date helpers: previous month (PM) and the month before that (PPM) */
const getMonthlyRanges = () => {
  const now = new Date();
  const pmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const pmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const ppmStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const ppmEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return {
    prevMonth: { startDate: fmt(pmStart), endDate: fmt(pmEnd) },
    prevPrevMonth: { startDate: fmt(ppmStart), endDate: fmt(ppmEnd) },
  };
};

const buildAuthHeaders = async (auth: any): Promise<Record<string, string>> => {
  // Safest: construct from access token directly (avoids any Headers/iterable weirdness)
  const tokenResp = await auth.getAccessToken();
  const token =
    typeof tokenResp === "string" ? tokenResp : tokenResp?.token ?? "";
  return { Authorization: `Bearer ${token}` };
};

/** Reviews v4 via REST (paginate & compute window stats) */
const listAllReviewsInRangeREST = async (
  auth: any,
  accountId: string,
  locationId: string,
  startDate: string,
  endDate: string
) => {
  const parentPath = `accounts/${accountId}/locations/${locationId}`;
  const headers = await buildAuthHeaders(auth); // ✅ use helper

  const STAR_TO_NUM: Record<string, number> = {
    ONE: 1,
    TWO: 2,
    THREE: 3,
    FOUR: 4,
    FIVE: 5,
  };

  const reviews: any[] = [];
  let pageToken: string | undefined;

  do {
    const { data } = await axios.get(
      `https://mybusiness.googleapis.com/v4/${parentPath}/reviews`,
      {
        params: { pageSize: 50, pageToken, orderBy: "updateTime desc" },
        headers,
      }
    );

    for (const r of data.reviews || []) {
      const created: string | undefined = r.createTime; // count NEW by createTime
      if (
        created &&
        created >= `${startDate}T00:00:00Z` &&
        created <= `${endDate}T23:59:59Z`
      ) {
        reviews.push(r);
      }
    }
    pageToken = data.nextPageToken || undefined;
  } while (pageToken);

  // ⭐ enum -> number
  const stars = reviews
    .map((r) => {
      const s = r.starRating;
      if (typeof s === "number") return s;
      if (typeof s === "string") return STAR_TO_NUM[s];
      return undefined;
    })
    .filter((n: number | undefined): n is number =>
      Number.isFinite(n as number)
    );

  const avgRatingWindow = stars.length
    ? Number((stars.reduce((a, b) => a + b, 0) / stars.length).toFixed(2))
    : null;

  return { newReviewsCount: reviews.length, avgRatingWindow };
};

/** Performance time-series fetcher (CALL_CLICKS etc.) */
const fetchPerfTimeSeries = async (
  perf: businessprofileperformance_v1.Businessprofileperformance,
  locationId: string,
  metrics: string[],
  startDate: string,
  endDate: string
) => {
  const location = `locations/${locationId}`;
  const y1 = +startDate.slice(0, 4);
  const m1 = +startDate.slice(5, 7);
  const d1 = +startDate.slice(8, 10);
  const y2 = +endDate.slice(0, 4);
  const m2 = +endDate.slice(5, 7);
  const d2 = +endDate.slice(8, 10);

  const resp = await perf.locations.fetchMultiDailyMetricsTimeSeries({
    location,
    dailyMetrics: metrics,
    // IMPORTANT: dot-notation query params (no nested objects)
    "dailyRange.startDate.year": y1,
    "dailyRange.startDate.month": m1,
    "dailyRange.startDate.day": d1,
    "dailyRange.endDate.year": y2,
    "dailyRange.endDate.month": m2,
    "dailyRange.endDate.day": d2,
  } as any);

  return resp.data.multiDailyMetricTimeSeries || [];
};

/** Fallback: total CALL_CLICKS from Performance */
const getCallClicksTotal = async (
  perf: businessprofileperformance_v1.Businessprofileperformance,
  locationId: string,
  startDate: string,
  endDate: string
) => {
  const seriesResp = await fetchPerfTimeSeries(
    perf,
    locationId,
    ["CALL_CLICKS"],
    startDate,
    endDate
  );

  // seriesResp is Schema$MultiDailyMetricTimeSeries[] from the API
  const first = seriesResp?.[0];
  const dmtList = first?.dailyMetricTimeSeries ?? [];

  const callClicksEntry = dmtList.find(
    (e: any) => e.dailyMetric === "CALL_CLICKS"
  );

  const dated = callClicksEntry?.timeSeries?.datedValues ?? [];
  const total = dated.reduce((sum: number, dv: any) => {
    // value is a string; may be undefined if 0
    const v = dv?.value !== undefined ? Number(dv.value) : 0;
    return sum + (isNaN(v) ? 0 : v);
  }, 0);

  return { callClicksTotal: total };
};

/** Helper function to safely calculate percentage change */
const safePercentageChange = (current: number, previous: number): number => {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return 0;
  if (previous === 0) return current > 0 ? 100 : 0; // Handle division by zero
  return ((current - previous) / previous) * 100;
};

/** Trend score calculation function for GBP metrics */
const calculateGBPTrendScore = (currentData: any, previousData: any) => {
  // newReviews change (50% weight)
  const newReviewsChange = safePercentageChange(
    currentData.newReviews,
    previousData.newReviews
  );

  // avgRating change (30% weight)
  const avgRatingChange = safePercentageChange(
    currentData.avgRating,
    previousData.avgRating
  );

  // callClicks change (20% weight)
  const callClicksChange = safePercentageChange(
    currentData.callClicks,
    previousData.callClicks
  );

  // Weighted average: newReviews (30%), avgRating (50%), callClicks (20%)
  const trendScore =
    newReviewsChange * 0.3 + avgRatingChange * 0.5 + callClicksChange * 0.2;

  return Math.round(trendScore * 100) / 100; // Round to 2 decimal places
};

/** ---------- ROUTES ---------- */

/**
 * POST /gbp/getKeyData
 * Body: { accountId: string, locationId: string }
 * Returns: GA4-style structured response with trend score analysis
 * - newReviews: { prevMonth: number, currMonth: number }
 * - avgRating: { prevMonth: number, currMonth: number }
 * - callClicks: { prevMonth: number, currMonth: number }
 * - trendScore: number (weighted: newReviews 50%, avgRating 30%, callClicks 20%)
 * - Falls back from Business Calls API to Performance CALL_CLICKS if needed
 */
gbpRoutes.post("/getKeyData", async (req: AuthenticatedRequest, res) => {
  try {
    const { accountId, locationId } = req.body || {};
    if (!accountId || !locationId) {
      return res.json({
        successful: false,
        message: "Missing accountId or locationId",
      });
    }
    const { auth, perf /* , calls */ } = createClients(req);
    const { prevMonth, prevPrevMonth } = getMonthlyRanges();

    // Reviews (prev & prev-prev)
    const [pmReviews, ppmReviews] = await Promise.all([
      listAllReviewsInRangeREST(
        auth,
        accountId,
        locationId,
        prevMonth.startDate,
        prevMonth.endDate
      ),
      listAllReviewsInRangeREST(
        auth,
        accountId,
        locationId,
        prevPrevMonth.startDate,
        prevPrevMonth.endDate
      ),
    ]);

    // Calls (try Business Calls API first; if not available, fallback to CALL_CLICKS)
    const getCalls = async (start: string, end: string) => {
      try {
        // If you installed the calls client and enabled API, uncomment and use:
        // const parent = `locations/${locationId}`;
        // const filter = `startDate=${start} AND endDate=${end} AND metricType=AGGREGATE_COUNT`;
        // const { data } = await calls.locations.businesscallsinsights.list({ parent, filter });
        // const agg = data.businessCallsInsights?.[0]?.aggregateMetrics;
        // if (agg) {
        //   return {
        //     source: "business_calls_api",
        //     answered: agg.answeredCallsCount || 0,
        //     missed: agg.missedCallsCount || 0,
        //     totalCalls: (agg.answeredCallsCount || 0) + (agg.missedCallsCount || 0),
        //   };
        // }

        // Fallback to CALL_CLICKS (always available if Performance API is enabled)
        const fallback = await getCallClicksTotal(perf, locationId, start, end);
        return { source: "performance_call_clicks", ...fallback };
      } catch {
        const fallback = await getCallClicksTotal(perf, locationId, start, end);
        return { source: "performance_call_clicks", ...fallback };
      }
    };

    const [pmCalls, ppmCalls] = await Promise.all([
      getCalls(prevMonth.startDate, prevMonth.endDate),
      getCalls(prevPrevMonth.startDate, prevPrevMonth.endDate),
    ]);

    // Extract call clicks from nested structure, handle missing data
    const currentCallClicks = pmCalls.callClicksTotal || 0;
    const previousCallClicks = ppmCalls.callClicksTotal || 0;

    // Create current and previous data objects for trend calculation
    const currentData = {
      newReviews: pmReviews.newReviewsCount || 0,
      avgRating: pmReviews.avgRatingWindow || 0,
      callClicks: currentCallClicks,
    };

    const previousData = {
      newReviews: ppmReviews.newReviewsCount || 0,
      avgRating: ppmReviews.avgRatingWindow || 0,
      callClicks: previousCallClicks,
    };

    // Calculate trend score
    const trendScore = calculateGBPTrendScore(currentData, previousData);

    // Return GA4-style structured response
    return res.json({
      newReviews: {
        prevMonth: previousData.newReviews,
        currMonth: currentData.newReviews,
      },
      avgRating: {
        prevMonth: previousData.avgRating,
        currMonth: currentData.avgRating,
      },
      callClicks: {
        prevMonth: previousData.callClicks,
        currMonth: currentData.callClicks,
      },
      trendScore,
    });
  } catch (error: any) {
    return handleError(res, error, "GBP monthly summary");
  }
});

/**
 * POST /gbp/getAIReadyData
 * Body: { accountId: string, locationId: string, startDate?: "YYYY-MM-DD", endDate?: "YYYY-MM-DD" }
 * - Always includes Performance series (incl. CALL_CLICKS).
 */
gbpRoutes.post("/getAIReadyData", async (req: AuthenticatedRequest, res) => {
  try {
    const { accountId, locationId } = req.body || {};
    if (!accountId || !locationId) {
      return res.json({
        successful: false,
        message: "Missing accountId or locationId",
      });
    }
    const { auth, perf } = createClients(req);

    const { prevMonth } = getMonthlyRanges();
    const startDate = req.body.startDate || prevMonth.startDate;
    const endDate = req.body.endDate || prevMonth.endDate;

    const metrics = [
      "CALL_CLICKS",
      "WEBSITE_CLICKS",
      "BUSINESS_DIRECTION_REQUESTS",
    ];

    const timeSeries = await fetchPerfTimeSeries(
      perf,
      locationId,
      metrics,
      startDate,
      endDate
    );

    // Reviews all-time + window stats
    const parentPath = `accounts/${accountId}/locations/${locationId}`;
    const headers = await buildAuthHeaders(auth); // ✅ use helper
    const firstPage = await axios.get(
      `https://mybusiness.googleapis.com/v4/${parentPath}/reviews`,
      { params: { pageSize: 1 }, headers }
    );
    const allTimeAvg = firstPage.data?.averageRating || 0;
    const allTimeCount = firstPage.data?.totalReviewCount || 0;

    const windowStats = await listAllReviewsInRangeREST(
      auth,
      accountId,
      locationId,
      startDate,
      endDate
    );

    return res.json({
      meta: { accountId, locationId, dateRange: { startDate, endDate } },
      reviews: {
        allTime: { averageRating: allTimeAvg, totalReviewCount: allTimeCount },
        window: {
          averageRating: windowStats.avgRatingWindow,
          newReviews: windowStats.newReviewsCount,
        },
      },
      performance: {
        series: timeSeries, // includes CALL_CLICKS (unique-user-per-day)
      },
    });
  } catch (error: any) {
    return handleError(res, error, "GBP AI data");
  }
});

/** Diagnosis (unchanged) */
gbpRoutes.get("/diag/accounts", async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.oauth2Client) {
      throw new Error("OAuth2 client not initialized");
    }
    const auth = req.oauth2Client;
    const acctMgmt =
      new mybusinessaccountmanagement_v1.Mybusinessaccountmanagement({ auth });
    const { data } = await acctMgmt.accounts.list({});
    return res.json(data.accounts ?? []);
  } catch (err: any) {
    console.error(
      "List accounts Error:",
      err?.response?.data || err?.message || err
    );
    return res.status(500).json({ error: "Failed to list accounts" });
  }
});

gbpRoutes.get("/diag/locations", async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.oauth2Client) {
      throw new Error("OAuth2 client not initialized");
    }
    const auth = req.oauth2Client;
    const acctMgmt =
      new mybusinessaccountmanagement_v1.Mybusinessaccountmanagement({ auth });
    const bizInfo =
      new mybusinessbusinessinformation_v1.Mybusinessbusinessinformation({
        auth,
      });

    let { accountName } = req.query as { accountName?: string };
    if (!accountName) {
      const { data: acctData } = await acctMgmt.accounts.list({});
      accountName = acctData.accounts?.[0]?.name ?? undefined;
      if (!accountName) return res.json([]);
    }

    const locations: Array<Record<string, any>> = [];
    let pageToken: string | undefined;

    do {
      const { data } = await bizInfo.accounts.locations.list({
        parent: accountName,
        readMask: "name,title,storeCode,metadata",
        pageSize: 100,
        pageToken,
      });
      for (const loc of data.locations ?? []) {
        locations.push({
          name: loc.name,
          title: (loc as any).title,
          storeCode: (loc as any).storeCode,
          metadata: (loc as any).metadata,
        });
      }
      pageToken = data.nextPageToken || undefined;
    } while (pageToken);

    return res.json(locations);
  } catch (e: any) {
    console.error(
      "List locations Error:",
      e?.response?.data || e?.message || e
    );
    return res.status(500).json({ error: "Failed to list locations" });
  }
});

export default gbpRoutes;
