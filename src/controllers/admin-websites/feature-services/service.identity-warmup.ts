/**
 * Identity Warmup Pipeline Service
 *
 * Runs the end-to-end enrichment that builds a project's `project_identity`:
 *   1. GBP scrape (optional, via Apify)
 *   2. Multi-URL website scrape (token-conservative cleaning)
 *   3. User-provided text inputs
 *   4. Image collection (GBP + scraped images) → S3 upload → Claude vision analysis
 *   5. Logo download (if provided) → S3 upload → brand.logo_s3_url
 *   6. Archetype classification (1 Claude call)
 *   7. Content distillation (1 Claude call — extracts UVP, values, certifications, etc.)
 *   8. Assembles project_identity JSONB and writes to project row
 *
 * Admin-triggered, not automatic. Brand colors (primary/accent/gradient) are
 * mirrored to legacy project columns for backward compatibility with ~14
 * downstream consumers.
 */

import axios from "axios";
import { db } from "../../../database/connection";
import { runAgent } from "../../../agents/service.llm-runner";
import { loadPrompt } from "../../../agents/service.prompt-loader";
import { uploadToS3 } from "../../../utils/core/s3";
import {
  buildMediaS3Key,
  buildS3Url,
} from "../../admin-media/feature-utils/util.s3-helpers";
import { scrapeUrl, type ScrapeStrategy } from "./service.url-scrape-strategies";
import { scrapeGbp } from "../feature-utils/util.gbp-scraper";
import {
  processImages,
  collectImageUrls,
  type ImageAnalysisResult,
} from "../feature-utils/util.image-processor";

const PROJECTS_TABLE = "website_builder.projects";

const MAX_SOURCE_CHARS = 50_000;
const LOG_PREFIX = "[IdentityWarmup]";

function log(msg: string, data?: Record<string, unknown>): void {
  console.log(`${LOG_PREFIX} ${msg}`, data ? JSON.stringify(data) : "");
}

