import type { Knex } from "knex";

/**
 * Adds project_identity JSONB column to consolidate all project context
 * (business, brand, voice, content essentials, extracted assets, raw inputs)
 * into a single source of truth. Backfills from existing step_*_scrape columns
 * for projects that already have scrape data.
 *
 * The step_*_scrape columns are NOT dropped in this migration. A separate
 * follow-up migration will drop them after consumers are verified migrated
 * and the new identity flow is stable in production.
 */
export async function up(knex: Knex): Promise<void> {
  // 1. Add the column
  await knex.raw(`
    ALTER TABLE website_builder.projects
      ADD COLUMN IF NOT EXISTS project_identity JSONB DEFAULT NULL;
  `);

  // 2. Backfill: construct project_identity for existing projects that have scrape data
  const projects = await knex("website_builder.projects")
    .select(
      "id",
      "selected_place_id",
      "selected_website_url",
      "step_gbp_scrape",
      "step_website_scrape",
      "step_image_analysis",
      "primary_color",
      "accent_color",
      "updated_at",
    )
    .whereNotNull("step_gbp_scrape")
    .orWhereNotNull("step_website_scrape")
    .orWhereNotNull("step_image_analysis");

  console.log(
    `[migration:project_identity] Backfilling ${projects.length} projects with existing scrape data`,
  );

  for (const project of projects) {
    const identity = buildIdentityFromLegacy(project);
    if (!identity) continue;

    await knex("website_builder.projects")
      .where("id", project.id)
      .update({ project_identity: JSON.stringify(identity) });
  }

  console.log(
    `[migration:project_identity] Backfill complete for ${projects.length} projects`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE website_builder.projects
      DROP COLUMN IF EXISTS project_identity;
  `);
}

// ---------------------------------------------------------------------------
// Backfill helpers
// ---------------------------------------------------------------------------

interface LegacyProject {
  id: string;
  selected_place_id: string | null;
  selected_website_url: string | null;
  step_gbp_scrape: Record<string, unknown> | null;
  step_website_scrape: Record<string, unknown> | null;
  step_image_analysis: Record<string, unknown> | null;
  primary_color: string | null;
  accent_color: string | null;
  updated_at: Date;
}

function buildIdentityFromLegacy(project: LegacyProject): Record<string, unknown> | null {
  const gbp = project.step_gbp_scrape;
  const web = project.step_website_scrape;
  const imgAnalysis = project.step_image_analysis;

  // Skip if truly nothing to backfill
  if (!gbp && !web && !imgAnalysis) return null;

  const gbpObj = (gbp && typeof gbp === "object") ? (gbp as Record<string, unknown>) : {};
  const webObj = (web && typeof web === "object") ? (web as Record<string, unknown>) : {};
  const imgObj = (imgAnalysis && typeof imgAnalysis === "object") ? (imgAnalysis as Record<string, unknown>) : {};

  const business = {
    name: (gbpObj.title as string) || (gbpObj.name as string) || null,
    category: (gbpObj.categoryName as string) || (gbpObj.category as string) || null,
    phone: (gbpObj.phone as string) || null,
    address: (gbpObj.address as string) || null,
    city: (gbpObj.city as string) || null,
    state: (gbpObj.state as string) || null,
    zip: (gbpObj.postalCode as string) || null,
    hours: (gbpObj.openingHours as unknown) || null,
    rating: (gbpObj.totalScore as number) ?? (gbpObj.rating as number) ?? null,
    review_count: (gbpObj.reviewsCount as number) ?? (gbpObj.reviewCount as number) ?? null,
    website_url: project.selected_website_url || (gbpObj.website as string) || null,
    place_id: project.selected_place_id || (gbpObj.placeId as string) || null,
  };

  const brand = {
    primary_color: project.primary_color || null,
    accent_color: project.accent_color || null,
    gradient_enabled: false,
    gradient_from: null,
    gradient_to: null,
    gradient_direction: "to-br",
    logo_s3_url: null,
    logo_alt_text: business.name || null,
    fonts: { heading: "serif", body: "sans" },
  };

  // Images: merge GBP imageUrls with analysis results
  const gbpImageUrls = Array.isArray(gbpObj.imageUrls) ? (gbpObj.imageUrls as string[]) : [];
  const analyzedImages = Array.isArray(imgObj.images)
    ? (imgObj.images as Array<Record<string, unknown>>)
    : [];

  const images = [
    // First, analyzed images (have descriptions, use_cases)
    ...analyzedImages.map((img) => ({
      source_url: (img.imageUrl as string) || null,
      s3_url: null,
      description: (img.description as string) || null,
      use_case: (img.useCase as string) || (img["use-case"] as string) || null,
      resolution: (img.resolution as string) || null,
      is_logo: (img.isLogo as boolean) || false,
      usability_rank: (img.usabilityRank as number) ?? null,
    })),
    // Then, GBP images that aren't already in analyzed set (by URL)
    ...gbpImageUrls
      .filter((url) => !analyzedImages.some((a) => a.imageUrl === url))
      .map((url) => ({
        source_url: url,
        s3_url: null,
        description: null,
        use_case: null,
        resolution: null,
        is_logo: false,
        usability_rank: null,
      })),
  ];

  // Discovered pages from website scrape
  const pages = webObj.pages as Record<string, string> | undefined;
  const discoveredPages = pages
    ? Object.entries(pages).map(([key, content]) => ({
        url: key === "home" ? (webObj.baseUrl as string) || null : key,
        title: key,
        content_excerpt: typeof content === "string" ? content.slice(0, 500) : null,
      }))
    : [];

  // Raw inputs — cap to 50KB per source
  const capString = (s: string | null | undefined, max = 50000): string | null => {
    if (!s) return null;
    return s.length > max ? s.slice(0, max) : s;
  };

  const scrapedPagesRaw = pages
    ? Object.fromEntries(
        Object.entries(pages).map(([k, v]) => [
          k,
          capString(typeof v === "string" ? v : JSON.stringify(v)),
        ]),
      )
    : {};

  const gbpRaw = gbp
    ? JSON.parse(capString(JSON.stringify(gbp)) || "null")
    : null;

  // Reviews: extract recent reviews for review_themes / featured_testimonials
  const rawReviews = Array.isArray(gbpObj.recentReviews) || Array.isArray(gbpObj.reviews)
    ? ((gbpObj.recentReviews || gbpObj.reviews) as Array<Record<string, unknown>>)
    : [];

  const featuredTestimonials = rawReviews
    .filter((r) => ((r.stars as number) || (r.rating as number) || 0) >= 4)
    .slice(0, 5)
    .map((r) => ({
      author: (r.name as string) || (r.author as string) || null,
      rating: (r.stars as number) || (r.rating as number) || null,
      text: (r.text as string) || null,
    }));

  return {
    version: 1,
    warmed_up_at: project.updated_at instanceof Date ? project.updated_at.toISOString() : project.updated_at,
    last_updated_at: project.updated_at instanceof Date ? project.updated_at.toISOString() : project.updated_at,
    sources_used: {
      gbp: project.selected_place_id
        ? {
            place_id: project.selected_place_id,
            scraped_at:
              project.updated_at instanceof Date
                ? project.updated_at.toISOString()
                : project.updated_at,
          }
        : null,
      urls: project.selected_website_url
        ? [
            {
              url: project.selected_website_url,
              scraped_at:
                project.updated_at instanceof Date
                  ? project.updated_at.toISOString()
                  : project.updated_at,
              char_length: null,
            },
          ]
        : [],
      text_inputs: [],
    },
    business,
    brand,
    voice_and_tone: {
      archetype: null,
      tone_descriptor: null,
      voice_samples: [],
    },
    content_essentials: {
      unique_value_proposition: null,
      founding_story: null,
      core_values: [],
      certifications: [],
      service_areas: [],
      social_links: {},
      review_themes: [],
      featured_testimonials: featuredTestimonials,
    },
    extracted_assets: {
      images,
      discovered_pages: discoveredPages,
    },
    raw_inputs: {
      gbp_raw: gbpRaw,
      scraped_pages_raw: scrapedPagesRaw,
      user_text_inputs: [],
    },
  };
}
