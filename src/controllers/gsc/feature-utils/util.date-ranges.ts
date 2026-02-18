/**
 * GSC Date Range Utilities
 * Pure date calculation functions for Google Search Console data fetching.
 */

interface DateRange {
  startDate: string;
  endDate: string;
}

interface DateRanges {
  currentMonth: DateRange;
  previousMonth: DateRange;
}

/**
 * Calculates current and previous month date ranges for GSC queries.
 * "Current month" is the previous calendar month (most recent complete month).
 * "Previous month" is two calendar months ago.
 *
 * @returns Object with currentMonth and previousMonth date ranges in ISO format (YYYY-MM-DD)
 */
export const getDateRanges = (): DateRanges => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() - 1; // 0-indexed

  // Current month
  const currMonthStart = new Date(currentYear, currentMonth, 1);
  const currMonthEnd = new Date(currentYear, currentMonth + 1, 0);

  // Previous month
  const prevMonthStart = new Date(currentYear, currentMonth - 1, 1);
  const prevMonthEnd = new Date(currentYear, currentMonth, 0);

  const formatDate = (date: Date) => date.toISOString().split("T")[0];

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
