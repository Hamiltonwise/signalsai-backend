/**
 * WO-7 Component 3: Programmatic Page Generator
 *
 * Three-step process:
 * STEP 1: Gather live competitor data from Places API
 * STEP 2: Generate content using real competitor names and review counts
 * STEP 3: Build @graph entity schema connecting to Alloro Organization entity
 *
 * CRITICAL: Every page must contain real Places API data. No thin AI content.
 */

import knex from "../database/connection";

interface Competitor {
  name: string;
  placeId: string;
  rating: number;
  reviewCount: number;
  address: string;
  types: string[];
}

interface PageContent {
  title: string;
  metaDescription: string;
  h1: string;
  bodyHtml: string;
  competitors: Competitor[];
  schemaMarkup: Record<string, unknown>;
  hubSpokeLinks: Record<string, string[]>;
}

const ALLORO_ORG_SCHEMA = {
  "@type": "Organization",
  "@id": "https://getalloro.com/#organization",
  name: "Alloro",
  url: "https://getalloro.com",
  logo: "https://getalloro.com/logo.png",
  description:
    "Business intelligence platform for licensed specialists",
};

/**
 * STEP 1: Fetch real competitor data from Google Places API.
 * Returns actual business names, ratings, and review counts.
 */
export async function fetchCompetitors(
  specialty: string,
  cityName: string,
  stateAbbr: string
): Promise<Competitor[]> {
  const apiKey = process.env.GOOGLE_PLACES_API;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_PLACES_API required for programmatic page generation"
    );
  }

  const query = `${specialty} in ${cityName}, ${stateAbbr}`;
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!data.results || data.results.length === 0) {
    return [];
  }

  return data.results.slice(0, 20).map(
    (place: {
      name: string;
      place_id: string;
      rating?: number;
      user_ratings_total?: number;
      formatted_address?: string;
      types?: string[];
    }) => ({
      name: place.name,
      placeId: place.place_id,
      rating: place.rating || 0,
      reviewCount: place.user_ratings_total || 0,
      address: place.formatted_address || "",
      types: place.types || [],
    })
  );
}

/**
 * STEP 2: Generate page content using real competitor data.
 * No thin AI content. Every stat references real data.
 */
