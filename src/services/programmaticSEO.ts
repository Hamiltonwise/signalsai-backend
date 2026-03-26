import { CITIES, SPECIALTIES, buildPageSlug, toSlug, CityData } from "../data/cityData";
import { textSearch } from "../controllers/places/feature-services/GooglePlacesApiService";
import {
  ProgrammaticPageModel,
  CompetitorSnapshot,
  ContentSection,
} from "../models/ProgrammaticPageModel";

/**
 * Programmatic SEO Engine V2
 *
 * STEP 1: Gather live competitor data from Google Places API
 * STEP 2: Generate content using real competitor names and review counts
 * STEP 3: Build @graph entity schema connecting every page to Alloro Organization
 */

const ALLORO_ORG_ID = "https://getalloro.com/#organization";

/** Fetch live competitor data for a specialty + city combination */
export async function gatherCompetitors(
  specialty: typeof SPECIALTIES[number],
  city: CityData
): Promise<CompetitorSnapshot[]> {
  const query = `${specialty.searchTerm} in ${city.city}, ${city.stateAbbr}`;

  const places = await textSearch(query, 10, {
    lat: city.lat,
    lng: city.lng,
    radiusMeters: 40234, // 25 miles
  });

  return places.map((place) => ({
    placeId: place.id || "",
    name: place.displayName?.text || place.displayName || "Unknown",
    rating: place.rating || 0,
    reviewCount: place.userRatingCount || 0,
    address: place.formattedAddress || "",
    phone: place.nationalPhoneNumber || undefined,
    website: place.websiteUri || undefined,
  }));
}

/** Generate content sections from real competitor data */
export function generateContent(
  specialty: typeof SPECIALTIES[number],
  city: CityData,
  competitors: CompetitorSnapshot[]
): ContentSection[] {
  const avgRating =
    competitors.length > 0
      ? (competitors.reduce((sum, c) => sum + c.rating, 0) / competitors.length).toFixed(1)
      : "N/A";
  const avgReviews =
    competitors.length > 0
      ? Math.round(competitors.reduce((sum, c) => sum + c.reviewCount, 0) / competitors.length)
      : 0;
  const topCompetitor = competitors.sort((a, b) => b.reviewCount - a.reviewCount)[0];

  const sections: ContentSection[] = [
    {
      type: "hero",
      heading: `${specialty.name} Market in ${city.city}, ${city.stateAbbr}`,
      body: `There are ${competitors.length} ${specialty.searchTerm} practices competing in ${city.city}, ${city.stateAbbr}. The average rating is ${avgRating} stars with ${avgReviews} reviews per practice. ${topCompetitor ? `The most reviewed practice is ${topCompetitor.name} with ${topCompetitor.reviewCount} reviews.` : ""} Understanding where you stand in this market is the first step to growing your practice.`,
    },
    {
      type: "market_overview",
      heading: `${city.city} ${specialty.name} Competition at a Glance`,
      body: `${city.city} has a ${competitors.length >= 8 ? "highly competitive" : competitors.length >= 4 ? "moderately competitive" : "emerging"} ${specialty.searchTerm} market. ${competitors.length >= 8 ? "With " + competitors.length + " practices competing for the same patients, visibility and reputation are critical differentiators." : competitors.length >= 4 ? "There is room to stand out, but you need to actively manage your online presence." : "Early movers who build reviews and referral networks now will dominate this market within 12 months."}`,
    },
    {
      type: "competitors",
      heading: `Top ${specialty.name} Practices in ${city.city}`,
      body: competitors
        .slice(0, 5)
        .map(
          (c, i) =>
            `${i + 1}. ${c.name} - ${c.rating} stars, ${c.reviewCount} reviews${c.address ? ` (${c.address})` : ""}`
        )
        .join("\n"),
    },
    {
      type: "faq",
      heading: `Frequently Asked Questions About ${specialty.name} Practices in ${city.city}`,
      body: JSON.stringify([
        {
          question: `How many ${specialty.searchTerm} practices are in ${city.city}, ${city.stateAbbr}?`,
          answer: `There are currently ${competitors.length} ${specialty.searchTerm} practices in the ${city.city} area, with an average rating of ${avgRating} stars.`,
        },
        {
          question: `What is the average review count for ${specialty.searchTerm} practices in ${city.city}?`,
          answer: `${specialty.name} practices in ${city.city} have an average of ${avgReviews} Google reviews. ${topCompetitor ? `The most reviewed practice, ${topCompetitor.name}, has ${topCompetitor.reviewCount} reviews.` : ""}`,
        },
        {
          question: `How competitive is the ${specialty.searchTerm} market in ${city.city}?`,
          answer: `${city.city} is a ${competitors.length >= 8 ? "highly competitive" : competitors.length >= 4 ? "moderately competitive" : "growing"} market for ${specialty.searchTerm} practices. Running a free Checkup shows exactly where your practice ranks against these competitors.`,
        },
      ]),
    },
    {
      type: "cta",
      heading: `See Where You Stand in ${city.city}`,
      body: `Run your free Referral Base Checkup to see how your ${specialty.searchTerm} practice compares to the ${competitors.length} competitors in ${city.city}, ${city.stateAbbr}. It takes 30 seconds and shows you exactly where you rank.`,
    },
  ];

  return sections;
}

