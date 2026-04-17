/**
 * Website Generation Pipeline Service
 *
 * Replaces the n8n Website Builder Workflow with a backend-native pipeline.
 * Two main flows:
 *   1. scrapeAndCacheProject — project-level data collection (Apify + website scrape + image analysis)
 *   2. generatePageComponents — per-page HTML generation (component-by-component via Claude)
 *
 * All LLM calls go through service.llm-runner.ts (Claude Sonnet).
 * All scraping reuses existing services (no HTTP round-trips to own endpoints).
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
import { scrapeWebsite } from "./service.website-scraper";
import { normalizeSections } from "../feature-utils/util.section-normalizer";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECTS_TABLE = "website_builder.projects";
const PAGES_TABLE = "website_builder.pages";
const TEMPLATES_TABLE = "website_builder.templates";
const TEMPLATE_PAGES_TABLE = "website_builder.template_pages";

const APIFY_API_BASE = "https://api.apify.com/v2";
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const GOOGLE_MAPS_ACTOR = "compass~crawler-google-places";

const LOG_PREFIX = "[GenPipeline]";
function log(msg: string, data?: Record<string, unknown>): void {
  console.log(`${LOG_PREFIX} ${msg}`, data ? JSON.stringify(data) : "");
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScrapeParams {
  placeId: string;
  practiceSearchString?: string;
  websiteUrl?: string;
  scrapedData?: string | null;
}

export interface GenerateParams {
  primaryColor?: string;
  accentColor?: string;
  pageContext?: string;
  businessName?: string;
  formattedAddress?: string;
  city?: string;
  state?: string;
  phone?: string;
  category?: string;
  rating?: number;
  reviewCount?: number;
}

// ---------------------------------------------------------------------------
// 1. PROJECT-LEVEL SCRAPE & CACHE
// ---------------------------------------------------------------------------

/**
 * Scrape GBP + website + images and cache results on the project row.
 * This runs ONCE per project, and the cached data is reused by all page generations.
 */
export async function scrapeAndCacheProject(
  projectId: string,
  params: ScrapeParams,
  signal?: AbortSignal,
): Promise<void> {
  const { placeId, practiceSearchString, websiteUrl, scrapedData } = params;

  // --- Step 1: GBP Scrape via Apify ---
  log("Step 1: GBP scrape", { projectId, placeId });
  checkCancel(signal);

  let gbpData: any = null;
  try {
    gbpData = await scrapeGbp(placeId, practiceSearchString, signal);
  } catch (err: any) {
    log("GBP scrape failed, continuing without", { error: err.message });
  }

  await db(PROJECTS_TABLE).where("id", projectId).update({
    step_gbp_scrape: gbpData ? JSON.stringify(gbpData) : null,
    status: "GBP_SCRAPED",
    updated_at: db.fn.now(),
  });

  checkCancel(signal);

  // --- Step 2: Website Scrape ---
  log("Step 2: Website scrape", { projectId, websiteUrl });

  let websiteScrapeData: any = null;
  if (scrapedData) {
    // Pre-scraped data provided — use it directly
    websiteScrapeData = { content: scrapedData };
    log("Using pre-scraped data");
  } else if (websiteUrl) {
    try {
      const scrapeResult = await scrapeWebsite(websiteUrl, undefined);
      if (scrapeResult.result) {
        websiteScrapeData = scrapeResult.result;
      }
    } catch (err: any) {
      log("Website scrape failed, continuing without", { error: err.message });
    }
  }

  await db(PROJECTS_TABLE).where("id", projectId).update({
    step_website_scrape: websiteScrapeData
      ? JSON.stringify(websiteScrapeData)
      : null,
    status: "WEBSITE_SCRAPED",
    updated_at: db.fn.now(),
  });

  checkCancel(signal);

  // --- Step 3: Image Collection, S3 Upload, Analysis ---
  log("Step 3: Image collection + analysis", { projectId });

  const imageUrls = collectImageUrls(gbpData, websiteScrapeData);
  let imageAnalysis: any[] = [];

  if (imageUrls.length > 0) {
    imageAnalysis = await processImages(projectId, imageUrls, signal);
  }

  await db(PROJECTS_TABLE).where("id", projectId).update({
    step_image_analysis: JSON.stringify({ images: imageAnalysis }),
    status: "IMAGES_ANALYZED",
    updated_at: db.fn.now(),
  });

  log("Project scrape complete", {
    projectId,
    gbp: !!gbpData,
    website: !!websiteScrapeData,
    images: imageAnalysis.length,
  });
}

