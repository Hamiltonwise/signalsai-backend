/**
 * GSC Trend Score Calculation
 * Weighted trend score comparing current vs previous period metrics.
 */

interface MetricData {
  impressions: number;
  clicks: number;
  avgPosition: number;
}

/**
 * Calculates a weighted trend score comparing current and previous period data.
 *
 * Weight distribution:
 *   - Clicks: 40%
 *   - Impressions: 35%
 *   - Position: 25% (inverted — lower position is better)
 *
 * Handles division by zero by treating zero-base metrics as 0% change.
 * Result is rounded to 2 decimal places.
 *
 * @param currentData - Current period metrics
 * @param previousData - Previous period metrics
 * @returns Weighted trend score (positive = improvement)
 */
export const calculateTrendScore = (
  currentData: MetricData,
  previousData: MetricData
): number => {
  const impressionsChange =
    previousData.impressions === 0
      ? 0
      : ((currentData.impressions - previousData.impressions) /
          previousData.impressions) *
        100;

  const clicksChange =
    previousData.clicks === 0
      ? 0
      : ((currentData.clicks - previousData.clicks) / previousData.clicks) *
        100;

  // For avgPosition, lower is better, so we invert the calculation
  const positionChange =
    previousData.avgPosition === 0
      ? 0
      : ((previousData.avgPosition - currentData.avgPosition) /
          previousData.avgPosition) *
        100;

  // Weight the metrics: clicks (40%), impressions (35%), position (25%)
  const trendScore =
    clicksChange * 0.4 + impressionsChange * 0.35 + positionChange * 0.25;

  return Math.round(trendScore * 100) / 100; // Round to 2 decimal places
};
