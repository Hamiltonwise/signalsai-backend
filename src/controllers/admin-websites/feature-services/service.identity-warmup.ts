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
import { runAgent, type CostContext } from "../../../agents/service.llm-runner";
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
    const archetypeResult = await classifyArchetype(gbpData, scrapedPagesRaw, {
      projectId,
      eventType: "warmup",
      metadata: { stage: "archetype-classify" },
    });
    log("Archetype classified", {
      archetype: archetypeResult.archetype,
    });

    checkCancel(signal);

    // --- 7. Content distillation ---
    const discoveredPageUrls = discoveredPages
      .map((p) => p.url)
      .filter((u): u is string => typeof u === "string" && u.length > 0);
    const distilled = await distillContent(
      scrapedPagesRaw,
      userTextInputs,
      gbpData,
      discoveredPageUrls,
      {
        projectId,
        eventType: "warmup",
        metadata: { stage: "content-distill" },
      },
    );
    log("Content distilled", {
      certifications: distilled.certifications?.length || 0,
      testimonials: distilled.featured_testimonials?.length || 0,
      doctors: distilled.doctors?.length || 0,
      services: distilled.services?.length || 0,
    });

    // --- 8. Build identity + persist ---
    const business = buildBusinessFromGbp(gbpData, inputs.placeId);
    const brand = buildBrand(inputs, business.name, logoS3Url);

    // --- 8a. Multi-location sweep ---
    // Read the project's selected_place_ids + primary_place_id. Build a
    // locations[] entry for each (primary reuses the already-scraped gbpData;
    // non-primary runs Apify in parallel with concurrency=3).
    const locations = await buildLocationsArray(
      projectId,
      inputs.placeId,
      gbpData,
      inputs.practiceSearchString,
      signal,
    );
    log("Locations assembled", {
      total: locations.length,
      ready: locations.filter((l) => l.warmup_status === "ready").length,
      failed: locations.filter((l) => l.warmup_status === "failed").length,
    });

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
        doctors: distilled.doctors || [],
        services: distilled.services || [],
      },
      locations,
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

// ---------------------------------------------------------------------------
// MULTI-LOCATION
// ---------------------------------------------------------------------------

interface IdentityLocation {
  place_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  rating: number | null;
  review_count: number | null;
  category: string | null;
  website_url: string | null;
  hours: unknown;
  last_synced_at: string;
  is_primary: boolean;
  warmup_status: "ready" | "failed" | "pending";
  warmup_error?: string;
  stale?: boolean;
}

function buildLocationEntryFromGbp(
  placeId: string,
  gbpData: any,
  isPrimary: boolean,
): IdentityLocation {
  const g = gbpData || {};
  return {
    place_id: placeId,
    name: g.title || g.name || "",
    address: g.address || null,
    phone: g.phone || null,
    rating: (g.totalScore ?? g.rating ?? null) as number | null,
    review_count: (g.reviewsCount ?? g.reviewCount ?? null) as number | null,
    category: g.categoryName || g.category || null,
    website_url: g.website || null,
    hours: g.openingHours || null,
    last_synced_at: new Date().toISOString(),
    is_primary: isPrimary,
    warmup_status: "ready",
  };
}

/**
 * Assemble `identity.locations[]` for the project.
 *
 * The primary entry reuses the already-scraped `gbpData` (no extra Apify
 * call). Non-primary entries are scraped in parallel with a concurrency
 * limit of 3. On per-location Apify errors the entry is still written with
 * warmup_status = "failed" + stale=true so the UI can surface a retry path.
 */
