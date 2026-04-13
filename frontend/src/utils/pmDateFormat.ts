import {
  isToday,
  isTomorrow,
  isPast,
  differenceInDays,
  differenceInHours,
  isThisWeek,
  format,
  addWeeks,
  startOfWeek,
  endOfWeek,
} from "date-fns";

export interface DeadlineDisplay {
  text: string;
  colorClass: string;
  tooltip: string;
}

export function formatDeadline(date: string | Date | null): DeadlineDisplay | null {
  if (!date) return null;

  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const tooltip = format(d, "MMMM d, yyyy 'at' h:mm a");

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

  // Further out -- exact date
  return { text: format(d, "MMM d"), colorClass: "text-[var(--color-pm-text-muted)]", tooltip };
}
