/**
 * GA4 Trend Score Calculator
 *
 * Calculates trend scores using a weighted formula across GA4 metrics.
 * Pure calculation logic -- no API calls.
 *
 * Weighted formula:
 *   conversions (40%) + engagementRate (35%) + activeUsers (25%)
 */

interface MetricData {
  activeUsers: number;
  engagementRate: number;
  conversions: number;
}

/**
 * Calculates percentage change between two values.
 * Returns 0 if the previous value is 0 to avoid division by zero.
 *
 * @param current - Current period value
 * @param previous - Previous period value
 * @returns Percentage change (e.g., 15.5 for 15.5% increase)
 */
export const calculatePercentageChange = (
  current: number,
  previous: number
): number => {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
};

/**
 * Calculates the overall trend score from current and previous period data.
 *
 * Weights:
 *   - Conversions: 40%
 *   - Engagement Rate: 35%
 *   - Active Users: 25%
 *
 * @param currentData - Current period metrics
 * @param previousData - Previous period metrics
 * @returns Trend score rounded to 2 decimal places
 */
export const calculateTrendScore = (
  currentData: MetricData,
  previousData: MetricData
): number => {
  const conversionsChange = calculatePercentageChange(
    currentData.conversions,
    previousData.conversions
  );

  const engagementRateChange = calculatePercentageChange(
    currentData.engagementRate,
    previousData.engagementRate
  );

  const activeUsersChange = calculatePercentageChange(
    currentData.activeUsers,
    previousData.activeUsers
  );

  // Weight the metrics: conversion (40%), Engagement Rate (35%), active users (25%)
  const trendScore =
    conversionsChange * 0.4 +
    engagementRateChange * 0.35 +
    activeUsersChange * 0.25;

  return Math.round(trendScore * 100) / 100; // Round to 2 decimal places
};
