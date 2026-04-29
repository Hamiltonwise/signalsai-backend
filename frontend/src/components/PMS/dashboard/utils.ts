import type { PmsDashboardMonth } from "./types";

export const formatCurrency = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return "N/A";
  return `$${Math.round(value).toLocaleString("en-US")}`;
};

export const formatCompactCurrency = (value: number): string => {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return formatCurrency(value);
};

export const formatUpdatedDate = (date: Date | null): string => {
  if (!date || Number.isNaN(date.getTime())) return "No sync yet";
  return `Updated ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
};

export const getLatestMonth = (
  months: PmsDashboardMonth[],
): PmsDashboardMonth | null => months[months.length - 1] ?? null;

export const getPreviousMonth = (
  months: PmsDashboardMonth[],
): PmsDashboardMonth | null => months[months.length - 2] ?? null;

export const getPercentChange = (
  current: number,
  previous: number | null | undefined,
): number | null => {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
};

export const getTrendText = (change: number | null): string => {
  if (change === null) return "No prior month";
  if (change === 0) return "Flat";
  return `${change > 0 ? "+" : ""}${change}%`;
};

export const getLastMonths = (
  months: PmsDashboardMonth[],
  count: number,
): PmsDashboardMonth[] => months.slice(Math.max(months.length - count, 0));
