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

// Helper: Fetch location profile with comprehensive data using REST API
// Exported for use in practice ranking
const getLocationProfileForRanking = async (
  auth: any,
  accountId: string,
  locationId: string
) => {
  try {
    // Business Information API v1 uses locations/{locationId} format
    const locationName = `locations/${locationId}`;
    const headers = await buildAuthHeaders(auth);

    console.log(`[GBP Profile] Fetching profile for location ${locationId}...`);

    // Fetch comprehensive profile data including hours
    const { data } = await axios.get(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${locationName}`,
      {
        params: {
          readMask:
            "name,title,profile,websiteUri,phoneNumbers,categories,regularHours,specialHours,adWordsLocationExtensions",
        },
        headers,
      }
    );

    console.log(
      `[GBP Profile] ✓ Got profile for ${locationId}: title=${data?.title}, website=${data?.websiteUri}, phone=${data?.phoneNumbers?.primaryPhone}, category=${data?.categories?.primaryCategory?.displayName}`
    );

    return data;
  } catch (error: any) {
    // Try alternate format with accounts prefix
    try {
      const alternateName = `accounts/${accountId}/locations/${locationId}`;
      const headers = await buildAuthHeaders(auth);

      console.log(
        `[GBP Profile] Retrying with alternate format: ${alternateName}`
      );

      const { data } = await axios.get(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${alternateName}`,
        {
          params: {
            readMask:
              "name,title,profile,websiteUri,phoneNumbers,categories,regularHours,specialHours,adWordsLocationExtensions",
          },
          headers,
        }
      );

      console.log(
        `[GBP Profile] ✓ Got profile with alternate format for ${locationId}`
      );

      return data;
    } catch (altError: any) {
      console.warn(
        `[GBP Profile] ✗ Could not fetch profile for location ${locationId}: ${error.message} | Alt: ${altError.message}`
      );
      // Log full error details for debugging
      if (error?.response?.data) {
        console.warn(
          `[GBP Profile] Error response:`,
          JSON.stringify(error.response.data)
        );
      }
      return null;
    }
  }
};

// Exported function for direct use (bypassing HTTP)
export async function getGBPAIReadyData(
  oauth2Client: any,
  accountId: string,
  locationId: string,
  startDate?: string,
  endDate?: string
) {
  const perf = new businessprofileperformance_v1.Businessprofileperformance({
    auth: oauth2Client,
  });

  const { prevMonth } = getMonthlyRanges();
  const finalStartDate = startDate || prevMonth.startDate;
  const finalEndDate = endDate || prevMonth.endDate;

  const metrics = [
    "CALL_CLICKS",
    "WEBSITE_CLICKS",
    "BUSINESS_DIRECTION_REQUESTS",
  ];

  // Fetch all data in parallel for better performance
  const [timeSeries, reviewsPage, windowStats, profileData] = await Promise.all(
    [
      fetchPerfTimeSeries(
        perf,
        locationId,
        metrics,
        finalStartDate,
        finalEndDate
      ),
      // Reviews all-time stats
      (async () => {
        const parentPath = `accounts/${accountId}/locations/${locationId}`;
        const headers = await buildAuthHeaders(oauth2Client);
        const firstPage = await axios.get(
          `https://mybusiness.googleapis.com/v4/${parentPath}/reviews`,
          { params: { pageSize: 1 }, headers }
        );
        return {
          allTimeAvg: firstPage.data?.averageRating || 0,
          allTimeCount: firstPage.data?.totalReviewCount || 0,
        };
      })(),
      // Reviews in date window
      listAllReviewsInRangeREST(
        oauth2Client,
        accountId,
        locationId,
        finalStartDate,
        finalEndDate
      ),
      // Profile data (website, phone, hours, category)
      getLocationProfileForRanking(oauth2Client, accountId, locationId),
    ]
  );

  return {
    meta: {
      accountId,
      locationId,
      dateRange: { startDate: finalStartDate, endDate: finalEndDate },
    },
    reviews: {
      allTime: {
        averageRating: reviewsPage.allTimeAvg,
        totalReviewCount: reviewsPage.allTimeCount,
      },
      window: {
        averageRating: windowStats.avgRatingWindow,
        newReviews: windowStats.newReviewsCount,
      },
    },
    performance: {
      series: timeSeries, // includes CALL_CLICKS (unique-user-per-day)
    },
    // Profile data for NAP consistency scoring
    profile: {
      title: profileData?.title || null,
      description: profileData?.profile?.description || null,
      websiteUri: profileData?.websiteUri || null,
      phoneNumber: profileData?.phoneNumbers?.primaryPhone || null,
      primaryCategory:
        profileData?.categories?.primaryCategory?.displayName || null,
      additionalCategories:
        profileData?.categories?.additionalCategories?.map(
          (c: any) => c.displayName
        ) || [],
      regularHours: profileData?.regularHours || null,
      hasHours: !!(
        profileData?.regularHours?.periods &&
        profileData.regularHours.periods.length > 0
      ),
    },
  };
}

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

    const { prevMonth } = getMonthlyRanges();
    const startDate = req.body.startDate || prevMonth.startDate;
    const endDate = req.body.endDate || prevMonth.endDate;

    const aiReadyData = await getGBPAIReadyData(
      req.oauth2Client,
      accountId,
      locationId,
      startDate,
      endDate
    );

    return res.json(aiReadyData);
  } catch (error: any) {
    return handleError(res, error, "GBP AI data");
  }
});
/** ---------- NEW: TEXT SOURCES FOR COPY OPTIMIZER ---------- */

