/**
 * Week Date Utilities
 *
 * Provides date calculation utilities for weekly data processing.
 * Weeks run Monday to Sunday, always returning the previous complete week.
 */

/**
 * Get the previous complete week's date range (Monday to Sunday)
 *
 * Examples:
 * - Today: Monday, Jan 8, 2024 → Returns: Jan 1-7, 2024 (previous Mon-Sun)
 * - Today: Sunday, Jan 7, 2024 → Returns: Jan 1-7, 2024 (the week that just ended)
 * - Today: Saturday, Jan 13, 2024 → Returns: Jan 8-14, 2024 (previous Mon-Sun)
 *
 * @returns Object with weekStart and weekEnd in YYYY-MM-DD format
 */
export function getPreviousWeekDates(): { weekStart: string; weekEnd: string } {
  const now = new Date();

  // Get the day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const dayOfWeek = now.getDay();

  // Calculate days to subtract to get to previous Monday
  let daysToLastMonday: number;
  if (dayOfWeek === 0) {
    // Sunday: last Monday is 6 days ago (the week just ended)
    daysToLastMonday = 6;
  } else {
    // Monday-Saturday: last Monday is current day offset + 7
    daysToLastMonday = dayOfWeek - 1 + 7;
  }

  // Calculate week start (previous Monday)
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - daysToLastMonday);
  weekStart.setHours(0, 0, 0, 0);

  // Calculate week end (previous Sunday, 6 days after Monday)
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  return {
    weekStart: weekStart.toISOString().split("T")[0],
    weekEnd: weekEnd.toISOString().split("T")[0],
  };
}

/**
 * Validate that a date range is exactly 7 days (one week)
 *
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 * @returns true if valid week range, false otherwise
 */
export function isValidWeekRange(startDate: string, endDate: string): boolean {
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Check if dates are valid
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return false;
    }

    // Check if end is after start
    if (end < start) {
      return false;
    }

    // Check if range is exactly 7 days
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays === 6; // 6 days difference = 7 days inclusive
  } catch (error) {
    return false;
  }
}

/**
 * Format a Date object to YYYY-MM-DD string
 *
 * @param date - Date object to format
 * @returns Formatted date string
 */
export function formatDateForAPI(date: Date): string {
  return date.toISOString().split("T")[0];
}