async function buildLocationsArray(
  projectId: string,
  primaryPlaceIdFromInputs: string | undefined,
  primaryGbpData: any,
  practiceSearchString: string | undefined,
  signal: AbortSignal | undefined,
): Promise<IdentityLocation[]> {
  const project = await db(PROJECTS_TABLE)
    .where("id", projectId)
    .select("selected_place_ids", "primary_place_id", "selected_place_id")
    .first();

  const rawIds = Array.isArray(project?.selected_place_ids)
    ? (project.selected_place_ids as string[])
    : [];
  const fallbackPrimary =
    project?.primary_place_id ||
    primaryPlaceIdFromInputs ||
    project?.selected_place_id ||
    null;

  // Normalize: if selected_place_ids is empty, fall back to [primary].
  let allIds: string[] = rawIds.filter((id): id is string => typeof id === "string" && id.length > 0);
  if (allIds.length === 0 && fallbackPrimary) {
    allIds = [fallbackPrimary];
  }
  if (allIds.length === 0) {
    // No place_ids anywhere — return empty locations array.
    return [];
  }

  // De-dupe while preserving order.
  const seen = new Set<string>();
  allIds = allIds.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const primaryId = fallbackPrimary && allIds.includes(fallbackPrimary)
    ? fallbackPrimary
    : allIds[0];

  const results: Array<IdentityLocation | null> = new Array(allIds.length).fill(null);

  // Primary slot: reuse the already-scraped GBP data we got during step 1 if
  // it's for the primary place. If no GBP scrape happened (no placeId passed
  // to warmup inputs, or it failed), we still emit a pending-ish entry so the
  // array isn't empty.
  for (let i = 0; i < allIds.length; i++) {
    const id = allIds[i];
    if (id !== primaryId) continue;
    if (primaryGbpData) {
      results[i] = buildLocationEntryFromGbp(id, primaryGbpData, true);
    } else {
      // We couldn't scrape the primary (warmup ran without a placeId, or the
      // scrape failed). Mark the entry pending so the UI shows it needs a
      // retry; do not throw — warmup overall still succeeded on other signals.
      results[i] = {
        place_id: id,
        name: "",
        address: null,
        phone: null,
        rating: null,
        review_count: null,
        category: null,
        website_url: null,
        hours: null,
        last_synced_at: new Date().toISOString(),
        is_primary: true,
        warmup_status: "failed",
        warmup_error: "Primary GBP scrape did not return data",
        stale: true,
      };
    }
  }

  // Non-primary slots: scrape in parallel, concurrency 3.
  const secondaryIndices = allIds
    .map((id, i) => ({ id, i }))
    .filter(({ id }) => id !== primaryId);

  await runWithConcurrency(secondaryIndices, 3, async ({ id, i }) => {
    try {
      const scraped = await scrapeGbp(id, practiceSearchString, signal);
      if (!scraped) {
        results[i] = {
          place_id: id,
          name: "",
          address: null,
          phone: null,
          rating: null,
          review_count: null,
          category: null,
          website_url: null,
          hours: null,
          last_synced_at: new Date().toISOString(),
          is_primary: false,
          warmup_status: "failed",
          warmup_error: "No GBP data returned for place_id",
          stale: true,
        };
        return;
      }
      results[i] = buildLocationEntryFromGbp(id, scraped, false);
    } catch (err: any) {
      log("Location scrape failed", { placeId: id, error: err?.message });
      results[i] = {
        place_id: id,
        name: "",
        address: null,
        phone: null,
        rating: null,
        review_count: null,
        category: null,
        website_url: null,
        hours: null,
        last_synced_at: new Date().toISOString(),
        is_primary: false,
        warmup_status: "failed",
        warmup_error: err?.message || "Unknown Apify error",
        stale: true,
      };
    }
  });

  return results.filter((r): r is IdentityLocation => r !== null);
}

/**
 * Simple concurrency limiter. Runs `worker` over `items` with at most
 * `limit` promises in flight at any time. Preserves error-swallowing
 * responsibility to the worker — this helper never throws.
 */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const queue = [...items];
  const runners: Promise<void>[] = [];
  for (let i = 0; i < Math.min(limit, queue.length); i++) {
    runners.push(
      (async () => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (next === undefined) return;
          await worker(next);
        }
      })(),
    );
  }
  await Promise.all(runners);
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
  costContext?: CostContext,
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
      costContext,
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

interface DoctorOrServiceEntry {
  name: string;
  source_url: string | null;
  short_blurb: string | null;
  last_synced_at: string;
  stale?: boolean;
}

interface DistilledContent {
  unique_value_proposition?: string | null;
  founding_story?: string | null;
  core_values?: string[];
  certifications?: string[];
  service_areas?: string[];
  social_links?: Record<string, string | null>;
  review_themes?: string[];
  featured_testimonials?: Array<{ author: string | null; rating: number | null; text: string | null }>;
  doctors?: DoctorOrServiceEntry[];
  services?: DoctorOrServiceEntry[];
}

