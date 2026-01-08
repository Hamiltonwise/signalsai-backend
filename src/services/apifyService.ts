/**
 * Apify Service
 * Handles Google Maps scraping for competitor discovery and data collection
 */

import axios from "axios";

const APIFY_API_TOKEN = process.env.APIFY_TOKEN;
const APIFY_API_BASE = "https://api.apify.com/v2";

// Google Maps Scraper Actor ID (using compass crawler)
// Note: Use tilde (~) instead of slash (/) for Apify API URL format
const GOOGLE_MAPS_ACTOR = "compass~crawler-google-places";

// Lighthouse/SEO Audit Actor ID
// Note: Use tilde (~) instead of slash (/) for Apify API URL format
const LIGHTHOUSE_ACTOR = "apify~lighthouse";

interface ApifyRunResult {
  id: string;
  status: string;
  datasetId?: string;
}

interface CompetitorSearchResult {
  placeId: string;
  name: string;
  address: string;
  category: string;
  totalScore: number;
  reviewsCount: number;
  url: string;
  website?: string;
  phone?: string;
  location?: {
    lat: number;
    lng: number;
  };
}

interface CompetitorDetailedData {
  placeId: string;
  name: string;
  address: string;
  categories: string[];
  primaryCategory: string;
  totalReviews: number;
  averageRating: number;
  reviewsLast30d?: number;
  reviewsLast90d?: number;
  photosCount: number;
  postsLast90d?: number;
  hasWebsite: boolean;
  hasPhone: boolean;
  hasHours: boolean;
  hoursComplete: boolean;
  descriptionLength: number;
  hasKeywordInName: boolean;
  website?: string;
  phone?: string;
  openingHours?: any;
  reviewsDistribution?: {
    oneStar: number;
    twoStar: number;
    threeStar: number;
    fourStar: number;
    fiveStar: number;
  };
  recentReviews?: Array<{
    author: string;
    rating: number;
    text: string;
    publishedAtDate: string;
  }>;
}

interface WebsiteAuditResult {
  url: string;
  lcp: number;
  fid: number;
  cls: number;
  performanceScore: number;
  accessibilityScore: number;
  bestPracticesScore: number;
  seoScore: number;
  hasLocalSchema: boolean;
  hasOrganizationSchema: boolean;
  hasReviewSchema: boolean;
  hasFaqSchema: boolean;
  mobileFriendly: boolean;
  https: boolean;
}

/**
 * Log helper for Apify operations
 */
function log(message: string): void {
  console.log(`[APIFY] ${message}`);
}

/**
 * Wait for Apify actor run to complete
 */
async function waitForActorRun(
  runId: string,
  maxWaitMs: number = 300000
): Promise<ApifyRunResult> {
  const startTime = Date.now();
  const pollInterval = 5000; // 5 seconds

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await axios.get(
        `${APIFY_API_BASE}/actor-runs/${runId}`,
        {
          headers: { Authorization: `Bearer ${APIFY_API_TOKEN}` },
        }
      );

      const run = response.data.data;
      log(`Run ${runId} status: ${run.status}`);

      if (run.status === "SUCCEEDED") {
        return {
          id: run.id,
          status: run.status,
          datasetId: run.defaultDatasetId,
        };
      }

      if (
        run.status === "FAILED" ||
        run.status === "ABORTED" ||
        run.status === "TIMED-OUT"
      ) {
        throw new Error(`Actor run failed with status: ${run.status}`);
      }

      // Still running, wait and poll again
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(`Actor run ${runId} not found`);
      }
      throw error;
    }
  }

  throw new Error(`Actor run ${runId} timed out after ${maxWaitMs}ms`);
}

/**
 * Fetch dataset items from Apify
 */
async function fetchDatasetItems(datasetId: string): Promise<any[]> {
  try {
    const response = await axios.get(
      `${APIFY_API_BASE}/datasets/${datasetId}/items`,
      {
        headers: { Authorization: `Bearer ${APIFY_API_TOKEN}` },
        params: { format: "json" },
      }
    );
    return response.data;
  } catch (error: any) {
    log(`Error fetching dataset ${datasetId}: ${error.message}`);
    throw error;
  }
}

/**
 * Discover competitors by searching Google Maps
 * @param searchQuery - Search query (e.g., "orthodontist Austin TX")
 * @param limit - Maximum number of results (default 20)
 */