// ---------------------------------------------------------------------------
// 2. PER-PAGE COMPONENT GENERATION
// ---------------------------------------------------------------------------

/**
 * Generate HTML for a single page, component by component.
 * Reads cached project data, calls Claude per component, writes to DB incrementally.
 */
export async function generatePageComponents(
  pageId: string,
  projectId: string,
  generateParams: GenerateParams,
  signal?: AbortSignal,
): Promise<void> {
  // Mark page as generating
  await db(PAGES_TABLE).where("id", pageId).update({
    generation_status: "generating",
    updated_at: db.fn.now(),
  });

  // Read cached project data
  const project = await db(PROJECTS_TABLE).where("id", projectId).first();
  if (!project) throw new Error(`Project ${projectId} not found`);

  const page = await db(PAGES_TABLE).where("id", pageId).first();
  if (!page) throw new Error(`Page ${pageId} not found`);

  const gbpData = safeJsonParse(project.step_gbp_scrape);
  const websiteData = safeJsonParse(project.step_website_scrape);
  const imageAnalysis = safeJsonParse(project.step_image_analysis);

  // Resolve template data
  const templateId = project.template_id;
  const templatePageId = page.template_page_id;

  const template = templateId
    ? await db(TEMPLATES_TABLE).where("id", templateId).first()
    : null;
  const templatePage = templatePageId
    ? await db(TEMPLATE_PAGES_TABLE).where("id", templatePageId).first()
    : null;

  if (!template) {
    await markPageFailed(pageId, "No template found");
    return;
  }

  // --- Step 1: Distill data with Claude ---
  log("Distilling data", { pageId });
  checkCancel(signal);

  let distilledData: any = {};
  try {
    const dataAnalysisPrompt = loadPrompt("websiteAgents/builder/DataAnalysis");
    const userMsg = buildDataAnalysisMessage(gbpData, websiteData);
    const result = await runAgent({
      systemPrompt: dataAnalysisPrompt,
      userMessage: userMsg,
      prefill: "{",
      maxTokens: 8192,
    });
    distilledData = result.parsed || {};
  } catch (err: any) {
    log("Data distillation failed, using raw data", { error: err.message });
  }

  checkCancel(signal);

  // --- Step 2: Build component list ---
  const components = buildComponentList(template, templatePage);
  const totalComponents = components.length;

  log("Generating components", { pageId, total: totalComponents });

  // Initialize progress
  await db(PAGES_TABLE).where("id", pageId).update({
    generation_progress: JSON.stringify({
      total: totalComponents,
      completed: 0,
      current_component: components[0]?.name || "unknown",
    }),
    updated_at: db.fn.now(),
  });

  // --- Step 3: Generate each component ---
  const generatorPrompt = loadPrompt("websiteAgents/builder/ComponentGenerator");
  const isHomepage = page.path === "/";
  const generatedSections: Array<{ name: string; content: string }> = [];

  for (let i = 0; i < components.length; i++) {
    checkCancel(signal);

    const component = components[i];
    log(`Generating: ${component.name} (${i + 1}/${totalComponents})`, { pageId });

    // Update progress: current component
    await db(PAGES_TABLE).where("id", pageId).update({
      generation_progress: JSON.stringify({
        total: totalComponents,
        completed: i,
        current_component: component.name,
      }),
      updated_at: db.fn.now(),
    });

    const userMsg = buildComponentMessage(
      component,
      distilledData,
      imageAnalysis,
      generateParams,
    );

    let html: string | null = null;
    try {
      const result = await runAgent({
        systemPrompt: generatorPrompt,
        userMessage: userMsg,
        prefill: "{",
        maxTokens: 16384,
      });

      const parsed = result.parsed;
      if (parsed && (parsed.html || parsed.content)) {
        html = parsed.html || parsed.content;
      } else {
        // Fallback: use raw output if it looks like HTML
        html = result.raw.trim().startsWith("<") ? result.raw : null;
      }
    } catch (err: any) {
      log(`Component generation failed: ${component.name}`, { error: err.message });
      // Try once more
      try {
        const retry = await runAgent({
          systemPrompt: generatorPrompt,
          userMessage: userMsg + "\n\nIMPORTANT: Your previous attempt failed. Return valid JSON only.",
          prefill: "{",
          maxTokens: 16384,
        });
        const parsed = retry.parsed;
        html = parsed?.html || parsed?.content || null;
      } catch {
        log(`Component retry also failed: ${component.name}`);
      }
    }

    if (!html) {
      log(`Skipping component (no HTML): ${component.name}`);
      continue;
    }

    // Write component to DB
    if (component.type === "wrapper" || component.type === "header" || component.type === "footer") {
      // Project-level layouts (only for homepage)
      if (isHomepage) {
        await db(PROJECTS_TABLE).where("id", projectId).update({
          [component.type]: html,
          updated_at: db.fn.now(),
        });
      }
    } else {
      // Section — append to sections array
      generatedSections.push({ name: component.name, content: html });
      await db(PAGES_TABLE).where("id", pageId).update({
        sections: JSON.stringify({ sections: generatedSections }),
        updated_at: db.fn.now(),
      });
    }

    // Update progress: completed count
    await db(PAGES_TABLE).where("id", pageId).update({
      generation_progress: JSON.stringify({
        total: totalComponents,
        completed: i + 1,
        current_component:
          i + 1 < totalComponents ? components[i + 1].name : "done",
      }),
      updated_at: db.fn.now(),
    });
  }

  // --- Step 4: Mark complete ---
  await db(PAGES_TABLE).where("id", pageId).update({
    generation_status: "ready",
    generation_progress: null,
    status: "published",
    updated_at: db.fn.now(),
  });

  if (isHomepage) {
    await db(PROJECTS_TABLE).where("id", projectId).update({
      status: "LIVE",
      updated_at: db.fn.now(),
    });
  }

  log("Page generation complete", { pageId });
}