/** Build JSON-LD @graph schema for a programmatic page */
export function buildSchemaMarkup(
  specialty: typeof SPECIALTIES[number],
  city: CityData,
  competitors: CompetitorSnapshot[],
  pageSlug: string
): Record<string, unknown> {
  const pageUrl = `https://getalloro.com/${pageSlug}`;
  const faqs = competitors.length > 0 ? [
    {
      "@type": "Question",
      name: `How many ${specialty.searchTerm} practices are in ${city.city}, ${city.stateAbbr}?`,
      acceptedAnswer: {
        "@type": "Answer",
        text: `There are ${competitors.length} ${specialty.searchTerm} practices in ${city.city}, ${city.stateAbbr}.`,
      },
    },
    {
      "@type": "Question",
      name: `What is the average rating for ${specialty.searchTerm} practices in ${city.city}?`,
      acceptedAnswer: {
        "@type": "Answer",
        text: `The average rating is ${(competitors.reduce((s, c) => s + c.rating, 0) / competitors.length).toFixed(1)} stars across ${competitors.length} practices.`,
      },
    },
  ] : [];

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ALLORO_ORG_ID,
        name: "Alloro",
        url: "https://getalloro.com",
        description: "Business clarity platform for licensed specialists.",
        sameAs: [],
      },
      {
        "@type": "WebPage",
        "@id": pageUrl,
        url: pageUrl,
        name: `${specialty.name} in ${city.city}, ${city.stateAbbr} - Market Intelligence`,
        description: `Live competitive intelligence for ${specialty.searchTerm} practices in ${city.city}, ${city.stateAbbr}. ${competitors.length} practices tracked.`,
        isPartOf: { "@id": "https://getalloro.com/#website" },
        about: {
          "@type": "Service",
          name: `${specialty.name} Practice Intelligence`,
          areaServed: {
            "@type": "City",
            name: city.city,
            containedInPlace: {
              "@type": "State",
              name: city.state,
            },
          },
        },
        publisher: { "@id": ALLORO_ORG_ID },
      },
      ...(faqs.length > 0 ? [{
        "@type": "FAQPage",
        "@id": `${pageUrl}#faq`,
        mainEntity: faqs,
      }] : []),
    ],
  };
}

/** Generate a single programmatic page with real Places API data */
export async function generatePage(
  specialty: typeof SPECIALTIES[number],
  city: CityData
): Promise<void> {
  const pageSlug = buildPageSlug(specialty.slug, city);
  const citySlug = toSlug(city.city);

  // Check if page already exists
  const existing = await ProgrammaticPageModel.findBySlug(pageSlug);

  // STEP 1: Gather live competitor data
  const competitors = await gatherCompetitors(specialty, city);

  // STEP 2: Generate content from real data
  const contentSections = generateContent(specialty, city, competitors);

  // STEP 3: Build schema markup
  const schemaMarkup = buildSchemaMarkup(specialty, city, competitors, pageSlug);

  const title = `${specialty.name} in ${city.city}, ${city.stateAbbr} - Competitive Market Intelligence | Alloro`;
  const metaDescription = `${competitors.length} ${specialty.searchTerm} practices competing in ${city.city}, ${city.stateAbbr}. See ratings, reviews, and where your practice ranks. Free Checkup available.`;

  const pageData = {
    specialty_slug: specialty.slug,
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
    competitors_refreshed_at: new Date(),
    needs_refresh: false,
  };

  if (existing) {
    await ProgrammaticPageModel.updateById(existing.id, pageData);
  } else {
    await ProgrammaticPageModel.create(pageData);
  }
}

/** Generate pages for a batch of city+specialty combinations */
export async function generateBatch(
  specialtySlugs?: string[],
  cityNames?: string[],
  limit?: number
): Promise<{ generated: number; errors: string[] }> {
  const specs = specialtySlugs
    ? SPECIALTIES.filter((s) => specialtySlugs.includes(s.slug))
    : SPECIALTIES;
  const cities = cityNames
    ? CITIES.filter((c) => cityNames.includes(c.city))
    : CITIES;

  let generated = 0;
  const errors: string[] = [];
  let count = 0;
  const max = limit || Infinity;

  for (const specialty of specs) {
    for (const city of cities) {
      if (count >= max) break;
      try {
        await generatePage(specialty, city);
        generated++;
        count++;
        // Rate limit: 100ms between API calls
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (err) {
        const msg = `Failed: ${specialty.slug} in ${city.city}, ${city.stateAbbr}: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(msg);
        console.error(msg);
      }
    }
    if (count >= max) break;
  }

  return { generated, errors };
}

/** Get internal linking targets for hub-and-spoke AEO architecture */
export function getInternalLinks(
  currentPage: { specialty_slug: string; city_slug: string; state_abbr: string }
): { sameSpecialty: string[]; sameCity: string[]; nearbyCity: string[] } {
  // Same specialty, different cities in the same state
  const sameSpecialty = CITIES
    .filter(
      (c) =>
        toSlug(c.city) !== currentPage.city_slug &&
        c.stateAbbr.toLowerCase() === currentPage.state_abbr.toLowerCase()
    )
    .slice(0, 3)
    .map((c) => buildPageSlug(currentPage.specialty_slug, c));

  // Same city, different specialties
  const city = CITIES.find((c) => toSlug(c.city) === currentPage.city_slug);
  const sameCity = city
    ? SPECIALTIES
        .filter((s) => s.slug !== currentPage.specialty_slug)
        .slice(0, 3)
        .map((s) => buildPageSlug(s.slug, city))
    : [];

  // Nearby cities (same state, different city, any specialty)
  const nearbyCity = CITIES
    .filter(
      (c) =>
        toSlug(c.city) !== currentPage.city_slug &&
        c.stateAbbr.toLowerCase() === currentPage.state_abbr.toLowerCase()
    )
    .slice(0, 3)
    .map((c) => buildPageSlug(currentPage.specialty_slug, c));

  return { sameSpecialty, sameCity, nearbyCity };
}
