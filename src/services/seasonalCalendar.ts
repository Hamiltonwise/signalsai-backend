/**
 * Seasonal Intelligence Service -- WO-SEASONAL-CALENDAR
 *
 * Local service businesses have predictable seasonal patterns.
 * Alloro knows them before clients ask.
 *
 * // No routes needed -- called by Monday email and One Action Card
 */

// ─── Types ───

export interface SeasonalPattern {
  specialty: string;
  month: number;
  pattern: string;
  referral_impact: number; // % change expected, negative = decline
  recommended_action: string;
}

export interface SeasonalAlert {
  pattern: SeasonalPattern;
  weeks_away: number;
  alert_text: string;
}

// ─── Seasonal Pattern Database ───

const SEASONAL_PATTERNS: SeasonalPattern[] = [
  // Endodontics
  {
    specialty: "endodontics",
    month: 1,
    pattern: "Post-holiday slowdown -- patients delaying care after holiday spending",
    referral_impact: -20,
    recommended_action: "Reach out to top 3 referrers this week. A personal call in December prevents January silence.",
  },
  {
    specialty: "endodontics",
    month: 4,
    pattern: "Spring uptick -- new insurance year fully active",
    referral_impact: 15,
    recommended_action: "Capacity check: ensure scheduling can handle 15% more referrals. Update GPs on availability.",
  },
  {
    specialty: "endodontics",
    month: 9,
    pattern: "Back-to-school appointments drive GP referrals",
    referral_impact: 10,
    recommended_action: "Send a brief note to school-adjacent GPs reminding them of your availability for urgent cases.",
  },

  // Orthodontics
  {
    specialty: "orthodontics",
    month: 6,
    pattern: "Summer start surge -- families prefer starting treatment before school",
    referral_impact: 25,
    recommended_action: "Block extra consultation slots. This is your highest-conversion month -- every referral counts double.",
  },
  {
    specialty: "orthodontics",
    month: 12,
    pattern: "Holiday freeze -- lowest referral month",
    referral_impact: -30,
    recommended_action: "Use December for relationship-building, not conversion. Send holiday notes to your top 5 referrers.",
  },

  // General Dentistry
  {
    specialty: "dentist",
    month: 1,
    pattern: "Deductible reset -- patients using fresh insurance benefits",
    referral_impact: 10,
    recommended_action: "Highlight availability for new-year appointments. Patients with fresh deductibles are ready to book.",
  },
  {
    specialty: "dentist",
    month: 8,
    pattern: "Back-to-school rush -- families scheduling before school starts",
    referral_impact: 15,
    recommended_action: "Extend hours or add Saturday slots to capture back-to-school demand.",
  },

  // Chiropractic
  {
    specialty: "chiropractor",
    month: 1,
    pattern: "New Year resolution patients -- fitness injury spike",
    referral_impact: 20,
    recommended_action: "Partner with local gyms and fitness centers. Resolution-driven injuries peak in January.",
  },
  {
    specialty: "chiropractor",
    month: 7,
    pattern: "Summer activity injuries -- outdoor recreation drives visits",
    referral_impact: 15,
    recommended_action: "Ensure Google reviews mention sports/activity treatment. Patients search for these terms in summer.",
  },

  // Optometry
  {
    specialty: "optometrist",
    month: 8,
    pattern: "Back-to-school eye exams -- highest volume month",
    referral_impact: 30,
    recommended_action: "This is your Super Bowl. Block extra exam slots and ensure school-age appointment availability is visible online.",
  },
  {
    specialty: "optometrist",
    month: 1,
    pattern: "New insurance year -- patients using fresh vision benefits",
    referral_impact: 15,
    recommended_action: "Email your patient base about new-year benefit availability. Many wait for January to schedule.",
  },

  // Physical Therapy
  {
    specialty: "physical_therapy",
    month: 1,
    pattern: "Post-holiday surgery recovery -- orthopedic referrals peak",
    referral_impact: 20,
    recommended_action: "Coordinate with orthopedic surgeons. Holiday-season surgeries create January PT demand.",
  },
  {
    specialty: "physical_therapy",
    month: 5,
    pattern: "Spring sports injuries -- youth and adult leagues starting",
    referral_impact: 15,
    recommended_action: "Connect with local sports leagues. Offer injury screening events to build referral relationships.",
  },

  // Veterinary
  {
    specialty: "veterinarian",
    month: 3,
    pattern: "Spring wellness visits -- annual checkups and vaccinations",
    referral_impact: 25,
    recommended_action: "Send reminder campaigns for annual wellness visits. March through May is your highest-revenue quarter.",
  },
  {
    specialty: "veterinarian",
    month: 12,
    pattern: "Holiday boarding and emergency visits",
    referral_impact: 10,
    recommended_action: "Promote boarding availability and emergency hours. Holiday travel creates demand for both.",
  },

  // Universal (applies to all specialties)
  {
    specialty: "universal",
    month: 1,
    pattern: "Deductible reset -- patients waiting for new year insurance",
    referral_impact: -15,
    recommended_action: "Proactively remind existing patients that their new benefits are active. Don't wait for them to remember.",
  },
  {
    specialty: "universal",
    month: 11,
    pattern: "Use-it-or-lose-it insurance push -- patients rushing to use remaining benefits",
    referral_impact: 15,
    recommended_action: "Email patients with remaining benefits. 'You have $X in unused benefits expiring December 31' drives action.",
  },
  {
    specialty: "universal",
    month: 7,
    pattern: "Mid-year slowdown -- summer vacation reduces appointment bookings",
    referral_impact: -10,
    recommended_action: "Offer extended hours or telehealth options. Patients on vacation still need care -- make it easy.",
  },
];