export function generatePageContent(
  specialtyName: string,
  specialtySlug: string,
  cityName: string,
  stateAbbr: string,
  citySlug: string,
  competitors: Competitor[]
): PageContent {
  const pageSlug = `${specialtySlug}-${citySlug}`;
  const totalReviews = competitors.reduce((sum, c) => sum + c.reviewCount, 0);
  const avgRating =
    competitors.length > 0
      ? competitors.reduce((sum, c) => sum + c.rating, 0) / competitors.length
      : 0;
  const topCompetitors = competitors
    .sort((a, b) => b.reviewCount - a.reviewCount)
    .slice(0, 5);

  const title = `${specialtyName} in ${cityName}, ${stateAbbr} | Market Intelligence | Alloro`;
  const metaDescription = `Competitive analysis for ${specialtyName.toLowerCase()} practices in ${cityName}, ${stateAbbr}. ${competitors.length} practices analyzed, ${totalReviews.toLocaleString()} total reviews tracked. Real market data, not estimates.`;

  const h1 = `${specialtyName} Market Intelligence: ${cityName}, ${stateAbbr}`;

  const competitorRows = topCompetitors
    .map(
      (c) =>
        `<tr><td>${escapeHtml(c.name)}</td><td>${c.rating.toFixed(1)}</td><td>${c.reviewCount.toLocaleString()}</td></tr>`
    )
    .join("\n");

  const bodyHtml = `
<section class="market-overview">
  <h2>Market Overview</h2>
  <p>The ${cityName}, ${stateAbbr} market has <strong>${competitors.length} ${specialtyName.toLowerCase()} practices</strong> competing for patients. Together, these practices have accumulated <strong>${totalReviews.toLocaleString()} reviews</strong> with an average rating of <strong>${avgRating.toFixed(1)} stars</strong>.</p>
</section>

<section class="top-competitors">
  <h2>Top Practices by Review Volume</h2>
  <table>
    <thead><tr><th>Practice</th><th>Rating</th><th>Reviews</th></tr></thead>
    <tbody>${competitorRows}</tbody>
  </table>
</section>

<section class="market-insights">
  <h2>What This Means for Your Practice</h2>
  <p>In a market with ${competitors.length} competitors, visibility is everything. The top practice in ${cityName} has ${topCompetitors[0]?.reviewCount.toLocaleString() || "N/A"} reviews. If your practice is not in the top 3 by review volume, potential patients may never find you.</p>
  <p>Understanding where you stand is the first step. Alloro's free Referral Base Checkup analyzes your specific practice against every competitor in your market, using real data, not estimates.</p>
</section>

<section class="cta">
  <h2>See Where You Stand</h2>
  <p>Get your free competitive analysis for ${cityName}, ${stateAbbr}. Real competitor data. Real market insights. Takes 30 seconds.</p>
  <a href="/checkup" class="cta-button">Run Your Free Checkup</a>
</section>`.trim();

  // STEP 3: @graph entity schema
  const schemaMarkup = {
    "@context": "https://schema.org",
    "@graph": [
      ALLORO_ORG_SCHEMA,
      {
        "@type": "WebPage",
        "@id": `https://getalloro.com/${pageSlug}`,
        url: `https://getalloro.com/${pageSlug}`,
        name: title,
        description: metaDescription,
        isPartOf: { "@id": "https://getalloro.com/#organization" },
      },
      {
        "@type": "FAQPage",
        "@id": `https://getalloro.com/${pageSlug}#faq`,
        mainEntity: [
          {
            "@type": "Question",
            name: `How many ${specialtyName.toLowerCase()} practices are in ${cityName}, ${stateAbbr}?`,
            acceptedAnswer: {
              "@type": "Answer",
              text: `There are ${competitors.length} ${specialtyName.toLowerCase()} practices in the ${cityName}, ${stateAbbr} market with a combined ${totalReviews.toLocaleString()} patient reviews.`,
            },
          },
          {
            "@type": "Question",
            name: `What is the average rating for ${specialtyName.toLowerCase()} practices in ${cityName}?`,
            acceptedAnswer: {
              "@type": "Answer",
              text: `The average rating across ${competitors.length} ${specialtyName.toLowerCase()} practices in ${cityName} is ${avgRating.toFixed(1)} stars based on ${totalReviews.toLocaleString()} total reviews.`,
            },
          },
          {
            "@type": "Question",
            name: `How can I improve my ${specialtyName.toLowerCase()} practice's visibility in ${cityName}?`,
            acceptedAnswer: {
              "@type": "Answer",
              text: `Start with a free Referral Base Checkup at getalloro.com/checkup to see exactly where your practice stands against ${competitors.length} competitors in ${cityName}. Alloro analyzes real market data including review velocity, competitive positioning, and referral patterns.`,
            },
          },
        ],
      },
    ],
  };

  return {
    title,
    metaDescription,
    h1,
    bodyHtml,
    competitors,
    schemaMarkup,
    hubSpokeLinks: {},
  };
}

/**
 * Generate and store a programmatic page for a specialty-city combo.
 */
export async function generateAndStorePage(
  specialtyName: string,
  specialtySlug: string,
  cityName: string,
  stateAbbr: string,
  citySlug: string,
  batchNumber: number
): Promise<string> {
  const pageSlug = `${specialtySlug}-${citySlug}`;

  // Check if page already exists
  const existing = await knex("programmatic_pages")
    .where({ page_slug: pageSlug })
    .first();

  if (existing && !existing.needs_refresh) {
    return existing.id;
  }

  // STEP 1: Fetch real competitor data
  const competitors = await fetchCompetitors(
    specialtyName,
    cityName,
    stateAbbr
  );

  if (competitors.length === 0) {
    console.warn(
      `No competitors found for ${specialtyName} in ${cityName}, ${stateAbbr}. Skipping.`
    );
    return "";
  }

  // STEP 2: Generate content with real data
  const content = generatePageContent(
    specialtyName,
    specialtySlug,
    cityName,
    stateAbbr,
    citySlug,
    competitors
  );

  // STEP 3: Store with schema markup
  const pageData = {
    specialty_slug: specialtySlug,
    city_slug: citySlug,
    city_name: cityName,
    state_abbr: stateAbbr,
    specialty_name: specialtyName,
    page_slug: pageSlug,
    title: content.title,
    meta_description: content.metaDescription,
    h1: content.h1,
    body_html: content.bodyHtml,
    competitors_snapshot: JSON.stringify(content.competitors),
    schema_markup: JSON.stringify(content.schemaMarkup),
    hub_spoke_links: JSON.stringify(content.hubSpokeLinks),
    competitors_fetched_at: new Date().toISOString(),
    publish_batch: batchNumber,
    needs_refresh: false,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    await knex("programmatic_pages")
      .where({ id: existing.id })
      .update(pageData);
    return existing.id;
  }

  const [inserted] = await knex("programmatic_pages")
    .insert(pageData)
    .returning("id");
  return inserted.id;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