// ---------------------------------------------------------------------------
// 3. CANCEL
// ---------------------------------------------------------------------------

/**
 * Cancel all in-progress generation for a project.
 * Sets the cancel flag and marks all queued/generating pages as cancelled.
 */
export async function cancelProjectGeneration(
  projectId: string,
): Promise<{ cancelledPages: number }> {
  log("Cancelling generation", { projectId });

  await db(PROJECTS_TABLE).where("id", projectId).update({
    generation_cancel_requested: true,
    updated_at: db.fn.now(),
  });

  const updated = await db(PAGES_TABLE)
    .where("project_id", projectId)
    .whereIn("generation_status", ["queued", "generating"])
    .update({
      generation_status: "cancelled",
      generation_progress: null,
      updated_at: db.fn.now(),
    });

  return { cancelledPages: updated };
}

/**
 * Check if cancellation was requested. Resets flag after reading.
 */
export async function isCancelled(projectId: string): Promise<boolean> {
  const project = await db(PROJECTS_TABLE)
    .where("id", projectId)
    .select("generation_cancel_requested")
    .first();
  return project?.generation_cancel_requested === true;
}

/**
 * Reset the cancel flag (called at the start of a new generation run).
 */
export async function resetCancelFlag(projectId: string): Promise<void> {
  await db(PROJECTS_TABLE).where("id", projectId).update({
    generation_cancel_requested: false,
    updated_at: db.fn.now(),
  });
}

// ---------------------------------------------------------------------------
// INTERNAL HELPERS
// ---------------------------------------------------------------------------

function checkCancel(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Generation cancelled");
  }
}