/**
 * Helper: Fetch location profile with comprehensive data using REST API
 * Returns null if profile cannot be fetched (graceful degradation)
 */
const getLocationProfile = async (
  auth: any,
  accountId: string,
  locationId: string
) => {
  try {
    const name = `accounts/${accountId}/locations/${locationId}`;
    const headers = await buildAuthHeaders(auth);

    // Try the v1 endpoint
    const { data } = await axios.get(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${name}`,
      {
        params: {
          readMask:
            "name,title,profile,websiteUri,phoneNumbers,categories,adWordsLocationExtensions",
        },
        headers,
      }
    );
    return data;
  } catch (error: any) {
    console.warn(
      `[GBP] Could not fetch detailed profile for location ${locationId}: ${error.message}`
    );
    // Return null to use fallback data
    return null;
  }
};

/**
 * Helper: List local posts in date range with early exit optimization
 */
const listLocalPostsInRange = async (
  auth: any,
  accountId: string,
  locationId: string,
  startDate: string,
  endDate: string,
  maxPosts: number = 50
) => {
  const parent = `accounts/${accountId}/locations/${locationId}`;
  const headers = await buildAuthHeaders(auth);
  const posts: any[] = [];
  let pageToken: string | undefined;

  do {
    const { data } = await axios.get(
      `https://mybusiness.googleapis.com/v4/${parent}/localPosts`,
      {
        params: { pageSize: 100, pageToken },
        headers,
      }
    );

    let shouldContinue = false;

    for (const post of data.localPosts || []) {
      const created = post.createTime;

      // If post is older than our range, stop fetching
      if (created < `${startDate}T00:00:00Z`) {
        shouldContinue = false;
        break;
      }

      // If post is within our range, collect it
      if (
        created >= `${startDate}T00:00:00Z` &&
        created <= `${endDate}T23:59:59Z`
      ) {
        posts.push({
          postId: post.name?.split("/").pop() || "",
          topicType: post.topicType || "STANDARD",
          summary: post.summary || "",
          callToAction: post.callToAction
            ? {
                actionType: post.callToAction.actionType || null,
                url: post.callToAction.url || null,
              }
            : null,
          createTime: post.createTime,
          updateTime: post.updateTime,
          state: post.state || "UNKNOWN",
        });
        shouldContinue = true;

        // Enforce max posts limit for LLM
        if (posts.length >= maxPosts) {
          shouldContinue = false;
          break;
        }
      }
    }

    // Exit early if we've passed our date range or hit max
    if (!shouldContinue) break;

    pageToken = data.nextPageToken;
  } while (pageToken);

  return posts;
};

/**
 * Exported function for programmatic use (bypassing HTTP)
 * Gets text sources for all GBP locations for a given Google account
 */
