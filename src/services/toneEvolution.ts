/**
 * Tone Evolution Service -- "Earning Informality"
 *
 * Implements Will Guidara's principle: you earn the right to be casual.
 * New accounts get professional, precise copy. As trust builds over
 * weeks and months, the tone warms. By day 90, we sound like a
 * trusted advisor, not a vendor.
 *
 * Agents call getToneProfile() when generating any client-facing copy.
 * The frontend uses getToneProfileFromDate() for greeting logic.
 */

// ── Types ───────────────────────────────────────────────────────────

export interface ToneProfile {
  formality: "formal" | "warm" | "familiar";
  useFirstName: boolean;
  canUseHumor: boolean;
  greetingStyle: "professional" | "personal" | "casual";
}

// ── Core ────────────────────────────────────────────────────────────

/**
 * Returns a tone profile based on how long the org has existed.
 *
 * Days 0-30: formal. "Your competitive position improved this week."
 * Days 30-90: warm. "Good news, Sarah. You moved up."
 * Days 90+: familiar. "Sarah, your numbers look great. Take the afternoon off."
 */
export function getToneProfile(orgCreatedAt: Date): ToneProfile {
  const now = new Date();
  const diffMs = now.getTime() - orgCreatedAt.getTime();
  const daysSinceCreation = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (daysSinceCreation >= 90) {
    return {
      formality: "familiar",
      useFirstName: true,
      canUseHumor: true,
      greetingStyle: "casual",
    };
  }

  if (daysSinceCreation >= 30) {
    return {
      formality: "warm",
      useFirstName: true,
      canUseHumor: false,
      greetingStyle: "personal",
    };
  }

  return {
    formality: "formal",
    useFirstName: false,
    canUseHumor: false,
    greetingStyle: "professional",
  };
}

/**
 * Convenience: accepts an ISO string or Date.
 * Returns null if the input is invalid so callers can fall back gracefully.
 */
export function getToneProfileFromString(
  orgCreatedAt: string | Date | null | undefined,
): ToneProfile | null {
  if (!orgCreatedAt) return null;
  const d = typeof orgCreatedAt === "string" ? new Date(orgCreatedAt) : orgCreatedAt;
  if (isNaN(d.getTime())) return null;
  return getToneProfile(d);
}
