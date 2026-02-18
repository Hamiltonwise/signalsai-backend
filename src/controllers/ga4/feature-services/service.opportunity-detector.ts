/**
 * GA4 Opportunity Detector
 *
 * Detects optimization opportunities from GA4 data.
 * Pure analysis logic -- no API calls.
 *
 * Thresholds:
 *   - High bounce page: bounce rate > 70% AND sessions > 50
 *   - Low engagement source: engagement rate < 30% AND users > 100
 */

interface HighBouncePage {
  type: "high_bounce_page";
  page: string;
  bounceRate: number;
  sessions: number;
}

interface LowEngagementSource {
  type: "low_engagement_source";
  source: string;
  medium: string;
  engagementRate: number;
  users: number;
}

export type Opportunity = HighBouncePage | LowEngagementSource;

/**
 * Detects pages with high bounce rates (>70%) and significant traffic (>50 sessions).
 * Returns top 5 results.
 *
 * @param pagesData - Array of page data rows from GA4
 * @returns Array of high bounce page opportunities
 */
export const detectHighBouncePages = (pagesData: any[]): HighBouncePage[] => {
  return (
    pagesData
      ?.filter((page) => {
        const bounceRate = 1 - page.engagedSessions / (page.sessions || 1);
        return bounceRate > 0.7 && page.sessions > 50;
      })
      ?.slice(0, 5)
      ?.map((page) => ({
        type: "high_bounce_page" as const,
        page: page.pagePath || page.pageTitle,
        bounceRate: 1 - page.engagedSessions / (page.sessions || 1),
        sessions: page.sessions,
      })) || []
  );
};

/**
 * Detects traffic sources with low engagement rates (<30%) and significant traffic (>100 users).
 * Returns top 5 results.
 *
 * @param acquisitionData - Array of acquisition data rows from GA4
 * @returns Array of low engagement source opportunities
 */
export const detectLowEngagementSources = (
  acquisitionData: any[]
): LowEngagementSource[] => {
  return (
    acquisitionData
      ?.filter((source) => source.engagementRate < 0.3 && source.users > 100)
      ?.slice(0, 5)
      ?.map((source) => ({
        type: "low_engagement_source" as const,
        source: source.source,
        medium: source.medium,
        engagementRate: source.engagementRate,
        users: source.users,
      })) || []
  );
};

/**
 * Detects all optimization opportunities from GA4 data.
 * Combines high bounce pages and low engagement sources.
 *
 * @param _overviewData - Overview data (reserved for future use)
 * @param pagesData - Array of page data rows
 * @param acquisitionData - Array of acquisition data rows
 * @returns Combined array of all detected opportunities
 */
export const detectOpportunities = (
  _overviewData: any,
  pagesData: any[],
  acquisitionData: any[]
): Opportunity[] => {
  const highBouncePages = detectHighBouncePages(pagesData);
  const lowEngagementSources = detectLowEngagementSources(acquisitionData);
  return [...highBouncePages, ...lowEngagementSources];
};