async function markPageFailed(pageId: string, reason: string): Promise<void> {
  log(`Page failed: ${reason}`, { pageId });
  await db(PAGES_TABLE).where("id", pageId).update({
    generation_status: "failed",
    generation_progress: null,
    updated_at: db.fn.now(),
  });
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

// ---------------------------------------------------------------------------
// GBP SCRAPE (Apify)
// ---------------------------------------------------------------------------

async function scrapeGbp(
  placeId: string,
  practiceSearchString?: string,
  signal?: AbortSignal,
): Promise<any> {
  if (!APIFY_TOKEN) {
    throw new Error("APIFY_TOKEN not configured");
  }

  const input: Record<string, any> = {
    placeIds: [placeId],
    scrapePlaceDetailPage: true,
    maxImages: 15,
    maxReviews: 10,
    maxCrawledPlacesPerSearch: 1,
  };
  if (practiceSearchString) {
    input.searchStringsArray = [practiceSearchString];
  }

  log("Starting Apify GBP scrape", { placeId });

  // Start actor run
  const runResponse = await axios.post(
    `${APIFY_API_BASE}/acts/${GOOGLE_MAPS_ACTOR}/runs`,
    input,
    {
      headers: { Authorization: `Bearer ${APIFY_TOKEN}` },
      params: { memory: 4096 },
      signal,
    },
  );

  const runId = runResponse.data.data.id;
  log("Apify run started", { runId });

  // Poll for completion
  const maxWaitMs = 300000; // 5 minutes
  const pollInterval = 5000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    checkCancel(signal);

    const statusResponse = await axios.get(
      `${APIFY_API_BASE}/actor-runs/${runId}`,
      { headers: { Authorization: `Bearer ${APIFY_TOKEN}` }, signal },
    );

    const run = statusResponse.data.data;

    if (run.status === "SUCCEEDED") {
      const datasetId = run.defaultDatasetId;
      const dataResponse = await axios.get(
        `${APIFY_API_BASE}/datasets/${datasetId}/items`,
        {
          headers: { Authorization: `Bearer ${APIFY_TOKEN}` },
          params: { format: "json" },
          signal,
        },
      );
      return dataResponse.data[0] || null;
    }

    if (["FAILED", "ABORTED", "TIMED-OUT"].includes(run.status)) {
      throw new Error(`Apify run ${runId} failed: ${run.status}`);
    }

    await sleep(pollInterval);
  }

  throw new Error(`Apify run ${runId} timed out`);
}

// ---------------------------------------------------------------------------
// IMAGE PROCESSING
// ---------------------------------------------------------------------------

function collectImageUrls(gbpData: any, websiteData: any): string[] {
  const urls: string[] = [];

  if (gbpData?.imageUrls && Array.isArray(gbpData.imageUrls)) {
    urls.push(...gbpData.imageUrls);
  }

  if (websiteData?.images && Array.isArray(websiteData.images)) {
    urls.push(...websiteData.images);
  }

  // Dedupe and filter nulls
  return [...new Set(urls.filter((u) => u && typeof u === "string"))];
}

/**
 * Download images, upload to S3, and analyze with Claude vision.
 * Batches images in groups of 5 to reduce LLM calls.
 */
