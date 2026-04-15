/**
 * Condenses full GbpMinimized records into a smaller shape before feeding to
 * the LLM for GBP analysis. Keeps signals the model actually needs (ratings,
 * counts, hours, NAP, review distribution) and drops bulky narrative fields
 * that don't fit in the token budget (full `reviews`, `imageUrls`,
 * `ownerUpdates`, `reviewsTags`, etc.).
 *
 * The original full record stays in `audit_processes.step_self_gbp` and
 * `step_competitors.competitors[]` for the admin detail drawer / debugging —
 * only the LLM input is condensed.
 */

export interface CondensedGbp {
  title?: string;
  categoryName?: string;
  categories?: string[];
  primaryCategory?: string;
  address?: string;
  phone?: string;
  website?: string;
  hasWebsite: boolean;
  hasPhone: boolean;
  hasHours: boolean;
  averageStarRating?: number;
  reviewsCount?: number;
  reviewsDistribution?: Record<string, unknown>;
  reviewsLast30d: number;
  reviewsLast90d: number;
  imagesCount?: number;
  imageCategories?: unknown;
  openingHoursSummary?: string;
}

function computeReviewRecency(reviews: unknown): {
  last30d: number;
  last90d: number;
} {
  if (!Array.isArray(reviews)) return { last30d: 0, last90d: 0 };
  const now = Date.now();
  const D30 = now - 30 * 24 * 3600 * 1000;
  const D90 = now - 90 * 24 * 3600 * 1000;
  let last30d = 0;
  let last90d = 0;
  for (const r of reviews) {
    const dateStr = (r as Record<string, unknown> | null)?.publishedAtDate;
    if (typeof dateStr !== "string") continue;
    const t = new Date(dateStr).getTime();
    if (Number.isNaN(t)) continue;
    if (t >= D30) last30d++;
    if (t >= D90) last90d++;
  }
  return { last30d, last90d };
}

function summarizeOpeningHours(hours: unknown): string | undefined {
  if (!hours) return undefined;
  if (!Array.isArray(hours)) return JSON.stringify(hours).slice(0, 400);
  return hours
    .map((h) => {
      if (typeof h === "string") return h;
      if (h && typeof h === "object") {
        const rec = h as Record<string, unknown>;
        const day = rec.day ?? rec.dayOfWeek ?? "";
        const hrs = rec.hours ?? rec.openHours ?? "";
        return `${day}: ${hrs}`;
      }
      return String(h);
    })
    .join("; ")
    .slice(0, 400);
}

export function condenseGbp(gbp: unknown): CondensedGbp {
  const g = (gbp ?? {}) as Record<string, unknown>;
  const categories = g.categories as string[] | undefined;
  const recency = computeReviewRecency(g.reviews);
  return {
    title: g.title as string | undefined,
    categoryName: g.categoryName as string | undefined,
    categories,
    primaryCategory: categories?.[0],
    address: g.address as string | undefined,
    phone: g.phone as string | undefined,
    website: g.website as string | undefined,
    hasWebsite: !!g.website,
    hasPhone: !!g.phone,
    hasHours: !!g.openingHours,
    averageStarRating: g.averageStarRating as number | undefined,
    reviewsCount: g.reviewsCount as number | undefined,
    reviewsDistribution: g.reviewsDistribution as Record<string, unknown> | undefined,
    reviewsLast30d: recency.last30d,
    reviewsLast90d: recency.last90d,
    imagesCount: g.imagesCount as number | undefined,
    imageCategories: g.imageCategories,
    openingHoursSummary: summarizeOpeningHours(g.openingHours),
  };
}

export function condenseCompetitors(comps: unknown[]): CondensedGbp[] {
  return comps.map(condenseGbp);
}
