/**
 * Programmatic Page Generator Service
 *
 * Generates SEO pages with REAL competitor data from Google Places API.
 * Three steps per page:
 *   STEP 1: Gather live competitor data via Places API textSearch
 *   STEP 2: Generate template-based content sections using real data
 *   STEP 3: Build @graph JSON-LD entity schema
 *
 * CRITICAL: No AI/LLM content generation. All content is template-based
 * with real data interpolation from Places API results.
 */

import { textSearch } from "../controllers/places/feature-services/GooglePlacesApiService";
import {
  CITY_DATA,
  CITY_BY_SLUG,
  SPECIALTIES,
  buildPageSlug,
  toSlug,
  type CityData,
  type SpecialtyData,
} from "../data/cityData";
import {
  ProgrammaticPageModel,
  type IProgrammaticPage,
} from "../models/ProgrammaticPageModel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Competitor {
  name: string;
  rating: number;
  reviewCount: number;
  address: string;
  placeId: string;
}

export interface ContentSection {
  type: "hero" | "market_overview" | "competitors" | "insights" | "cta";
  heading: string;
  content: string | object;
}

export interface GeneratedPage {
  title: string;
  metaDescription: string;
  competitorsSnapshot: Competitor[];
  contentSections: ContentSection[];
  schemaMarkup: object;
}

/** Internal alias so callers don't need to import cityData types */
export type { CityData, SpecialtyData };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLORO_ORG_ID = "https://getalloro.com/#organization";
const ALLORO_WEBSITE_ID = "https://getalloro.com/#website";
const BASE_URL = "https://getalloro.com";

// ---------------------------------------------------------------------------
// STEP 1 — Gather live competitor data
// ---------------------------------------------------------------------------

/**
 * Fetch competitors from Google Places API for a specialty + city.
 * Uses the existing textSearch integration (New Places API).
 * Returns an empty array (rather than throwing) when the API fails.
 */
async function fetchCompetitors(
  specialty: SpecialtyData,
  city: CityData
): Promise<Competitor[]> {
  const query = `${specialty.name} in ${city.city}, ${city.stateAbbr}`;

  try {
    const places = await textSearch(query, 20, {
      lat: city.lat,
      lng: city.lng,
      radiusMeters: 40234, // 25 miles
    });

    return places.map((place: Record<string, any>) => ({
      name: place.displayName?.text || place.displayName || "Unknown",
      rating: place.rating ?? 0,
      reviewCount: place.userRatingCount ?? 0,
      address: place.formattedAddress || "",
      placeId: place.id || "",
    }));
  } catch (err) {
    console.error(
      `[programmaticPages] Places API failed for "${query}":`,
      err instanceof Error ? err.message : String(err)
    );
    return [];
  }
}

// ---------------------------------------------------------------------------
// STEP 2 — Generate content sections from real data
// ---------------------------------------------------------------------------