export async function discoverCompetitors(
  searchQuery: string,
  limit: number = 20
): Promise<CompetitorSearchResult[]> {
  if (!APIFY_API_TOKEN) {
    throw new Error("APIFY_TOKEN environment variable is not set");
  }

  log(`Discovering competitors for: "${searchQuery}" (limit: ${limit})`);

  try {
    // Start the Google Maps scraper actor (using compass/crawler-google-places input format)
    const runResponse = await axios.post(
      `${APIFY_API_BASE}/acts/${GOOGLE_MAPS_ACTOR}/runs`,
      {
        searchStringsArray: [searchQuery],
        maxCrawledPlacesPerSearch: limit,
        language: "en",
        maxReviews: 0,
        maxImages: 0,
      },
      {
        headers: {
          Authorization: `Bearer ${APIFY_API_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    const runId = runResponse.data.data.id;
    log(`Started actor run: ${runId}`);

    // Wait for completion
    const runResult = await waitForActorRun(runId);

    if (!runResult.datasetId) {
      throw new Error("No dataset ID returned from actor run");
    }

    // Fetch results
    const items = await fetchDatasetItems(runResult.datasetId);
    log(`Fetched ${items.length} competitor results`);

    // Transform to our format
    const competitors: CompetitorSearchResult[] = items.map((item) => ({
      placeId: item.placeId,
      name: item.title || item.name,
      address: item.address,
      category: item.categoryName || item.categories?.[0] || "Unknown",
      totalScore: item.totalScore || 0,
      reviewsCount: item.reviewsCount || 0,
      url: item.url,
      website: item.website,
      phone: item.phone,
      location: item.location
        ? {
            lat: item.location.lat,
            lng: item.location.lng,
          }
        : undefined,
    }));

    // Sort competitors deterministically for consistent results:
    // 1. By review count (descending) - more established businesses first
    // 2. By rating (descending) - higher quality
    // 3. By placeId (alphabetical) - deterministic tiebreaker
    competitors.sort((a, b) => {
      // Primary sort: review count (descending)
      if (b.reviewsCount !== a.reviewsCount) {
        return b.reviewsCount - a.reviewsCount;
      }
      // Secondary sort: rating (descending)
      if (b.totalScore !== a.totalScore) {
        return b.totalScore - a.totalScore;
      }
      // Tertiary sort: placeId (alphabetical) for deterministic tiebreaker
      return a.placeId.localeCompare(b.placeId);
    });

    log(`Sorted ${competitors.length} competitors by reviews/rating/placeId`);

    return competitors;
  } catch (error: any) {
    log(`Error discovering competitors: ${error.message}`);
    throw error;
  }
}

/**
 * Get detailed data for specific places (deep scrape)
 * @param placeIds - Array of Google Place IDs to scrape
 */
export async function getCompetitorDetails(
  placeIds: string[],
  specialtyKeywords: string[] = []
): Promise<CompetitorDetailedData[]> {
  if (!APIFY_API_TOKEN) {
    throw new Error("APIFY_TOKEN environment variable is not set");
  }

  log(`Getting detailed data for ${placeIds.length} competitors`);

  try {
    // Start the Google Maps scraper actor with place IDs (using startUrls)
    const runResponse = await axios.post(
      `${APIFY_API_BASE}/acts/${GOOGLE_MAPS_ACTOR}/runs`,
      {
        startUrls: placeIds.map((id) => ({
          url: `https://www.google.com/maps/place/?q=place_id:${id}`,
        })),
        language: "en",
        maxReviews: 10,
        maxImages: 1, // Need at least 1 to get imageCount in response
        scrapeImageUrls: false, // Don't need actual URLs, just count
      },
      {
        headers: {
          Authorization: `Bearer ${APIFY_API_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    const runId = runResponse.data.data.id;
    log(`Started detail scrape actor run: ${runId}`);

    // Wait for completion
    const runResult = await waitForActorRun(runId);

    if (!runResult.datasetId) {
      throw new Error("No dataset ID returned from actor run");
    }

    // Fetch results
    const items = await fetchDatasetItems(runResult.datasetId);
    log(`Fetched detailed data for ${items.length} competitors`);

    // Transform to our format
    const competitors: CompetitorDetailedData[] = items.map((item) => {
      const name = item.title || item.name || "";
      const hasKeywordInName = specialtyKeywords.some((keyword) =>
        name.toLowerCase().includes(keyword.toLowerCase())
      );

      // Calculate reviews in last 30/90 days from recent reviews if available
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      let reviewsLast30d = 0;
      let reviewsLast90d = 0;

      if (item.reviews && Array.isArray(item.reviews)) {
        item.reviews.forEach((review: any) => {
          const reviewDate = new Date(review.publishedAtDate);
          if (reviewDate >= thirtyDaysAgo) reviewsLast30d++;
          if (reviewDate >= ninetyDaysAgo) reviewsLast90d++;
        });
      }

      // Log raw item data for debugging photo count issues
      const photosCount =
        item.imageCount || item.imagesCount || item.images?.length || 0;
      if (photosCount === 0) {
        log(
          `[${name}] Photo fields: imageCount=${item.imageCount}, imagesCount=${item.imagesCount}, images.length=${item.images?.length}`
        );
      }

      return {
        placeId: item.placeId,
        name: name,
        address: item.address || "",
        categories: item.categories || [],
        primaryCategory: item.categoryName || item.categories?.[0] || "Unknown",
        totalReviews: item.reviewsCount || 0,
        averageRating: item.totalScore || 0,
        reviewsLast30d,
        reviewsLast90d,
        photosCount: photosCount,
        postsLast90d: 0, // GBP posts not available via scraping
        hasWebsite: !!item.website,
        hasPhone: !!item.phone,
        hasHours: !!item.openingHours,
        hoursComplete: item.openingHours
          ? Object.keys(item.openingHours).length >= 7
          : false,
        descriptionLength: item.description?.length || 0,
        hasKeywordInName,
        website: item.website,
        phone: item.phone,
        openingHours: item.openingHours,
        reviewsDistribution: item.reviewsDistribution
          ? {
              oneStar: item.reviewsDistribution.oneStar || 0,
              twoStar: item.reviewsDistribution.twoStar || 0,
              threeStar: item.reviewsDistribution.threeStar || 0,
              fourStar: item.reviewsDistribution.fourStar || 0,
              fiveStar: item.reviewsDistribution.fiveStar || 0,
            }
          : undefined,
        recentReviews: item.reviews?.slice(0, 10).map((review: any) => ({
          author: review.name || "Anonymous",
          rating: review.stars || 0,
          text: review.text || "",
          publishedAtDate: review.publishedAtDate,
        })),
      };
    });

    return competitors;
  } catch (error: any) {
    log(`Error getting competitor details: ${error.message}`);
    throw error;
  }
}

/**
 * Run Lighthouse audit on a website
 * @param url - Website URL to audit
 */
export async function auditWebsite(url: string): Promise<WebsiteAuditResult> {
  if (!APIFY_API_TOKEN) {
    throw new Error("APIFY_TOKEN environment variable is not set");
  }

  log(`Running Lighthouse audit for: ${url}`);

  try {
    // Start the Lighthouse actor
    const runResponse = await axios.post(
      `${APIFY_API_BASE}/acts/${LIGHTHOUSE_ACTOR}/runs`,
      {
        url: url,
        device: "mobile",
        throttling: "applied",
      },
      {
        headers: {
          Authorization: `Bearer ${APIFY_API_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    const runId = runResponse.data.data.id;
    log(`Started Lighthouse actor run: ${runId}`);

    // Wait for completion
    const runResult = await waitForActorRun(runId);

    if (!runResult.datasetId) {
      throw new Error("No dataset ID returned from actor run");
    }

    // Fetch results
    const items = await fetchDatasetItems(runResult.datasetId);

    if (items.length === 0) {
      throw new Error("No audit results returned");
    }

    const audit = items[0];
    const categories = audit.categories || {};
    const audits = audit.audits || {};

    // Extract Core Web Vitals
    const lcp = audits["largest-contentful-paint"]?.numericValue / 1000 || 0;
    const fid = audits["max-potential-fid"]?.numericValue || 0;
    const cls = audits["cumulative-layout-shift"]?.numericValue || 0;

    // Check for schema types
    const structuredData = audits["structured-data"]?.details?.items || [];
    const schemaTypes = structuredData.map(
      (item: any) => item.type?.toLowerCase() || ""
    );

    return {
      url: url,
      lcp: Math.round(lcp * 100) / 100,
      fid: Math.round(fid),
      cls: Math.round(cls * 1000) / 1000,
      performanceScore: Math.round((categories.performance?.score || 0) * 100),
      accessibilityScore: Math.round(
        (categories.accessibility?.score || 0) * 100
      ),
      bestPracticesScore: Math.round(
        (categories["best-practices"]?.score || 0) * 100
      ),
      seoScore: Math.round((categories.seo?.score || 0) * 100),
      hasLocalSchema: schemaTypes.some((t: string) =>
        t.includes("localbusiness")
      ),
      hasOrganizationSchema: schemaTypes.some((t: string) =>
        t.includes("organization")
      ),
      hasReviewSchema: schemaTypes.some(
        (t: string) => t.includes("review") || t.includes("aggregaterating")
      ),
      hasFaqSchema: schemaTypes.some((t: string) => t.includes("faq")),
      mobileFriendly: (categories.performance?.score || 0) > 0.5,
      https: url.startsWith("https://"),
    };
  } catch (error: any) {
    log(`Error auditing website: ${error.message}`);
    // Return default values on error
    return {
      url: url,
      lcp: 0,
      fid: 0,
      cls: 0,
      performanceScore: 0,
      accessibilityScore: 0,
      bestPracticesScore: 0,
      seoScore: 0,
      hasLocalSchema: false,
      hasOrganizationSchema: false,
      hasReviewSchema: false,
      hasFaqSchema: false,
      mobileFriendly: false,
      https: url.startsWith("https://"),
    };
  }
}

/**
 * Get specialty-specific keywords for name matching
 */
export function getSpecialtyKeywords(specialty: string): string[] {
  const keywordMap: Record<string, string[]> = {
    orthodontics: ["orthodont", "braces", "invisalign", "ortho"],
    endodontics: ["endodont", "root canal", "endo"],
    periodontics: ["periodont", "gum", "perio"],
    oral_surgery: ["oral surgery", "oral surgeon", "maxillofacial"],
    pediatric: ["pediatric", "kids", "children", "pedo"],
    prosthodontics: ["prosthodont", "dentures", "implants", "crowns"],
  };

  return keywordMap[specialty.toLowerCase()] || [];
}

export default {
  discoverCompetitors,
  getCompetitorDetails,
  auditWebsite,
  getSpecialtyKeywords,
};