async function distillContent(
  scrapedPagesRaw: Record<string, string>,
  userTexts: Array<{ label?: string; text: string }>,
  gbpData: any,
  discoveredPageUrls: string[],
  costContext?: CostContext,
): Promise<DistilledContent> {
  const prompt = loadPrompt("websiteAgents/builder/IdentityDistiller");

  const parts: string[] = [];

  if (discoveredPageUrls.length > 0) {
    parts.push(
      `## DISCOVERED PAGES (use ONLY these exact URLs for doctors[].source_url and services[].source_url)\n\n${discoveredPageUrls.map((u) => `- ${u}`).join("\n")}`,
    );
  }

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
      costContext,
    });

    if (result.parsed) {
      return normalizeDistilled(result.parsed, discoveredPageUrls);
    }
  } catch (err: any) {
    log("Content distillation failed — using empty", { error: err.message });
  }

  return {};
}

const MAX_DOCTORS_SERVICES = 100;
const MAX_BLURB_CHARS = 400;

/**
 * Clamp list shapes + enforce source_url discipline. The LLM is instructed to
 * only emit discovered-pages URLs, but we defend at the boundary.
 */
function normalizeDistilled(
  raw: any,
  discoveredPageUrls: string[],
): DistilledContent {
  const allowedUrls = new Set(discoveredPageUrls);
  const now = new Date().toISOString();

  const doctors = Array.isArray(raw?.doctors)
    ? raw.doctors
        .slice(0, MAX_DOCTORS_SERVICES)
        .map((d: any) => normalizeListEntry(d, allowedUrls, now))
        .filter((d: DoctorOrServiceEntry | null): d is DoctorOrServiceEntry => d !== null)
    : [];

  const services = Array.isArray(raw?.services)
    ? raw.services
        .slice(0, MAX_DOCTORS_SERVICES)
        .map((s: any) => normalizeListEntry(s, allowedUrls, now))
        .filter((s: DoctorOrServiceEntry | null): s is DoctorOrServiceEntry => s !== null)
    : [];

  return {
    unique_value_proposition: raw?.unique_value_proposition ?? null,
    founding_story: raw?.founding_story ?? null,
    core_values: Array.isArray(raw?.core_values) ? raw.core_values : [],
    certifications: Array.isArray(raw?.certifications) ? raw.certifications : [],
    service_areas: Array.isArray(raw?.service_areas) ? raw.service_areas : [],
    social_links: raw?.social_links && typeof raw.social_links === "object" ? raw.social_links : {},
    review_themes: Array.isArray(raw?.review_themes) ? raw.review_themes : [],
    featured_testimonials: Array.isArray(raw?.featured_testimonials)
      ? raw.featured_testimonials
      : [],
    doctors,
    services,
  };
}

function normalizeListEntry(
  entry: any,
  allowedUrls: Set<string>,
  isoNow: string,
): DoctorOrServiceEntry | null {
  if (!entry || typeof entry !== "object") return null;
  const name = typeof entry.name === "string" ? entry.name.trim() : "";
  if (!name) return null;

  const rawUrl = typeof entry.source_url === "string" ? entry.source_url.trim() : null;
  // Null if LLM hallucinated a URL not in the discovered set.
  const source_url = rawUrl && allowedUrls.has(rawUrl) ? rawUrl : null;

  const rawBlurb = typeof entry.short_blurb === "string" ? entry.short_blurb.trim() : null;
  const short_blurb = rawBlurb ? rawBlurb.slice(0, MAX_BLURB_CHARS) : null;

  return {
    name,
    source_url,
    short_blurb,
    last_synced_at: isoNow,
  };
}

/**
 * T5/T6 shared entry point: runs the distillation against already-scraped
 * pages (from `identity.extracted_assets.discovered_pages` + a resurrected
 * scraped_pages_raw map). Used by the re-sync endpoint to re-extract
 * doctors/services WITHOUT re-scraping the site.
 */
export async function extractDoctorsAndServices(
  scrapedPagesRaw: Record<string, string>,
  userTexts: Array<{ label?: string; text: string }>,
  gbpData: any,
  discoveredPageUrls: string[],
  costContext?: CostContext,
): Promise<{ doctors: DoctorOrServiceEntry[]; services: DoctorOrServiceEntry[] }> {
  const distilled = await distillContent(
    scrapedPagesRaw,
    userTexts,
    gbpData,
    discoveredPageUrls,
    costContext,
  );
  return {
    doctors: distilled.doctors || [],
    services: distilled.services || [],
  };
}