export function buildContentSections(
  specialty: SpecialtyData,
  city: CityData,
  competitors: Competitor[]
): ContentSection[] {
  const count = competitors.length;
  const totalReviews = competitors.reduce((s, c) => s + c.reviewCount, 0);
  const avgRating =
    count > 0
      ? (competitors.reduce((s, c) => s + c.rating, 0) / count).toFixed(1)
      : "N/A";
  const avgReviews = count > 0 ? Math.round(totalReviews / count) : 0;
  const topByReviews = [...competitors].sort(
    (a, b) => b.reviewCount - a.reviewCount
  );
  const topPractice = topByReviews[0];

  // Market competitiveness label
  const competitiveness =
    count >= 15
      ? "highly saturated"
      : count >= 8
        ? "highly competitive"
        : count >= 4
          ? "moderately competitive"
          : "emerging";

  // Rating distribution buckets
  const above45 = competitors.filter((c) => c.rating >= 4.5).length;
  const below40 = competitors.filter((c) => c.rating < 4.0).length;

  const sections: ContentSection[] = [
    // --- Hero ---
    {
      type: "hero",
      heading: `Find the Best ${specialty.name} in ${city.city}, ${city.stateAbbr}`,
      content: {
        subtitle: `${count} ${specialty.name.toLowerCase()} practices serving ${city.city}`,
        stats: {
          practiceCount: count,
          avgRating,
          avgReviews,
          totalReviews,
        },
      },
    },

    // --- Market Overview ---
    {
      type: "market_overview",
      heading: `${count} ${specialty.name}s Serving ${city.city}`,
      content:
        count > 0
          ? `The ${city.city}, ${city.stateAbbr} market is ${competitiveness} for ${specialty.name.toLowerCase()} practices. ` +
            `Across ${count} practices, the average Google rating is ${avgRating} stars with ${avgReviews} reviews per practice ` +
            `(${totalReviews.toLocaleString()} total reviews).` +
            (topPractice
              ? ` The most-reviewed practice is ${topPractice.name} with ${topPractice.reviewCount.toLocaleString()} reviews.`
              : "")
          : `Market data for ${specialty.name.toLowerCase()} practices in ${city.city}, ${city.stateAbbr} is currently being gathered. Check back soon.`,
    },

    // --- Top Competitors Table ---
    {
      type: "competitors",
      heading: `Top ${specialty.name} Practices in ${city.city}`,
      content: {
        columns: ["Practice", "Rating", "Reviews"],
        rows: topByReviews.slice(0, 10).map((c) => ({
          name: c.name,
          rating: c.rating,
          reviewCount: c.reviewCount,
          address: c.address,
        })),
      },
    },

    // --- Market Insights ---
    {
      type: "insights",
      heading: `${city.city} ${specialty.name} Market Insights`,
      content: {
        ratingDistribution: {
          above45,
          below40,
          summary:
            count > 0
              ? `${above45} of ${count} practices (${Math.round((above45 / count) * 100)}%) have a 4.5+ star rating. ` +
                `${below40} practice${below40 !== 1 ? "s" : ""} ${below40 !== 1 ? "fall" : "falls"} below 4.0 stars.`
              : "No rating data available yet.",
        },
        reviewVelocity:
          count > 0
            ? {
                leader: topPractice?.name ?? "N/A",
                leaderReviews: topPractice?.reviewCount ?? 0,
                median:
                  topByReviews.length > 0
                    ? topByReviews[Math.floor(topByReviews.length / 2)]
                        .reviewCount
                    : 0,
                gap:
                  topPractice && topByReviews.length > 1
                    ? topPractice.reviewCount -
                      topByReviews[Math.floor(topByReviews.length / 2)]
                        .reviewCount
                    : 0,
                summary: topPractice
                  ? `${topPractice.name} leads with ${topPractice.reviewCount.toLocaleString()} reviews — ` +
                    `${((topPractice.reviewCount / Math.max(avgReviews, 1)) * 100 - 100).toFixed(0)}% above the market average.`
                  : "No review velocity data available.",
              }
            : null,
        competitiveness,
      },
    },

    // --- CTA ---
    {
      type: "cta",
      heading: "Get Your Free Business Health Checkup",
      content: {
        text:
          count > 0
            ? `See exactly where your ${specialty.name.toLowerCase()} practice ranks against the ${count} competitors in ${city.city}, ${city.stateAbbr}. ` +
              `Real competitor data. Real market insights. Takes 30 seconds.`
            : `Discover how your ${specialty.name.toLowerCase()} practice compares to the competition in ${city.city}, ${city.stateAbbr}. Takes 30 seconds.`,
        buttonLabel: "Run Your Free Checkup",
        href: "/checkup",
      },
    },
  ];

  return sections;
}

// ---------------------------------------------------------------------------
// STEP 3 — Build @graph JSON-LD entity schema
// ---------------------------------------------------------------------------

