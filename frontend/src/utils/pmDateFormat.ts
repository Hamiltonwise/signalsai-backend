import {
  isToday,
  isTomorrow,
  isPast,
  differenceInDays,
  differenceInHours,
  isThisWeek,
  addWeeks,
  startOfWeek,
  endOfWeek,
} from "date-fns";

/** Returns the ISO string for 11:59:00 PM in America/Los_Angeles on the given date string (YYYY-MM-DD). */
export function endOfDayPST(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  // Sample at noon UTC to determine the PST/PDT offset for this date (DST-safe)
  const noon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const pstHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "numeric",
      hour12: false,
    }).format(noon)
  );
  const offsetHours = 12 - pstHour; // 7 for PDT (summer), 8 for PST (winter)
  // 23:59:00 PST = 23:59 + offsetHours in UTC; JS Date.UTC normalises hour overflow
  return new Date(Date.UTC(y, m - 1, d, 23 + offsetHours, 59, 0)).toISOString();
}

export interface DeadlineDisplay {
  text: string;
  colorClass: string;
  tooltip: string;
}

export function formatDeadline(date: string | Date | null): DeadlineDisplay | null {
  if (!date) return null;

  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const tooltip = d.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  // Past and not today = overdue
  if (isPast(d) && !isToday(d)) {
    return { text: "Overdue", colorClass: "text-[#C43333] font-semibold", tooltip };
  }

  // Due today
  if (isToday(d)) {
    const hoursLeft = differenceInHours(d, now);
    if (hoursLeft >= 0 && hoursLeft <= 1) {
      return { text: "Top of the hour", colorClass: "text-[#C43333] font-semibold", tooltip };
    }
    return { text: "Today", colorClass: "text-[#D4920A]", tooltip };
  }

  // Tomorrow
  if (isTomorrow(d)) {
    return { text: "Tomorrow", colorClass: "text-[#D4920A]", tooltip };
  }

  const daysUntil = differenceInDays(d, now);

  // Within 3 days
  if (daysUntil <= 3) {
    if (daysUntil <= 1) return { text: "Tomorrow", colorClass: "text-[#D4920A]", tooltip };
    return { text: `${daysUntil} days`, colorClass: "text-[#D4920A]", tooltip };
  }

  // This week (Mon-Sun)
  if (isThisWeek(d, { weekStartsOn: 1 })) {
    return { text: "This week", colorClass: "text-[#3D8B40]", tooltip };
  }

  // Next week
  const nextWeekStart = startOfWeek(addWeeks(now, 1), { weekStartsOn: 1 });
  const nextWeekEnd = endOfWeek(addWeeks(now, 1), { weekStartsOn: 1 });
  if (d >= nextWeekStart && d <= nextWeekEnd) {
    return { text: "Next week", colorClass: "text-[#3D8B40]", tooltip };
  }

  // Further out — exact date
  return { text: format(d, "MMM d"), colorClass: "text-[var(--color-pm-text-muted)]", tooltip };
}
