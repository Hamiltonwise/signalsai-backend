/**
 * Bulk SEO Generation Processor
 *
 * Processes all pages (or posts of a given type) for a project,
 * generating SEO metadata for each one sequentially.
 * Shared context (business data, mind skills) fetched once per job.
 */

import { Job } from "bullmq";
import { db } from "../../database/connection";
import { SeoGenerationJobModel } from "../../models/website-builder/SeoGenerationJobModel";

const PAGES_TABLE = "website_builder.pages";
const POSTS_TABLE = "website_builder.posts";
const PROJECTS_TABLE = "website_builder.projects";

export interface SeoBulkGenerateData {
  jobRecordId: string;
  projectId: string;
  entityType: "page" | "post";
  postTypeId?: string;
  pagePaths?: string[];
}

export async function processSeoBulkGenerate(job: Job<SeoBulkGenerateData>): Promise<void> {
  const { jobRecordId, projectId, entityType, postTypeId, pagePaths } = job.data;

  const jobStart = Date.now();
  console.log(`[SEO-BULK] ▶ Starting bulk SEO generation`);
  console.log(`[SEO-BULK]   job=${jobRecordId}`);
  console.log(`[SEO-BULK]   project=${projectId} type=${entityType} postType=${postTypeId || "n/a"}`);

  try {
  await SeoGenerationJobModel.markProcessing(jobRecordId);
  console.log(`[SEO-BULK]   Status → processing`);

  // Lazy-import the SEO generation internals to avoid circular deps
  const seoService = await import(
    "../../controllers/admin-websites/feature-services/service.seo-generation"
  );

  // Fetch shared context once
  console.log(`[SEO-BULK]   Fetching shared context (business data + mind skills)...`);
  const sharedContext = await seoService.fetchSharedContext(projectId);
  console.log(`[SEO-BULK]   Shared context loaded (${Date.now() - jobStart}ms)`);

  // Gather all existing SEO titles/descriptions for uniqueness
  const allMeta = await getAllSeoMeta(projectId);

  // Get project for wrapper/header/footer
  const project = await db(PROJECTS_TABLE).where({ id: projectId }).first();
  const wrapperHtml = project?.wrapper || "";
  const headerHtml = project?.header || "";
  const footerHtml = project?.footer || "";

  // Fetch entities to process
  let entities: Array<{ id: string; title: string; content: string; path?: string }>;

  if (entityType === "page") {
    entities = await getPageEntities(projectId, pagePaths);
  } else {
    entities = await getPostEntities(projectId, postTypeId!);
  }

  console.log(`[SEO-BULK]   Found ${entities.length} ${entityType}(s) to process`);
  console.log(`[SEO-BULK]   Existing meta: ${allMeta.titles.length} titles, ${allMeta.descriptions.length} descriptions`);

  // Track accumulated titles/descriptions for uniqueness within this batch
  const batchTitles = [...allMeta.titles];
  const batchDescriptions = [...allMeta.descriptions];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    const entityStart = Date.now();
    console.log(`[SEO-BULK]   [${i + 1}/${entities.length}] Generating SEO for "${entity.title}" (${entity.id})...`);
    try {
      const results = await seoService.generateAllWithSharedContext(
        sharedContext,
        entityType,
        {
          page_content: entity.content,
          homepage_content: "",
          header_html: headerHtml,
          footer_html: footerHtml,
          wrapper_html: wrapperHtml,
          existing_seo_data: {},
          all_page_titles: batchTitles,
          all_page_descriptions: batchDescriptions,
          page_path: entity.path,
          post_title: entityType === "post" ? entity.title : undefined,
        },
        projectId,
        entity.id
      );

      // Merge all generated sections into a single seo_data object
      const mergedSeoData: Record<string, unknown> = {};
      const mergedInsights: Record<string, string> = {};
      for (const r of results) {
        Object.assign(mergedSeoData, r.generated);
        if (r.insight) mergedInsights[r.section] = r.insight;
      }
      mergedSeoData.insights = mergedInsights;

      // Track new titles/descriptions for uniqueness in subsequent entities
      if (mergedSeoData.meta_title) batchTitles.push(mergedSeoData.meta_title as string);
      if (mergedSeoData.meta_description) batchDescriptions.push(mergedSeoData.meta_description as string);

      // Save seo_data to DB
      const table = entityType === "page" ? PAGES_TABLE : POSTS_TABLE;
      await db(table).where({ id: entity.id }).update({
        seo_data: JSON.stringify(mergedSeoData),
        updated_at: new Date(),
      });

      // For pages, propagate seo_data to all sibling versions with null seo_data
      if (entityType === "page" && entity.path) {
        const propagated = await db(PAGES_TABLE)
          .where({ project_id: projectId, path: entity.path })
          .whereNull("seo_data")
          .whereNot("id", entity.id)
          .update({ seo_data: JSON.stringify(mergedSeoData) });
        if (propagated > 0) {
          console.log(`[SEO-BULK]     Propagated seo_data to ${propagated} sibling version(s)`);
        }
      }

      await SeoGenerationJobModel.incrementCompleted(jobRecordId);
      console.log(`[SEO-BULK]   [${i + 1}/${entities.length}] ✓ Done "${entity.title}" (${Date.now() - entityStart}ms)`);
    } catch (err: any) {
      console.error(`[SEO-BULK]   [${i + 1}/${entities.length}] ✗ Failed "${entity.title}" (${Date.now() - entityStart}ms):`, err.message);
      await SeoGenerationJobModel.incrementFailed(jobRecordId, {
        id: entity.id,
        title: entity.title,
        error: err.message || "Unknown error",
      });
    }
  }

  // Final status
  const finalJob = await SeoGenerationJobModel.findById(jobRecordId);
  if (finalJob && finalJob.failed_count > 0 && finalJob.completed_count === 0) {
    await SeoGenerationJobModel.markFailed(jobRecordId);
  } else {
    await SeoGenerationJobModel.markCompleted(jobRecordId);
  }

  const elapsed = Math.round((Date.now() - jobStart) / 1000);
  console.log(`[SEO-BULK] ■ Job ${jobRecordId} finished in ${elapsed}s: ${finalJob?.completed_count} completed, ${finalJob?.failed_count} failed`);

  } catch (err: any) {
    console.error(`[SEO-BULK] ✗ Job ${jobRecordId} crashed:`, err.message);
    await SeoGenerationJobModel.markFailed(jobRecordId);
    throw err; // Re-throw so BullMQ also marks it failed
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getPageEntities(projectId: string, pagePaths?: string[]) {
  // Get pages — filtered by paths if specified, otherwise all
  let pagesQuery = db(PAGES_TABLE)
    .where({ project_id: projectId })
    .orderBy("path", "asc")
    .orderBy("version", "desc");

  if (pagePaths && pagePaths.length > 0) {
    pagesQuery = pagesQuery.whereIn("path", pagePaths);
    console.log(`[SEO-BULK]   Filtering to ${pagePaths.length} selected paths`);
  }

  const pages = await pagesQuery;

  // Group by path: prefer published, fallback to draft, then highest version
  const grouped = new Map<string, any[]>();
  for (const page of pages) {
    const group = grouped.get(page.path) || [];
    group.push(page);
    grouped.set(page.path, group);
  }

  const entities: Array<{ id: string; title: string; content: string; path: string }> = [];

  for (const [path, versions] of grouped) {
    const best =
      versions.find((p: any) => p.status === "published") ||
      versions.find((p: any) => p.status === "draft") ||
      versions[0]; // highest version fallback

    // Extract text content from sections
    let sections: any[] = [];
    try {
      const raw = typeof best.sections === "string" ? JSON.parse(best.sections) : best.sections;
      sections = Array.isArray(raw) ? raw : [];
    } catch {
      sections = [];
    }
    const content = sections.map((s: any) => s.content || "").join("\n");

    entities.push({
      id: best.id,
      title: path,
      content,
      path,
    });
  }

  return entities;
}

async function getPostEntities(projectId: string, postTypeId: string) {
  const posts = await db(POSTS_TABLE)
    .where({ project_id: projectId, post_type_id: postTypeId })
    .orderBy("sort_order", "asc")
    .orderBy("created_at", "desc");

  return posts.map((post: any) => ({
    id: post.id,
    title: post.title,
    content: post.content || "",
    path: undefined,
  }));
}

async function getAllSeoMeta(projectId: string): Promise<{ titles: string[]; descriptions: string[] }> {
  const titles: string[] = [];
  const descriptions: string[] = [];

  const pages = await db(PAGES_TABLE)
    .where({ project_id: projectId })
    .whereNotNull("seo_data")
    .select("seo_data");

  const posts = await db(POSTS_TABLE)
    .where({ project_id: projectId })
    .whereNotNull("seo_data")
    .select("seo_data");

  for (const row of [...pages, ...posts]) {
    const data = typeof row.seo_data === "string" ? JSON.parse(row.seo_data) : row.seo_data;
    if (data?.meta_title) titles.push(data.meta_title);
    if (data?.meta_description) descriptions.push(data.meta_description);
  }

  return { titles, descriptions };
}