// ─── Functions ───

/**
 * Get all seasonal patterns for a specialty (includes universal patterns).
 */
export function getSeasonalPatterns(specialty: string): SeasonalPattern[] {
  const normalized = specialty.toLowerCase().replace(/\s+/g, "_");
  return SEASONAL_PATTERNS.filter(
    (p) => p.specialty === normalized || p.specialty === "universal",
  );
}

/**
 * Get the next seasonal event within 6 weeks for a given specialty.
 * Returns the most impactful upcoming pattern with a ready-to-use alert.
 *
 * Used by: Monday email, One Action Card
 */
export function getUpcomingSeasonalAlert(
  specialty: string,
  currentMonth: number = new Date().getMonth() + 1,
): SeasonalAlert | null {
  const patterns = getSeasonalPatterns(specialty);
  if (patterns.length === 0) return null;

  // Look at current month and next month (within ~6 weeks)
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const relevantMonths = [currentMonth, nextMonth];

  // Find patterns in upcoming months, sorted by impact magnitude
  const upcoming = patterns
    .filter((p) => relevantMonths.includes(p.month))
    .sort((a, b) => Math.abs(b.referral_impact) - Math.abs(a.referral_impact));

  if (upcoming.length === 0) return null;

  const best = upcoming[0];

  // Calculate weeks away
  const now = new Date();
  const targetDate = new Date(now.getFullYear(), best.month - 1, 1);
  if (targetDate < now) {
    // Pattern is this month -- 0 weeks away
  }
  const weeksAway = Math.max(0, Math.floor((targetDate.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000)));

  // Build alert text
  const monthName = new Date(2026, best.month - 1, 1).toLocaleString("en-US", { month: "long" });
  const direction = best.referral_impact > 0 ? "increase" : "dip";
  const pct = Math.abs(best.referral_impact);

  const alertText = weeksAway === 0
    ? `${monthName} typically brings a ${pct}% referral ${direction}. ${best.recommended_action}`
    : `Heads up: ${monthName} typically brings a ${pct}% referral ${direction}. ${best.recommended_action}`;

  return {
    pattern: best,
    weeks_away: weeksAway,
    alert_text: alertText,
  };
}

/**
 * Get the seasonal context string for a Monday email.
 * Returns null if no relevant seasonal pattern exists.
 */
export function getSeasonalEmailLine(
  specialty: string,
  currentMonth: number = new Date().getMonth() + 1,
): string | null {
  const alert = getUpcomingSeasonalAlert(specialty, currentMonth);
  if (!alert) return null;
  return alert.alert_text;
}