export async function getGBPTextSources(
  oauth2Client: any,
  googleAccountId: number,
  startDate?: string,
  endDate?: string,
  options?: {
    maxPostsPerLocation?: number;
    includeEmptyLocations?: boolean;
  }
) {
  const { maxPostsPerLocation = 50, includeEmptyLocations = true } =
    options || {};

  // Import db here to avoid circular dependency
  const { db } = await import("../database/connection");

  console.log(
    `[GBP TextSources Export] Starting for googleAccountId ${googleAccountId}`
  );

  // Query database for property IDs
  const account = await db("google_accounts")
    .where({ id: googleAccountId })
    .first();

  if (!account?.google_property_ids?.gbp) {
    throw new Error(
      `No GBP properties configured for googleAccountId ${googleAccountId}`
    );
  }

  const gbpLocations = Array.isArray(account.google_property_ids.gbp)
    ? account.google_property_ids.gbp
    : [];

  if (gbpLocations.length === 0) {
    return {
      locations: [],
      summary: {
        googleAccountId,
        totalLocations: 0,
        dateRange: { startDate: "", endDate: "" },
        message: "No GBP locations configured",
      },
    };
  }

  console.log(
    `[GBP TextSources Export] Processing ${gbpLocations.length} locations`
  );

  // Rate limiting check
  if (gbpLocations.length > 20) {
    throw new Error(
      `Too many locations to process at once (${gbpLocations.length}). Maximum 20 locations per request.`
    );
  }

  // Create API clients
  const bizInfo =
    new mybusinessbusinessinformation_v1.Mybusinessbusinessinformation({
      auth: oauth2Client,
    });
  const auth = oauth2Client;

  // Get date range
  const { prevMonth } = getMonthlyRanges();
  const finalStartDate = startDate || prevMonth.startDate;
  const finalEndDate = endDate || prevMonth.endDate;

  console.log(
    `[GBP TextSources Export] Date range: ${finalStartDate} to ${finalEndDate}`
  );

  // Process locations in batches of 5 to avoid overwhelming the API
  const batchSize = 5;
  const locationResults: any[] = [];
  const errors: any[] = [];

  for (let i = 0; i < gbpLocations.length; i += batchSize) {
    const batch = gbpLocations.slice(i, i + batchSize);
    console.log(
      `[GBP TextSources Export] Processing batch ${
        Math.floor(i / batchSize) + 1
      }/${Math.ceil(gbpLocations.length / batchSize)}`
    );

    const batchResults = await Promise.all(
      batch.map(async (location: any) => {
        try {
          // Fetch posts (required)
          const posts = await listLocalPostsInRange(
            auth,
            location.accountId,
            location.locationId,
            finalStartDate,
            finalEndDate,
            maxPostsPerLocation
          );

          // Fetch profile (optional - graceful fallback)
          const profile = await getLocationProfile(
            auth,
            location.accountId,
            location.locationId
          );

          // Skip locations with no posts if configured
          if (!includeEmptyLocations && posts.length === 0) {
            return null;
          }

          return {
            gbp_profile: {
              businessName: profile?.title || location.displayName,
              locationId: location.locationId,
              accountId: location.accountId,
              description: profile?.profile?.description || "",
              websiteUrl: profile?.websiteUri || "",
              phoneNumber: profile?.phoneNumbers?.primaryPhone || "",
              categories:
                profile?.categories?.primaryCategory?.displayName || "",
              adPhone: profile?.adWordsLocationExtensions?.adPhone || "",
            },
            gbp_posts: posts,
            meta: {
              displayName: location.displayName,
              postsCount: posts.length,
            },
          };
        } catch (error: any) {
          console.error(
            `[GBP TextSources Export] Failed for location ${location.locationId}:`,
            error.message
          );
          errors.push({
            locationId: location.locationId,
            displayName: location.displayName,
            error: error.message,
            timestamp: new Date().toISOString(),
          });
          return null;
        }
      })
    );

    locationResults.push(...batchResults);

    // Add delay between batches to respect rate limits
    if (i + batchSize < gbpLocations.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // Filter out failed locations
  const locations = locationResults.filter((loc) => loc !== null);

  console.log(
    `[GBP TextSources Export] ✓ Completed: ${locations.length} successful, ${errors.length} errors`
  );

  return {
    locations,
    errors: errors.length > 0 ? errors : undefined,
    summary: {
      googleAccountId,
      totalLocations: locations.length,
      totalErrors: errors.length,
      successRate:
        gbpLocations.length > 0
          ? Number((locations.length / gbpLocations.length).toFixed(2))
          : 0,
      dateRange: { startDate: finalStartDate, endDate: finalEndDate },
    },
  };
}

/**
 * POST /gbp/getTextSources
 * Headers: googleAccountId (from tokenRefreshMiddleware)
 * Body: {
 *   startDate?: "YYYY-MM-DD",
 *   endDate?: "YYYY-MM-DD",
 *   maxPostsPerLocation?: number,
 *   includeEmptyLocations?: boolean
 * }
 * Returns: Text sources for all GBP locations (profile + posts) for copy optimization
 */
gbpRoutes.post("/getTextSources", async (req: AuthenticatedRequest, res) => {
  const startTime = Date.now();

  try {
    const googleAccountId = (req as any).googleAccountId;

    if (!googleAccountId) {
      return res.status(400).json({
        successful: false,
        message: "Missing googleAccountId header",
      });
    }

    console.log(
      `[GBP TextSources] Starting for googleAccountId ${googleAccountId}`
    );

    // Import db here
    const { db } = await import("../database/connection");

    // Query database for property IDs
    const account = await db("google_accounts")
      .where({ id: googleAccountId })
      .first();

    // Validation
    if (!account) {
      return res.status(404).json({
        successful: false,
        message: `Google account ${googleAccountId} not found`,
      });
    }

    if (!account.google_property_ids) {
      return res.status(400).json({
        successful: false,
        message: "Google properties not configured for this account",
        hint: "Please connect Google Business Profile first",
      });
    }

    const gbpLocations = Array.isArray(account.google_property_ids.gbp)
      ? account.google_property_ids.gbp
      : [];

    if (gbpLocations.length === 0) {
      return res.json({
        locations: [],
        summary: {
          googleAccountId,
          totalLocations: 0,
          dateRange: { startDate: "", endDate: "" },
          message: "No GBP locations configured",
        },
      });
    }

    console.log(
      `[GBP TextSources] Processing ${gbpLocations.length} locations`
    );

    // Rate limiting check
    if (gbpLocations.length > 20) {
      return res.status(400).json({
        successful: false,
        message: `Too many locations to process at once (${gbpLocations.length})`,
        hint: "Maximum 20 locations per request. Consider batching or contacting support.",
      });
    }

    // Get options from body (handle empty body)
    const body = req.body || {};
    const maxPostsPerLocation = body.maxPostsPerLocation || 50;
    const includeEmptyLocations = body.includeEmptyLocations !== false;

    // Get date range
    const { prevMonth } = getMonthlyRanges();
    const startDate = body.startDate || prevMonth.startDate;
    const endDate = body.endDate || prevMonth.endDate;

    console.log(`[GBP TextSources] Date range: ${startDate} to ${endDate}`);
    console.log(
      `[GBP TextSources] Max posts per location: ${maxPostsPerLocation}`
    );

    // Create API clients
    const { bizInfo, auth } = createClients(req);

    // Process locations in batches of 5 to avoid overwhelming the API
    const batchSize = 5;
    const locationResults: any[] = [];
    const errors: any[] = [];

    for (let i = 0; i < gbpLocations.length; i += batchSize) {
      const batch = gbpLocations.slice(i, i + batchSize);
      console.log(
        `[GBP TextSources] Processing batch ${
          Math.floor(i / batchSize) + 1
        }/${Math.ceil(gbpLocations.length / batchSize)}`
      );

      const batchResults = await Promise.all(
        batch.map(async (location: any) => {
          try {
            // Fetch posts (required)
            const posts = await listLocalPostsInRange(
              auth,
              location.accountId,
              location.locationId,
              startDate,
              endDate,
              maxPostsPerLocation
            );

            // Fetch profile (optional - graceful fallback)
            const profile = await getLocationProfile(
              auth,
              location.accountId,
              location.locationId
            );

            // Skip locations with no posts if configured
            if (!includeEmptyLocations && posts.length === 0) {
              return null;
            }

            return {
              gbp_profile: {
                businessName: profile?.title || location.displayName,
                locationId: location.locationId,
                accountId: location.accountId,
                description: profile?.profile?.description || "",
                websiteUrl: profile?.websiteUri || "",
                phoneNumber: profile?.phoneNumbers?.primaryPhone || "",
                categories:
                  profile?.categories?.primaryCategory?.displayName || "",
                adPhone: profile?.adWordsLocationExtensions?.adPhone || "",
              },
              gbp_posts: posts,
              meta: {
                displayName: location.displayName,
                postsCount: posts.length,
              },
            };
          } catch (error: any) {
            console.error(
              `[GBP TextSources] Failed for location ${location.locationId}:`,
              error.message
            );
            errors.push({
              locationId: location.locationId,
              displayName: location.displayName,
              error: error.message,
              timestamp: new Date().toISOString(),
            });
            return null;
          }
        })
      );

      locationResults.push(...batchResults);

      // Add delay between batches to respect rate limits
      if (i + batchSize < gbpLocations.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Filter out failed locations
    const locations = locationResults.filter((loc) => loc !== null);

    const duration = Date.now() - startTime;
    console.log(`[GBP TextSources] ✓ Completed in ${duration}ms`);
    console.log(
      `[GBP TextSources] Success: ${locations.length}, Errors: ${errors.length}`
    );

    return res.json({
      locations,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        googleAccountId,
        totalLocations: locations.length,
        totalErrors: errors.length,
        successRate:
          gbpLocations.length > 0
            ? Number((locations.length / gbpLocations.length).toFixed(2))
            : 0,
        dateRange: { startDate, endDate },
        processingTimeMs: duration,
      },
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(
      `[GBP TextSources] ✗ Failed after ${duration}ms:`,
      error.message
    );
    return handleError(res, error, "GBP text sources");
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
