/**
 * GSC Opportunity Detection
 * Identifies actionable SEO opportunities from GSC query and page data.
 */

// Opportunity detection thresholds
const LOW_CTR_IMPRESSION_THRESHOLD = 100;
const LOW_CTR_THRESHOLD = 0.02;
const RANKING_POSITION_MIN = 4;
const RANKING_POSITION_MAX = 10;
const RANKING_CLICKS_THRESHOLD = 10;
const MAX_OPPORTUNITIES_PER_TYPE = 5;

interface Opportunity {
  type: string;
  query?: string;
  page?: string;
  impressions: number;
  ctr?: number;
  position: number;
  clicks?: number;
}

/**
 * Calculates SEO opportunities from GSC query and page data.
 *
 * Detects two types of opportunities:
 *   1. Low CTR queries: >100 impressions, <2% CTR (top 5)
 *   2. Ranking opportunities: Position 4-10, >10 clicks (top 5)
 *
 * @param queryRows - Raw query rows from GSC API
 * @param pageRows - Raw page rows from GSC API
 * @returns Array of opportunity objects
 */
export const calculateOpportunities = (
  queryRows: any[],
  pageRows: any[]
): Opportunity[] => {
  // High impression, low CTR queries (opportunity to improve)
  const lowCtrQueries =
    queryRows
      ?.filter(
        (query) =>
          query.impressions > LOW_CTR_IMPRESSION_THRESHOLD &&
          query.ctr < LOW_CTR_THRESHOLD
      )
      ?.slice(0, MAX_OPPORTUNITIES_PER_TYPE)
      ?.map((query) => ({
        type: "low_ctr_query",
        query: query.keys[0],
        impressions: query.impressions,
        ctr: query.ctr,
        position: query.position,
      })) || [];

  // Pages ranking 4-10 (opportunity to reach top 3)
  const rankingOpportunities =
    pageRows
      ?.filter(
        (page) =>
          page.position >= RANKING_POSITION_MIN &&
          page.position <= RANKING_POSITION_MAX &&
          page.clicks > RANKING_CLICKS_THRESHOLD
      )
      ?.slice(0, MAX_OPPORTUNITIES_PER_TYPE)
      ?.map((page) => ({
        type: "ranking_opportunity",
        page: page.keys[0],
        position: page.position,
        clicks: page.clicks,
        impressions: page.impressions,
      })) || [];

  return [...lowCtrQueries, ...rankingOpportunities];
};