function checkCancel(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Warmup cancelled");
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WarmupUrlInput {
  url: string;
  strategy?: ScrapeStrategy;
}

export interface WarmupInputs {
  placeId?: string;
  practiceSearchString?: string;
  /**
   * Accepts either a plain URL string (defaults to "fetch" strategy) or an
   * object specifying the per-URL scrape strategy. Backward-compatible.
   */
  urls?: Array<string | WarmupUrlInput>;
  texts?: Array<{ label?: string; text: string }>;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  gradient?: {
    enabled: boolean;
    from?: string;
    to?: string;
    direction?: string;
    text_color?: "white" | "dark";
    preset?: GradientPreset;
  };
}

export type GradientPreset =
  | "smooth"
  | "lean-primary"
  | "lean-accent"
  | "soft-lean-primary"
  | "soft-lean-accent"
  | "warm-middle"
  | "quick-transition"
  | "long-transition";

interface IdentityBusiness {
  name: string | null;
  category: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  hours: unknown | null;
  rating: number | null;
  review_count: number | null;
  website_url: string | null;
  place_id: string | null;
}

interface IdentityBrand {
  primary_color: string | null;
  accent_color: string | null;
  gradient_enabled: boolean;
  gradient_from: string | null;
  gradient_to: string | null;
  gradient_direction: string;
  gradient_text_color: "white" | "dark" | null;
  gradient_preset: GradientPreset | null;
  logo_s3_url: string | null;
  logo_alt_text: string | null;
  fonts: { heading: string; body: string };
}

// ---------------------------------------------------------------------------
// PUBLIC: runIdentityWarmup
// ---------------------------------------------------------------------------

export async function runIdentityWarmup(
  projectId: string,
  inputs: WarmupInputs,
  signal?: AbortSignal,
): Promise<void> {
  log("Starting warmup", { projectId });

  // Set status running (column added by Plan A T1? Actually no — warmup_status
  // would be on project_identity itself. For polling, we track status inline
  // in project_identity.meta. Read current first.)
  await updateWarmupStatus(projectId, "running");

  try {
    checkCancel(signal);

    // --- 1. GBP scrape ---
    let gbpData: any = null;
    if (inputs.placeId) {
      try {
        gbpData = await scrapeGbp(inputs.placeId, inputs.practiceSearchString, signal);
        log("GBP scrape complete", { placeId: inputs.placeId });
      } catch (err: any) {
        log("GBP scrape failed — continuing", { error: err.message });
      }
    }

    checkCancel(signal);

    // --- 2. Multi-URL website scrape ---
    const scrapedPagesRaw: Record<string, string> = {};
    const scrapedImages: string[] = [];
    const discoveredPages: Array<{
      url: string;
      title: string | null;
      content_excerpt: string | null;
    }> = [];

    if (inputs.urls && inputs.urls.length > 0) {
      const normalizedUrls: WarmupUrlInput[] = inputs.urls.map((u) =>
        typeof u === "string" ? { url: u, strategy: "fetch" } : u,
      );
      for (let i = 0; i < normalizedUrls.length; i++) {
        checkCancel(signal);
        const { url, strategy } = normalizedUrls[i];
        const strat: ScrapeStrategy = strategy || "fetch";
        log(`Scraping url ${i + 1}/${normalizedUrls.length}`, { url, strategy: strat });
        try {
          const result = await scrapeUrl(url, strat);
          if (result.pages && Object.keys(result.pages).length > 0) {
            for (const [key, content] of Object.entries(result.pages)) {
              const cleaned = cleanForClaude(String(content));
              const cappedRaw = capString(String(content));
              scrapedPagesRaw[`${url}#${key}`] = cappedRaw;
              discoveredPages.push({
                url: key === "home" ? url : `${url}#${key}`,
                title: key,
                content_excerpt: cleaned.slice(0, 500),
              });
            }
          }
          if (Array.isArray(result.images)) {
            scrapedImages.push(...result.images);
          }
          if (result.was_blocked) {
            log("URL was blocked despite strategy fallback", { url, strategy: strat });
          }
        } catch (err: any) {
          log("Website scrape failed", { url, error: err.message });
        }
      }
    }

    checkCancel(signal);

    // --- 3. Text inputs (normalize + cap) ---
    const userTextInputs = (inputs.texts || []).map((t) => ({
      label: t.label || "user_note",
      text: capString(t.text),
    }));

    // --- 4. Image collection + S3 upload + Claude vision analysis ---
    const imageUrls = collectImageUrls(gbpData, { images: scrapedImages });
    let analyzedImages: ImageAnalysisResult[] = [];
    if (imageUrls.length > 0) {
      analyzedImages = await processImages(projectId, imageUrls, signal);
      log("Image analysis complete", { count: analyzedImages.length });
    }

    checkCancel(signal);

    // --- 5. Logo download (if provided) ---
    let logoS3Url: string | null = null;
    if (inputs.logoUrl) {
      try {
        logoS3Url = await downloadAndHostLogo(projectId, inputs.logoUrl, signal);
        log("Logo hosted", { logoS3Url });
      } catch (err: any) {
        log("Logo download failed — continuing without", { error: err.message });
      }
    } else {
      // Fallback: pick the highest-ranked is_logo image from analysis
      const logoCandidate = analyzedImages.find((img) => img.is_logo);
      if (logoCandidate?.s3_url) {
        logoS3Url = logoCandidate.s3_url;
        log("Logo auto-detected from image analysis", { logoS3Url });
      }
    }

    checkCancel(signal);

    // --- 6. Archetype classification ---
    const archetypeResult = await classifyArchetype(gbpData, scrapedPagesRaw);
    log("Archetype classified", {
      archetype: archetypeResult.archetype,
    });

    checkCancel(signal);

    // --- 7. Content distillation ---
    const distilled = await distillContent(
      scrapedPagesRaw,
      userTextInputs,
      gbpData,
    );
    log("Content distilled", {
      certifications: distilled.certifications?.length || 0,
      testimonials: distilled.featured_testimonials?.length || 0,
    });

    // --- 8. Build identity + persist ---
    const business = buildBusinessFromGbp(gbpData, inputs.placeId);
    const brand = buildBrand(inputs, business.name, logoS3Url);

    const identity = {
      version: 1,
      warmed_up_at: new Date().toISOString(),
      last_updated_at: new Date().toISOString(),
      sources_used: {
        gbp: inputs.placeId
          ? { place_id: inputs.placeId, scraped_at: new Date().toISOString() }
          : null,
        urls: (inputs.urls || []).map((url) => ({
          url,
          scraped_at: new Date().toISOString(),
          char_length: Object.entries(scrapedPagesRaw)
            .filter(([k]) => k.startsWith(`${url}#`))
            .reduce((sum, [, content]) => sum + content.length, 0),
        })),
        text_inputs: userTextInputs.map((t) => ({
          label: t.label,
          char_length: (t.text || "").length,
        })),
      },
      business,
      brand,
      voice_and_tone: {
        archetype: archetypeResult.archetype,
        tone_descriptor: archetypeResult.tone_descriptor,
        voice_samples: archetypeResult.voice_samples || [],
      },
      content_essentials: {
        unique_value_proposition: distilled.unique_value_proposition || null,
        founding_story: distilled.founding_story || null,
        core_values: distilled.core_values || [],
        certifications: distilled.certifications || [],
        service_areas: distilled.service_areas || [],
        social_links: distilled.social_links || {},
        review_themes: distilled.review_themes || [],
        featured_testimonials: distilled.featured_testimonials || [],
      },
      extracted_assets: {
        images: analyzedImages,
        discovered_pages: discoveredPages,
      },
      raw_inputs: {
        gbp_raw: gbpData ? JSON.parse(capString(JSON.stringify(gbpData))) : null,
        scraped_pages_raw: scrapedPagesRaw,
        user_text_inputs: userTextInputs,
      },
      meta: {
        warmup_status: "ready",
      },
    };

    // Write to project + mirror colors/logo to legacy columns
    await db(PROJECTS_TABLE)
      .where("id", projectId)
      .update({
        project_identity: JSON.stringify(identity),
        primary_color: brand.primary_color,
        accent_color: brand.accent_color,
        updated_at: db.fn.now(),
      });

    log("Warmup complete", { projectId });
  } catch (err: any) {
    log("Warmup failed", { projectId, error: err.message });
    await updateWarmupStatus(projectId, "failed");
    throw err;
  }
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

async function updateWarmupStatus(
  projectId: string,
  status: "queued" | "running" | "ready" | "failed",
): Promise<void> {
  // Stored on project_identity.meta.warmup_status — update or create minimal
  // identity shell if no identity exists yet.
  const project = await db(PROJECTS_TABLE)
    .where("id", projectId)
    .select("project_identity")
    .first();

  const existing = safeJsonParse(project?.project_identity);

  if (existing) {
    existing.meta = { ...(existing.meta || {}), warmup_status: status };
    existing.last_updated_at = new Date().toISOString();
    await db(PROJECTS_TABLE).where("id", projectId).update({
      project_identity: JSON.stringify(existing),
      updated_at: db.fn.now(),
    });
  } else {
    const shell = {
      version: 1,
      meta: { warmup_status: status },
      last_updated_at: new Date().toISOString(),
    };
    await db(PROJECTS_TABLE).where("id", projectId).update({
      project_identity: JSON.stringify(shell),
      updated_at: db.fn.now(),
    });
  }
}

function safeJsonParse(value: unknown): any {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

function capString(s: string, max: number = MAX_SOURCE_CHARS): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Token-conservative cleaner for scraped HTML. Strips scripts, styles, tags,
 * special characters, and URLs before the content is fed to Claude.
 */
function cleanForClaude(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-zA-Z0-9#]+;/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-zA-Z0-9.,!?'\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildBusinessFromGbp(
  gbpData: any,
  fallbackPlaceId: string | undefined,
): IdentityBusiness {
  const g = gbpData || {};
  return {
    name: g.title || g.name || null,
    category: g.categoryName || g.category || null,
    phone: g.phone || null,
    address: g.address || null,
    city: g.city || null,
    state: g.state || null,
    zip: g.postalCode || null,
    hours: g.openingHours || null,
    rating: g.totalScore ?? g.rating ?? null,
    review_count: g.reviewsCount ?? g.reviewCount ?? null,
    website_url: g.website || null,
    place_id: fallbackPlaceId || g.placeId || null,
  };
}

function buildBrand(
  inputs: WarmupInputs,
  businessName: string | null,
  logoS3Url: string | null,
): IdentityBrand {
  return {
    primary_color: inputs.primaryColor || null,
    accent_color: inputs.accentColor || null,
    gradient_enabled: inputs.gradient?.enabled ?? false,
    gradient_from: inputs.gradient?.from || null,
    gradient_to: inputs.gradient?.to || null,
    gradient_direction: inputs.gradient?.direction || "to-br",
    gradient_text_color: inputs.gradient?.enabled
      ? inputs.gradient?.text_color || "white"
      : null,
    gradient_preset: inputs.gradient?.enabled
      ? inputs.gradient?.preset || "smooth"
      : null,
    logo_s3_url: logoS3Url,
    logo_alt_text: businessName ? `${businessName} Logo` : null,
    fonts: { heading: "serif", body: "sans" },
  };
}

async function downloadAndHostLogo(
  projectId: string,
  logoUrl: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await axios.get(logoUrl, {
    responseType: "arraybuffer",
    timeout: 15000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "image/*",
    },
    signal,
  });

  const buffer = Buffer.from(response.data);
  const contentType = response.headers["content-type"] || "image/png";
  const ext = contentType.includes("svg")
    ? "svg"
    : contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";
  const filename = `logo-${Date.now()}.${ext}`;
  const s3Key = buildMediaS3Key(projectId, filename);

  await uploadToS3(s3Key, buffer, contentType);
  return buildS3Url(s3Key);
}

// ---------------------------------------------------------------------------
// ARCHETYPE CLASSIFICATION
// ---------------------------------------------------------------------------

async function classifyArchetype(
  gbpData: any,
  scrapedPagesRaw: Record<string, string>,
): Promise<{
  archetype: string;
  tone_descriptor: string;
  voice_samples: string[];
}> {
  const prompt = loadPrompt("websiteAgents/builder/ArchetypeClassifier");

  // Build a compact input — GBP category + top reviews + a bit of website content
  const parts: string[] = [];

  if (gbpData?.categoryName) {
    parts.push(`## GBP Category\n${gbpData.categoryName}`);
  }

  const reviews = Array.isArray(gbpData?.reviews)
    ? gbpData.reviews.slice(0, 5)
    : Array.isArray(gbpData?.recentReviews)
      ? gbpData.recentReviews.slice(0, 5)
      : [];
  if (reviews.length > 0) {
    parts.push(
      `## Top Reviews\n${reviews
        .map(
          (r: any) =>
            `- (${r.stars || r.rating}⭐) ${(r.text || "").slice(0, 300)}`,
        )
        .join("\n")}`,
    );
  }

  if (gbpData?.description) {
    parts.push(`## Business Description\n${String(gbpData.description).slice(0, 500)}`);
  }

  // A small amount of website content (first 2000 chars of first scraped page)
  const firstPage = Object.values(scrapedPagesRaw)[0];
  if (firstPage) {
    parts.push(
      `## Website Excerpt\n${cleanForClaude(firstPage).slice(0, 2000)}`,
    );
  }

  if (parts.length === 0) {
    return {
      archetype: "family-friendly",
      tone_descriptor: "warm, professional, approachable",
      voice_samples: [],
    };
  }

  try {
    const result = await runAgent({
      systemPrompt: prompt,
      userMessage: parts.join("\n\n"),
      prefill: "{",
      maxTokens: 1024,
    });

    if (result.parsed) {
      return {
        archetype: result.parsed.archetype || "family-friendly",
        tone_descriptor: result.parsed.tone_descriptor || "warm, professional",
        voice_samples: Array.isArray(result.parsed.voice_samples)
          ? result.parsed.voice_samples
          : [],
      };
    }
  } catch (err: any) {
    log("Archetype classification failed — using default", { error: err.message });
  }

  return {
    archetype: "family-friendly",
    tone_descriptor: "warm, professional, approachable",
    voice_samples: [],
  };
}

// ---------------------------------------------------------------------------
// CONTENT DISTILLATION
// ---------------------------------------------------------------------------

async function distillContent(
  scrapedPagesRaw: Record<string, string>,
  userTexts: Array<{ label?: string; text: string }>,
  gbpData: any,
): Promise<{
  unique_value_proposition?: string | null;
  founding_story?: string | null;
  core_values?: string[];
  certifications?: string[];
  service_areas?: string[];
  social_links?: Record<string, string | null>;
  review_themes?: string[];
  featured_testimonials?: Array<{ author: string | null; rating: number | null; text: string | null }>;
}> {
  const prompt = loadPrompt("websiteAgents/builder/IdentityDistiller");

  const parts: string[] = [];

  if (Object.keys(scrapedPagesRaw).length > 0) {
    const pagesText = Object.entries(scrapedPagesRaw)
      .map(([key, content]) => {
        const cleaned = cleanForClaude(content).slice(0, 8000);
        return `### ${key}\n${cleaned}`;
      })
      .join("\n\n");
    parts.push(`## Website Content\n\n${pagesText}`);
  }

  if (userTexts.length > 0) {
    parts.push(
      `## Admin-Provided Notes\n\n${userTexts
        .map((t) => `### ${t.label}\n${t.text}`)
        .join("\n\n")}`,
    );
  }

  if (gbpData) {
    const reviews = Array.isArray(gbpData.reviews)
      ? gbpData.reviews.slice(0, 10)
      : Array.isArray(gbpData.recentReviews)
        ? gbpData.recentReviews.slice(0, 10)
        : [];
    if (reviews.length > 0) {
      parts.push(
        `## GBP Reviews (for themes + testimonials)\n\n${reviews
          .map(
            (r: any) =>
              `- ${r.name || "Anonymous"} (${r.stars || r.rating}⭐): ${(r.text || "").slice(0, 500)}`,
          )
          .join("\n")}`,
      );
    }
  }

  if (parts.length === 0) {
    return {};
  }

  try {
    const result = await runAgent({
      systemPrompt: prompt,
      userMessage: parts.join("\n\n"),
      prefill: "{",
      maxTokens: 4096,
    });

    if (result.parsed) {
      return result.parsed;
    }
  } catch (err: any) {
    log("Content distillation failed — using empty", { error: err.message });
  }

  return {};
}