export function buildSchemaMarkup(
  page: { title: string; metaDescription: string; pageSlug: string },
  competitors: Competitor[]
): object {
  const pageUrl = `${BASE_URL}/${page.pageSlug}`;

  const localBusinessEntities = competitors.slice(0, 10).map((c) => ({
    "@type": "LocalBusiness",
    "@id": `${BASE_URL}/places/${c.placeId}`,
    name: c.name,
    address: c.address,
    aggregateRating:
      c.reviewCount > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: c.rating,
            reviewCount: c.reviewCount,
          }
        : undefined,
  }));

  return {
    "@context": "https://schema.org",
    "@graph": [
      // Organization entity — Alloro
      {
        "@type": "Organization",
        "@id": ALLORO_ORG_ID,
        name: "Alloro",
        url: BASE_URL,
        description:
          "Business clarity platform for licensed specialists.",
        sameAs: [],
      },

      // WebPage entity
      {
        "@type": "WebPage",
        "@id": pageUrl,
        url: pageUrl,
        name: page.title,
        description: page.metaDescription,
        isPartOf: { "@id": ALLORO_WEBSITE_ID },
        publisher: { "@id": ALLORO_ORG_ID },
      },

      // BreadcrumbList
      {
        "@type": "BreadcrumbList",
        "@id": `${pageUrl}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: BASE_URL,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Market Intelligence",
            item: `${BASE_URL}/market-intelligence`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: page.title,
            item: pageUrl,
          },
        ],
      },

      // LocalBusiness entities for each competitor
      ...localBusinessEntities,
    ],
  };
}

// ---------------------------------------------------------------------------
// Main entry points
// ---------------------------------------------------------------------------

/**
 * Generate a complete programmatic page for a specialty + city combination.
 *
 * Looks up specialty and city from slug strings, fetches live Places API data,
 * builds content sections and schema markup, and persists to the database.
 *
 * If the Places API call fails or returns no results, the page is still created
 * with empty competitors and needs_refresh=true.
 */
export async function generatePage(
  specialtySlug: string,
  citySlug: string
): Promise<GeneratedPage> {
  // Resolve slugs to data objects
  const specialty = SPECIALTIES.find((s) => s.slug === specialtySlug);
  if (!specialty) {
    throw new Error(`Unknown specialty slug: ${specialtySlug}`);
  }

  const city = CITY_BY_SLUG.get(citySlug);
  if (!city) {
    throw new Error(`Unknown city slug: ${citySlug}`);
  }

  const pageSlug = buildPageSlug(specialtySlug, city);

  // STEP 1: Gather live competitor data
  const competitors = await fetchCompetitors(specialty, city);

  // STEP 2: Generate content sections
  const contentSections = buildContentSections(specialty, city, competitors);

  // STEP 3: Build schema markup
  const title = `${specialty.name} in ${city.city}, ${city.stateAbbr} — Market Intelligence | Alloro`;
  const metaDescription =
    competitors.length > 0
      ? `${competitors.length} ${specialty.name.toLowerCase()} practices in ${city.city}, ${city.stateAbbr}. ` +
        `Average ${(competitors.reduce((s, c) => s + c.rating, 0) / competitors.length).toFixed(1)}-star rating across ` +
        `${competitors.reduce((s, c) => s + c.reviewCount, 0).toLocaleString()} reviews. Free Checkup available.`
      : `${specialty.name} competitive intelligence for ${city.city}, ${city.stateAbbr}. Free Business Health Checkup available.`;

  const schemaMarkup = buildSchemaMarkup(
    { title, metaDescription, pageSlug },
    competitors
  );

  // Persist to database
  const needsRefresh = competitors.length === 0;
  const existing = await ProgrammaticPageModel.findBySlug(pageSlug);

  const pageData: Record<string, unknown> = {
    specialty_slug: specialtySlug,
    city_slug: citySlug,
    page_slug: pageSlug,
    specialty_name: specialty.name,
    city_name: city.city,
    state: city.state,
    state_abbr: city.stateAbbr,
    lat: city.lat,
    lng: city.lng,
    title,
    meta_description: metaDescription,
    competitors_snapshot: competitors,
    content_sections: contentSections,
    schema_markup: schemaMarkup,
    competitors_refreshed_at: needsRefresh ? null : new Date(),
    needs_refresh: needsRefresh,
    status: needsRefresh ? "needs_refresh" : "draft",
    updated_at: new Date(),
  };

  if (existing) {
    await ProgrammaticPageModel.updateById(existing.id, pageData);
  } else {
    await ProgrammaticPageModel.create(pageData);
  }

  return {
    title,
    metaDescription,
    competitorsSnapshot: competitors,
    contentSections,
    schemaMarkup,
  };
}

/**
 * Refresh competitor data for an existing page by its database ID.
 * Re-fetches Places API data, regenerates content sections and schema,
 * and updates the database row.
 */
export async function refreshCompetitors(pageId: number): Promise<void> {
  const page = await ProgrammaticPageModel.findById(pageId);
  if (!page) {
    throw new Error(`Programmatic page not found: ${pageId}`);
  }

  const specialty = SPECIALTIES.find(
    (s) => s.slug === (page as IProgrammaticPage).specialty_slug
  );
  const city = CITY_BY_SLUG.get((page as IProgrammaticPage).city_slug);

  if (!specialty || !city) {
    throw new Error(
      `Cannot resolve specialty/city for page ${pageId}: ` +
        `specialty=${(page as IProgrammaticPage).specialty_slug}, city=${(page as IProgrammaticPage).city_slug}`
    );
  }

  // Re-fetch competitors
  const competitors = await fetchCompetitors(specialty, city);
  const contentSections = buildContentSections(specialty, city, competitors);

  const title = `${specialty.name} in ${city.city}, ${city.stateAbbr} — Market Intelligence | Alloro`;
  const metaDescription =
    competitors.length > 0
      ? `${competitors.length} ${specialty.name.toLowerCase()} practices in ${city.city}, ${city.stateAbbr}. ` +
        `Average ${(competitors.reduce((s, c) => s + c.rating, 0) / competitors.length).toFixed(1)}-star rating across ` +
        `${competitors.reduce((s, c) => s + c.reviewCount, 0).toLocaleString()} reviews. Free Checkup available.`
      : `${specialty.name} competitive intelligence for ${city.city}, ${city.stateAbbr}. Free Business Health Checkup available.`;

  const pageSlug = buildPageSlug(specialty.slug, city);
  const schemaMarkup = buildSchemaMarkup(
    { title, metaDescription, pageSlug },
    competitors
  );

  const needsRefresh = competitors.length === 0;

  await ProgrammaticPageModel.updateById((page as IProgrammaticPage).id, {
    competitors_snapshot: competitors,
    content_sections: contentSections,
    schema_markup: schemaMarkup,
    title,
    meta_description: metaDescription,
    competitors_refreshed_at: needsRefresh ? null : new Date(),
    needs_refresh: needsRefresh,
    status: needsRefresh ? "needs_refresh" : (page as IProgrammaticPage).status === "published" ? "published" : "draft",
    updated_at: new Date(),
  });
}
