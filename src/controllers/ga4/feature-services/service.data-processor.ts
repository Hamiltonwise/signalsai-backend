/**
 * GA4 Data Processor Service
 *
 * Transforms raw GA4 API response data into structured objects.
 * No API calls -- pure data transformation.
 *
 * Processing functions:
 *   - processAcquisitionData: Top 10 sources with lead submission merging
 *   - processAudienceData: Geographic (top 10) and technology data
 *   - processBehaviorData: Top 20 pages and top 15 events
 *   - processEcommerceData: Revenue and product data (currently returns zeros)
 */

/**
 * Processes acquisition data from GA4 API rows.
 * Merges lead submission data by matching source/medium.
 * Returns top 10 sources.
 *
 * @param rows - Acquisition data rows from GA4
 * @param leadSubmitRows - Lead submit event rows filtered by source/medium
 * @returns Structured acquisition data with bySource array
 */
export const processAcquisitionData = (
  rows: any[],
  leadSubmitRows?: any[]
): any => {
  if (!rows) return {};

  return {
    bySource: rows.slice(0, 10).map((row) => {
      // Find matching lead_submit data
      const leadSubmit = leadSubmitRows?.find(
        (lr) =>
          lr.sessionSource === row.sessionSource &&
          lr.sessionMedium === row.sessionMedium
      );

      return {
        source: row.sessionSource || row.firstUserSource || "Unknown",
        medium: row.sessionMedium || row.firstUserMedium || "Unknown",
        users: row.activeUsers || 0,
        sessions: row.sessions || 0,
        engagementRate: row.engagementRate || 0,
        conversions: row.conversions || 0,
        leadSubmissions: leadSubmit?.eventCount || 0,
      };
    }),
  };
};

/**
 * Processes audience data from GA4 API rows.
 * Structures geographic (top 10 countries) and technology (all device categories) data.
 *
 * @param geoRows - Geographic dimension rows from GA4
 * @param deviceRows - Device category dimension rows from GA4
 * @returns Structured audience data with geographic and technology arrays
 */
export const processAudienceData = (
  geoRows: any[],
  deviceRows: any[]
): any => {
  return {
    geographic:
      geoRows?.slice(0, 10).map((row) => ({
        country: row.country || "Unknown",
        users: row.activeUsers || 0,
        sessions: row.sessions || 0,
        engagementRate: row.engagementRate || 0,
      })) || [],
    technology:
      deviceRows?.map((row) => ({
        deviceCategory: row.deviceCategory || "Unknown",
        users: row.activeUsers || 0,
        sessions: row.sessions || 0,
        engagementRate: row.engagementRate || 0,
      })) || [],
  };
};

/**
 * Processes behavior data from GA4 API rows.
 * Structures top 20 pages (with inline bounce rate calculation) and top 15 events.
 *
 * @param pageRows - Page-level dimension rows from GA4
 * @param eventRows - Event-level dimension rows from GA4
 * @returns Structured behavior data with topPages and topEvents arrays
 */
export const processBehaviorData = (
  pageRows: any[],
  eventRows: any[]
): any => {
  return {
    topPages:
      pageRows?.slice(0, 20).map((row) => ({
        page: row.pagePath || row.pageTitle || "Unknown",
        views: row.screenPageViews || 0,
        users: row.activeUsers || 0,
        avgEngagementTime: row.userEngagementDuration || 0,
        bounceRate: 1 - row.engagedSessions / (row.sessions || 1),
      })) || [],
    topEvents:
      eventRows?.slice(0, 15).map((row) => ({
        eventName: row.eventName || "Unknown",
        eventCount: row.eventCount || 0,
        users: row.activeUsers || 0,
      })) || [],
  };
};

/**
 * Processes e-commerce data from GA4 API rows.
 * Currently returns zero values as e-commerce metrics are incompatible.
 *
 * @param ecommerceRows - E-commerce dimension rows from GA4
 * @returns Structured e-commerce data with revenue and products
 */
export const processEcommerceData = (ecommerceRows: any[]): any => {
  if (!ecommerceRows || ecommerceRows.length === 0) {
    return {
      revenue: {
        total: 0,
        transactions: 0,
        avgOrderValue: 0,
      },
      products: [],
    };
  }

  const totalRevenue = ecommerceRows.reduce(
    (sum, row) => sum + (row.purchaseRevenue || 0),
    0
  );
  const totalTransactions = ecommerceRows.reduce(
    (sum, row) => sum + (row.transactions || 0),
    0
  );

  return {
    revenue: {
      total: totalRevenue,
      transactions: totalTransactions,
      avgOrderValue:
        totalTransactions > 0 ? totalRevenue / totalTransactions : 0,
    },
    products: ecommerceRows.slice(0, 10).map((row) => ({
      itemName: row.itemName || "Unknown",
      revenue: row.itemRevenue || 0,
      quantity: row.itemsViewed || row.itemsPurchased || 0,
    })),
  };
};
