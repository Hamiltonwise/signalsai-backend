/** Helper function to safely calculate percentage change */
export function safePercentageChange(current: number, previous: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return 0;
  if (previous === 0) return current > 0 ? 100 : 0; // Handle division by zero
  return ((current - previous) / previous) * 100;
}

/** Trend score calculation function for GBP metrics */
export function calculateGBPTrendScore(currentData: any, previousData: any) {
  // newReviews change (50% weight)
  const newReviewsChange = safePercentageChange(
    currentData.newReviews,
    previousData.newReviews,
  );

  // avgRating change (30% weight)
  const avgRatingChange = safePercentageChange(
    currentData.avgRating,
    previousData.avgRating,
  );

  // callClicks change (20% weight)
  const callClicksChange = safePercentageChange(
    currentData.callClicks,
    previousData.callClicks,
  );

  // Weighted average: newReviews (30%), avgRating (50%), callClicks (20%)
  const trendScore =
    newReviewsChange * 0.3 + avgRatingChange * 0.5 + callClicksChange * 0.2;

  return Math.round(trendScore * 100) / 100; // Round to 2 decimal places
}
