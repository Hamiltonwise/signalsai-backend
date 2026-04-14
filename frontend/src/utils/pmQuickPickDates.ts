/**
 * Priority-mapped quick-pick date helpers for the PM deadline picker.
 *
 * The PM tool labels priorities P1-P5 with time horizons that double as
 * deadline shortcuts:
 *   P1 "Top of the hour" → today
 *   P2 "Today"           → today
 *   P3 "3 days"          → today + 3 days
 *   P4 "This week"       → upcoming Friday (today if today is Friday)
 *   P5 "Next week"       → Friday of next week
 *
 * All dates are computed in the America/Los_Angeles civil calendar —
 * matches how the rest of the PM tool handles deadlines (see
 * utils/pmDateFormat.ts).
 */

import { addDays, format, nextFriday, isFriday } from "date-fns";

export type PmQuickPickKind = "P1" | "P2" | "P3" | "P4" | "P5";

function todayPST(): Date {
  // Get today's civil date in PST as a local Date (time parts don't matter).
  const pstStr = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Los_Angeles",
  });
  const [y, m, d] = pstStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function quickPickDate(kind: PmQuickPickKind): string {
  const today = todayPST();
  switch (kind) {
    case "P1":
    case "P2":
      return format(today, "yyyy-MM-dd");
    case "P3":
      return format(addDays(today, 3), "yyyy-MM-dd");
    case "P4":
      return format(
        isFriday(today) ? today : nextFriday(today),
        "yyyy-MM-dd"
      );
    case "P5": {
      const thisFri = isFriday(today) ? today : nextFriday(today);
      return format(addDays(thisFri, 7), "yyyy-MM-dd");
    }
  }
}

export const QUICK_PICK_LABELS: Record<PmQuickPickKind, string> = {
  P1: "Top of the hour",
  P2: "Today",
  P3: "3 days",
  P4: "This week",
  P5: "Next week",
};
