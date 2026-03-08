/**
 * SEO Generation Service
 *
 * AI-powered SEO content generation using Claude Sonnet 4.6.
 * Generates meta tags, descriptions, schema markup section by section.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "../../../database/connection";
import { LocationModel } from "../../../models/LocationModel";
import { OrganizationModel } from "../../../models/OrganizationModel";

const PAGES_TABLE = "website_builder.pages";
const POSTS_TABLE = "website_builder.posts";
const PROJECTS_TABLE = "website_builder.projects";

const MODEL = "claude-sonnet-4-6-20250514";
const MAX_TOKENS = 4096;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

type SeoSection =
  | "critical"
  | "high_impact"
  | "significant"
  | "moderate"
  | "negligible";

interface GenerateRequest {
  section: SeoSection;
  location_context: string | null; // location_id or "organization"
  page_content: string;
  homepage_content?: string;
  header_html?: string;
  footer_html?: string;
  wrapper_html?: string;
  existing_seo_data?: Record<string, unknown>;
  all_page_titles?: string[];
  all_page_descriptions?: string[];
  page_path?: string;
  post_title?: string;
}

export async function generateSeoForSection(
  projectId: string,
  entityId: string,
  entityType: "page" | "post",
  body: GenerateRequest
): Promise<{ section: string; generated: Record<string, unknown> }> {
  const {
    section,
    location_context,
    page_content,
    homepage_content,
    header_html,
    footer_html,
    wrapper_html,
    existing_seo_data,
    all_page_titles,
    all_page_descriptions,
    page_path,
    post_title,
  } = body;

  // Fetch business data based on location context
  const businessData = await fetchBusinessData(projectId, location_context);

  if (!businessData) {
    throw new Error(
      "Business data not found. Refresh business data in Settings > Integrations first."
    );
  }

  // Build section-specific prompt
  const systemPrompt = buildSystemPrompt(section, businessData);
  const userPrompt = buildUserPrompt(section, {
    page_content,
    homepage_content,
    header_html,
    footer_html,
    wrapper_html,
    existing_seo_data,
    all_page_titles,
    all_page_descriptions,
    page_path,
    post_title,
    entityType,
  });

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  // Parse response
  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const generated = parseGeneratedSeo(text, section);

  return { section, generated };
}

// ---------------------------------------------------------------------------
// Business data fetching
// ---------------------------------------------------------------------------

async function fetchBusinessData(
  projectId: string,
  locationContext: string | null
): Promise<Record<string, unknown> | null> {
  // Get project's organization
  const project = await db(PROJECTS_TABLE)
    .where({ id: projectId })
    .select("organization_id")
    .first();
  if (!project?.organization_id) return null;

  const orgId = project.organization_id;
  const org = await OrganizationModel.findById(orgId);
  if (!org) return null;

  const orgData = (org.business_data as Record<string, unknown>) || {};

  if (locationContext && locationContext !== "organization") {
    const locationId = parseInt(locationContext, 10);
    if (!isNaN(locationId)) {
      const location = await LocationModel.findById(locationId);
      if (location?.business_data) {
        return {
          type: "location",
          organization: orgData,
          location: location.business_data as Record<string, unknown>,
          location_name: location.name,
        };
      }
    }
  }

  // Fallback to org-level or primary location
  const locations = await LocationModel.findByOrganizationId(orgId);
  const primaryLoc = locations.find((l) => l.is_primary) || locations[0];

  if (primaryLoc?.business_data) {
    return {
      type: "organization",
      organization: orgData,
      location: primaryLoc.business_data as Record<string, unknown>,
      location_name: primaryLoc.name,
    };
  }

  // At minimum, return org data if it exists
  if (Object.keys(orgData).length > 0) {
    return { type: "organization", organization: orgData, location: null };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildSystemPrompt(
  section: SeoSection,
  businessData: Record<string, unknown>
): string {
  const base = `You are an expert SEO specialist. Generate optimized SEO metadata based on the page content and business data provided.

BUSINESS DATA:
${JSON.stringify(businessData, null, 2)}

RULES:
- Return ONLY valid JSON. No markdown, no explanation, no code fences.
- Every generated field must be unique across the site (avoid duplicating existing titles/descriptions).
- Use the business name, location, and specialties naturally in the content.
- Be specific and actionable — avoid generic filler.`;

  const sectionInstructions: Record<SeoSection, string> = {
    critical: `
SECTION: Critical — Page Title & Canonical (30 points)

Generate:
- "meta_title": Page title with main keyword + city/state. Between 50-60 characters. Must be unique.
- "canonical_url": The canonical URL path for this page (usually the page path itself).
- "robots": Indexing directive. Use "index, follow" unless this is a thank-you/success page.

The title MUST include the primary service/topic keyword and the city/state from the business data.`,

    high_impact: `
SECTION: High Impact — Search Snippet & Click-Through (25 points)

Generate:
- "meta_description": Between 140-160 characters. Must include:
  1. A clear call-to-action ("Book today", "Call now", "Schedule a free consult")
  2. A trust signal ("5-star rated", "Serving [City] since [year]", "[X]+ happy patients")
  Must be unique across all pages.
- "max_image_preview": Always set to "large".`,

    significant: `
SECTION: Significant — Structured Data / Schema (22 points)

Generate:
- "schema_json": An array of JSON-LD schema objects appropriate for this page:
  - If this is a location/home page: include LocalBusiness schema with address, hours, phone, coordinates from business data.
  - If this page has FAQ-like content (Q&A patterns): include FAQPage schema.
  - If this is a service page: include Service schema.
  - Always include BreadcrumbList schema.
  - If this is the homepage: include Organization schema with social profiles.

Each schema object must be complete and valid per schema.org specifications. Use real data from the business data provided.`,

    moderate: `
SECTION: Moderate — Social Share & Image Preview (13 points)

Generate:
- "og_title": Social share title. Match or improve on the page meta title.
- "og_description": Social share description. Can match meta description or be slightly shorter.
- "og_type": "website" for pages, "article" for blog posts.
- "og_image_recommendation": Describe what the ideal share image should be (we can't generate the actual image, but recommend what to use).`,

    negligible: `
SECTION: Negligible — Basic Housekeeping (3 points)

Generate:
- "og_type": Confirm "website" or "article" based on content type.
- "og_description": Confirm it matches the social share description. If already set, return the same value.`,
  };

  return base + sectionInstructions[section];
}

function buildUserPrompt(
  section: SeoSection,
  data: {
    page_content: string;
    homepage_content?: string;
    header_html?: string;
    footer_html?: string;
    wrapper_html?: string;
    existing_seo_data?: Record<string, unknown>;
    all_page_titles?: string[];
    all_page_descriptions?: string[];
    page_path?: string;
    post_title?: string;
    entityType: "page" | "post";
  }
): string {
  let prompt = `ENTITY TYPE: ${data.entityType}\n`;

  if (data.page_path) prompt += `PAGE PATH: ${data.page_path}\n`;
  if (data.post_title) prompt += `POST TITLE: ${data.post_title}\n`;

  prompt += `\nPAGE CONTENT (the page being optimized):\n${truncate(data.page_content, 8000)}\n`;

  if (data.homepage_content) {
    prompt += `\nHOMEPAGE CONTENT (for context):\n${truncate(data.homepage_content, 4000)}\n`;
  }
  if (data.header_html) {
    prompt += `\nHEADER HTML:\n${truncate(data.header_html, 2000)}\n`;
  }
  if (data.footer_html) {
    prompt += `\nFOOTER HTML:\n${truncate(data.footer_html, 2000)}\n`;
  }

  if (data.existing_seo_data && Object.keys(data.existing_seo_data).length > 0) {
    prompt += `\nEXISTING SEO DATA (for reference, avoid duplicating):\n${JSON.stringify(data.existing_seo_data, null, 2)}\n`;
  }

  if (data.all_page_titles?.length) {
    prompt += `\nEXISTING PAGE TITLES (must be unique from these):\n${data.all_page_titles.join("\n")}\n`;
  }

  if (data.all_page_descriptions?.length) {
    prompt += `\nEXISTING META DESCRIPTIONS (must be unique from these):\n${data.all_page_descriptions.join("\n")}\n`;
  }

  prompt += `\nGenerate the SEO data for the "${section}" section. Return ONLY valid JSON.`;

  return prompt;
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function parseGeneratedSeo(
  text: string,
  section: SeoSection
): Record<string, unknown> {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    console.error(
      `[SEO Generation] Failed to parse response for section "${section}":`,
      cleaned.slice(0, 200)
    );
    return {};
  }
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "\n... (truncated)";
}
