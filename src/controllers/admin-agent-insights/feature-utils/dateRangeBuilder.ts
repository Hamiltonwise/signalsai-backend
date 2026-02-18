/**
 * Date range calculation utilities for admin agent insights.
 *
 * Consolidates the date range logic that was duplicated across
 * summary, recommendations, and clear-month-data endpoints.
 *
 * All dates use the format YYYY-MM-DD for start dates and
 * YYYY-MM-DDT23:59:59.999Z for inclusive end dates.
 */

export interface DateRange {
  startDate: string;
  endDate: string;
  endDateTime: string;
}

/**
 * Build a date range from an optional YYYY-MM month string.
 * Defaults to the current month if no month is provided.
 *
 * @param month - Optional month in YYYY-MM format
 * @returns DateRange with startDate, endDate, and endDateTime
 */
export function buildDateRange(month?: string): DateRange {
  const now = new Date();

  const startDate = month
    ? `${month}-01`
    : new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split("T")[0];

  const endOfMonth = month
    ? new Date(
        new Date(month + "-01").getFullYear(),
        new Date(month + "-01").getMonth() + 1,
        0
      )
    : new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const endDate = endOfMonth.toISOString().split("T")[0];
  const endDateTime = `${endDate}T23:59:59.999Z`;

  return { startDate, endDate, endDateTime };
}