async function processImages(
  projectId: string,
  imageUrls: string[],
  signal?: AbortSignal,
): Promise<any[]> {
  const analysisResults: any[] = [];
  const uploadedImages: Array<{ url: string; s3Url: string; buffer: Buffer; mimeType: string }> = [];

  // Download and upload all images to S3
  for (const imageUrl of imageUrls) {
    checkCancel(signal);

    try {
      const response = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        timeout: 15000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "image/*",
        },
        signal,
      });

      const buffer = Buffer.from(response.data);
      const contentType = response.headers["content-type"] || "image/jpeg";
      const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
      const filename = `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const s3Key = buildMediaS3Key(projectId, filename);

      await uploadToS3(s3Key, buffer, contentType);
      const s3Url = buildS3Url(s3Key);

      uploadedImages.push({
        url: imageUrl,
        s3Url,
        buffer,
        mimeType: contentType as any,
      });
    } catch (err: any) {
      log(`Image download/upload failed: ${imageUrl}`, { error: err.message });
    }
  }

  if (uploadedImages.length === 0) return [];

  // Analyze in batches of 5
  const imageAnalysisPrompt = loadPrompt("websiteAgents/builder/ImageAnalysis");
  const batchSize = 5;

  for (let i = 0; i < uploadedImages.length; i += batchSize) {
    checkCancel(signal);

    const batch = uploadedImages.slice(i, i + batchSize);

    const images = batch.map((img) => ({
      mediaType: (img.mimeType.startsWith("image/")
        ? img.mimeType
        : "image/jpeg") as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
      base64: img.buffer.toString("base64"),
    }));

    const userMsg = `Analyze these ${batch.length} image(s). Their S3 URLs are:\n${batch.map((img, idx) => `${idx + 1}. ${img.s3Url}`).join("\n")}`;

    try {
      const result = await runAgent({
        systemPrompt: imageAnalysisPrompt,
        userMessage: userMsg,
        images,
        prefill: "{",
        maxTokens: 4096,
      });

      if (result.parsed?.images && Array.isArray(result.parsed.images)) {
        analysisResults.push(...result.parsed.images);
      }
    } catch (err: any) {
      log(`Image analysis batch failed`, { error: err.message, batch: i });
    }
  }

  return analysisResults;
}

// ---------------------------------------------------------------------------
// COMPONENT BUILDING
// ---------------------------------------------------------------------------

interface ComponentDef {
  name: string;
  type: "wrapper" | "header" | "footer" | "section";
  templateMarkup: string;
}

function buildComponentList(
  template: any,
  templatePage: any,
): ComponentDef[] {
  const components: ComponentDef[] = [];

  if (template.wrapper) {
    components.push({ name: "wrapper", type: "wrapper", templateMarkup: template.wrapper });
  }
  if (template.header) {
    components.push({ name: "header", type: "header", templateMarkup: template.header });
  }

  const sections = normalizeSections(templatePage?.sections);
  for (const section of sections) {
    components.push({
      name: section.name || `section-${components.length}`,
      type: "section",
      templateMarkup: section.content || "",
    });
  }

  if (template.footer) {
    components.push({ name: "footer", type: "footer", templateMarkup: template.footer });
  }

  return components;
}

function buildDataAnalysisMessage(gbpData: any, websiteData: any): string {
  const parts: string[] = [];

  if (gbpData) {
    parts.push(`## GBP Data\n\n${JSON.stringify(gbpData)}`);
  }

  if (websiteData) {
    if (websiteData.pages && typeof websiteData.pages === "object") {
      const textParts = Object.entries(websiteData.pages)
        .map(([key, val]) => {
          const cleaned = String(val)
            .replace(/[\n\r\t]/g, " ")
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/&[a-zA-Z0-9#]+;/g, " ")
            .replace(/https?:\/\/\S+/g, " ")
            .replace(/[^a-zA-Z0-9.,!?'\-\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          return `${key.toUpperCase()}:\n${cleaned}`;
        })
        .join("\n\n");
      parts.push(`## Website Content\n\n${textParts}`);
    } else if (websiteData.content) {
      parts.push(`## Website Content\n\n${websiteData.content}`);
    }
  }

  if (parts.length === 0) {
    parts.push("No data available. Generate reasonable defaults for a professional business website.");
  }

  return parts.join("\n\n");
}

function buildComponentMessage(
  component: ComponentDef,
  distilledData: any,
  imageAnalysis: any,
  params: GenerateParams,
): string {
  const parts: string[] = [];

  parts.push(`## Template Component\nName: ${component.name}\nType: ${component.type}\n\nMarkup:\n${component.templateMarkup}`);

  if (params.primaryColor) {
    parts.push(`## Colors\nPrimary Color: ${params.primaryColor}\nAccent Color: ${params.accentColor || ""}`);
  }

  if (distilledData && Object.keys(distilledData).length > 0) {
    parts.push(`## Business Data\n${JSON.stringify(distilledData)}`);
  }

  if (imageAnalysis?.images && Array.isArray(imageAnalysis.images) && imageAnalysis.images.length > 0) {
    parts.push(`## Available Images\n${JSON.stringify(imageAnalysis.images)}`);
  }

  if (params.pageContext) {
    parts.push(`## Additional Context\n${params.pageContext}`);
  }

  if (params.businessName) {
    const meta: string[] = [];
    if (params.businessName) meta.push(`Business: ${params.businessName}`);
    if (params.formattedAddress) meta.push(`Address: ${params.formattedAddress}`);
    if (params.phone) meta.push(`Phone: ${params.phone}`);
    if (params.category) meta.push(`Category: ${params.category}`);
    parts.push(`## Business Metadata\n${meta.join("\n")}`);
  }

  return parts.join("\n\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
