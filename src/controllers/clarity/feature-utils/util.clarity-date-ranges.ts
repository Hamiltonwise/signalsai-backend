/**
 * Date range utilities for Clarity month-over-month comparisons.
 */

// Set to true for: previous = past 2 months, current = past 1 month (complete months only)
// Set to false for: previous = past 1 month, current = current month (complete month)
export const USE_COMPLETE_MONTHS_ONLY = true;

export interface MonthRange {
  start: string;
  end: string;
}

export interface MonthRanges {
  currMonth: MonthRange;
  prevMonth: MonthRange;
}

/**
 * Get date ranges for month comparison based on configuration.
 * - If USE_COMPLETE_MONTHS_ONLY = true: previous = past 2 months, current = past 1 month (complete months only)
 * - If USE_COMPLETE_MONTHS_ONLY = false: previous = past 1 month, current = current month (including partial)
 */
export const getMonthRanges = (): MonthRanges => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  let startCurr: Date, endCurr: Date, startPrev: Date, endPrev: Date;

  if (USE_COMPLETE_MONTHS_ONLY) {
    // Mode 1: Compare two complete past months
    startCurr = new Date(Date.UTC(year, month - 1, 1)); // first day prev month
    endCurr = new Date(Date.UTC(year, month, 0)); // last day prev month
    startPrev = new Date(Date.UTC(year, month - 2, 1)); // first day 2 months ago
    endPrev = new Date(Date.UTC(year, month - 1, 0)); // last day 2 months ago
  } else {
    // Mode 2: Compare previous complete month vs current complete month
    startCurr = new Date(Date.UTC(year, month, 1)); // first day current month
    endCurr = new Date(Date.UTC(year, month + 1, 0)); // last day current month
    startPrev = new Date(Date.UTC(year, month - 1, 1)); // first day prev month
    endPrev = new Date(Date.UTC(year, month, 0)); // last day prev month
  }

  return {
    currMonth: {
      start: startCurr.toISOString().slice(0, 10),
      end: endCurr.toISOString().slice(0, 10),
    },
    prevMonth: {
      start: startPrev.toISOString().slice(0, 10),
      end: endPrev.toISOString().slice(0, 10),
    },
  };
};
