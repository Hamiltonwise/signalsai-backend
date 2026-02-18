/**
 * GA4 Date Range Utilities
 *
 * Provides date range calculation for GA4 reporting periods.
 * Used by data fetcher and controller for consistent date handling.
 */

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface DateRanges {
  currentMonth: DateRange;
  previousMonth: DateRange;
}

/**
 * Formats a Date object to YYYY-MM-DD string.
 */
export const formatDate = (date: Date): string => {
  return date.toISOString().split("T")[0];
};

/**
 * Calculates date ranges for current and previous reporting months.
 *
 * NOTE: "currentMonth" is actually the previous calendar month.
 * This appears intentional (original implementation). Do not change without PM approval.
 * "previousMonth" is 2 calendar months ago.
 */
export const getDateRanges = (): DateRanges => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() - 1; // 0-indexed, intentionally previous calendar month

  // Current reporting month (previous calendar month)
  const currMonthStart = new Date(currentYear, currentMonth, 1);
  const currMonthEnd = new Date(currentYear, currentMonth + 1, 0);

  // Previous reporting month (2 calendar months ago)
  const prevMonthStart = new Date(currentYear, currentMonth - 1, 1);
  const prevMonthEnd = new Date(currentYear, currentMonth, 0);

  return {
    currentMonth: {
      startDate: formatDate(currMonthStart),
      endDate: formatDate(currMonthEnd),
    },
    previousMonth: {
      startDate: formatDate(prevMonthStart),
      endDate: formatDate(prevMonthEnd),
    },
  };
};
