/**
 * AI Command Service
 *
 * Orchestrates batch analysis of website content (layouts, pages, posts)
 * against a user prompt/checklist. Produces structured recommendations
 * stored in the database for review and later execution.
 */

import { db } from "../../../database/connection";
import { normalizeSections } from "../feature-utils/util.section-normalizer";
import {
  analyzeHtmlContent,
  editHtmlContent,
  analyzeForStructuralChanges,
  planPageSections,
  generateSectionHtml,
} from "../../../utils/website-utils/aiCommandService";
import crypto from "crypto";
import * as redirectsService from "./service.redirects";
import * as menuManager from "./service.menu-manager";

const BATCHES_TABLE = "website_builder.ai_command_batches";
const RECS_TABLE = "website_builder.ai_command_recommendations";
const PROJECTS_TABLE = "website_builder.projects";
const PAGES_TABLE = "website_builder.pages";
const POSTS_TABLE = "website_builder.posts";
const POST_TYPES_TABLE = "website_builder.post_types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AiCommandTargets {
  pages?: string[] | "all";
  posts?: string[] | "all";
  layouts?: string[] | "all";
}

interface BatchStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  executed: number;
  failed: number;
}

// ---------------------------------------------------------------------------
// Create batch
// ---------------------------------------------------------------------------

export async function createBatch(
  projectId: string,
  prompt: string,
  targets: AiCommandTargets,
  createdBy?: string
): Promise<any> {
  const [batch] = await db(BATCHES_TABLE)
    .insert({
      project_id: projectId,
      prompt,
      targets: JSON.stringify(targets),
      status: "analyzing",
      created_by: createdBy || null,
    })
    .returning("*");

  console.log(`[AiCommand] Created batch ${batch.id} for project ${projectId}`);
  return batch;
}

// ---------------------------------------------------------------------------
// Analyze batch (async orchestration)
// ---------------------------------------------------------------------------

export async function analyzeBatch(batchId: string): Promise<void> {
  const batch = await db(BATCHES_TABLE).where("id", batchId).first();
  if (!batch) throw new Error(`Batch ${batchId} not found`);

  const project = await db(PROJECTS_TABLE)
    .where("id", batch.project_id)
    .first();
  if (!project) throw new Error(`Project ${batch.project_id} not found`);

  const targets: AiCommandTargets =
    typeof batch.targets === "string"
      ? JSON.parse(batch.targets)
      : batch.targets;

  let sortOrder = 0;
  let totalRecommendations = 0;

  try {
    // ---- Layouts ----
    if (targets.layouts) {
      const layoutFields =
        targets.layouts === "all"
          ? (["wrapper", "header", "footer"] as const)
          : (targets.layouts as string[]);

      for (const field of layoutFields) {
        const html = project[field];
        console.log(
          `[AiCommand] Layout "${field}": ${html ? `${String(html).length} chars` : "empty/null"}`
        );
        if (!html || typeof html !== "string" || html.trim().length === 0)
          continue;

        try {
          const result = await analyzeHtmlContent({
            prompt: batch.prompt,
            targetLabel: `Layout > ${capitalize(field)}`,
            currentHtml: html,
          });

          for (const rec of result.recommendations) {
            await db(RECS_TABLE).insert({
              batch_id: batchId,
              target_type: "layout",
              target_id: batch.project_id,
              target_label: `Layout > ${capitalize(field)}`,
              target_meta: JSON.stringify({ layout_field: field }),
              recommendation: rec.recommendation,
              instruction: rec.instruction,
              current_html: html,
              sort_order: sortOrder++,
            });
            totalRecommendations++;
          }
        } catch (err) {
          console.error(
            `[AiCommand] Failed to analyze layout ${field}:`,
            err
          );
        }

        await refreshStats(batchId);
      }
    }

    // ---- Pages ----
    if (targets.pages) {
      const pages = await resolvePages(batch.project_id, targets.pages);

      for (const page of pages) {
        const rawSections = typeof page.sections === "string"
          ? JSON.parse(page.sections)
          : page.sections;
        const sections = normalizeSections(rawSections);

        console.log(
          `[AiCommand] Page ${page.path}: ${sections.length} sections found (raw type: ${typeof page.sections}, normalized: ${sections.length})`
        );

        for (let i = 0; i < sections.length; i++) {
          const section = sections[i];
          const sectionName =
            section.name || section.label || `Section ${i + 1}`;
          const sectionHtml =
            typeof section === "string"
              ? section
              : section.content || section.html || "";

          console.log(
            `[AiCommand]   Section ${i} "${sectionName}": ${sectionHtml.length} chars (keys: ${typeof section === "object" ? Object.keys(section).join(",") : "string"})`
          );

          if (!sectionHtml || sectionHtml.trim().length === 0) continue;

          try {
            const result = await analyzeHtmlContent({
              prompt: batch.prompt,
              targetLabel: `${page.path} > ${sectionName}`,
              currentHtml: sectionHtml,
            });

            for (const rec of result.recommendations) {
              await db(RECS_TABLE).insert({
                batch_id: batchId,
                target_type: "page_section",
                target_id: page.id,
                target_label: `${page.path} > ${sectionName}`,
                target_meta: JSON.stringify({
                  section_index: i,
                  section_name: sectionName,
                  page_path: page.path,
                }),
                recommendation: rec.recommendation,
                instruction: rec.instruction,
                current_html: sectionHtml,
                sort_order: sortOrder++,
              });
              totalRecommendations++;
            }
          } catch (err) {
            console.error(
              `[AiCommand] Failed to analyze ${page.path} section ${i}:`,
              err
            );
          }

          await refreshStats(batchId);
        }
      }
    }

    // ---- Posts ----
    if (targets.posts) {
      const posts = await resolvePosts(batch.project_id, targets.posts);

      for (const post of posts) {
        if (!post.content || post.content.trim().length === 0) continue;

        try {
          const result = await analyzeHtmlContent({
            prompt: batch.prompt,
            targetLabel: `Post: ${post.title}`,
            currentHtml: post.content,
          });

          for (const rec of result.recommendations) {
            await db(RECS_TABLE).insert({
              batch_id: batchId,
              target_type: "post",
              target_id: post.id,
              target_label: `Post: ${post.title}`,
              target_meta: JSON.stringify({
                post_type_slug: post.post_type_slug || null,
              }),
              recommendation: rec.recommendation,
              instruction: rec.instruction,
              current_html: post.content,
              sort_order: sortOrder++,
            });
            totalRecommendations++;
          }
        } catch (err) {
          console.error(
            `[AiCommand] Failed to analyze post ${post.id}:`,
            err
          );
        }

        await refreshStats(batchId);
      }
    }

    // ---- Structural analysis (redirects, new pages, new posts) ----
    try {
      const existingPaths = await getExistingPaths(batch.project_id);
      const existingRedirects = await redirectsService.getExistingRedirects(batch.project_id);
      const existingPostSlugs = await getExistingPostSlugs(batch.project_id);
      const postTypes = await getProjectPostTypes(batch.project_id, project.template_id);
      const existingMenus = await getExistingMenuItems(batch.project_id);

      const structural = await analyzeForStructuralChanges({
        prompt: batch.prompt,
        existingPaths,
        existingRedirects: existingRedirects.map((r) => `${r.from_path} → ${r.to_path}`),
        existingPostSlugs: existingPostSlugs.map((p) => `${p.post_type_slug}/${p.slug}`),
        postTypes: postTypes.map((pt: any) => `${pt.slug} (${pt.name})`),
        existingMenus,
      });

      for (const rec of structural.redirects) {
        await db(RECS_TABLE).insert({
          batch_id: batchId,
          target_type: "create_redirect",
          target_id: batch.project_id,
          target_label: `Redirect: ${rec.from_path} → ${rec.to_path}`,
          target_meta: JSON.stringify({ from_path: rec.from_path, to_path: rec.to_path, type: rec.type || 301 }),
          recommendation: rec.recommendation,
          instruction: `Create ${rec.type || 301} redirect from ${rec.from_path} to ${rec.to_path}`,
          current_html: "",
          sort_order: sortOrder++,
        });
        totalRecommendations++;
      }

      for (const rec of structural.pages) {
        await db(RECS_TABLE).insert({
          batch_id: batchId,
          target_type: "create_page",
          target_id: batch.project_id,
          target_label: `Create page: ${rec.path}`,
          target_meta: JSON.stringify({ path: rec.path, page_purpose: rec.purpose }),
          recommendation: rec.recommendation,
          instruction: `Create a new page at ${rec.path}: ${rec.purpose}`,
          current_html: "",
          sort_order: sortOrder++,
        });
        totalRecommendations++;
      }

      for (const rec of structural.posts) {
        await db(RECS_TABLE).insert({
          batch_id: batchId,
          target_type: "create_post",
          target_id: batch.project_id,
          target_label: `Create post: ${rec.title}`,
          target_meta: JSON.stringify({ post_type_slug: rec.post_type_slug, title: rec.title, slug: rec.slug, purpose: rec.purpose }),
          recommendation: rec.recommendation,
          instruction: `Create a new ${rec.post_type_slug} post: ${rec.title}`,
          current_html: "",
          sort_order: sortOrder++,
        });
        totalRecommendations++;
      }

      for (const rec of structural.newMenus) {
        await db(RECS_TABLE).insert({
          batch_id: batchId,
          target_type: "create_menu",
          target_id: batch.project_id,
          target_label: `Create menu: ${rec.name}`,
          target_meta: JSON.stringify({ name: rec.name, slug: rec.slug }),
          recommendation: rec.recommendation,
          instruction: `Create a new menu named "${rec.name}" with slug "${rec.slug}"`,
          current_html: "",
          sort_order: sortOrder++,
        });
        totalRecommendations++;
      }

      for (const rec of structural.menuChanges) {
        await db(RECS_TABLE).insert({
          batch_id: batchId,
          target_type: "update_menu",
          target_id: batch.project_id,
          target_label: `Menu: ${rec.action} "${rec.label}" in ${rec.menu_slug}`,
          target_meta: JSON.stringify(rec),
          recommendation: rec.recommendation,
          instruction: `${rec.action} menu item "${rec.label}" ${rec.action === "add" ? `with URL ${rec.url} in menu "${rec.menu_slug}"` : `from menu "${rec.menu_slug}"`}`,
          current_html: "",
          sort_order: sortOrder++,
        });
        totalRecommendations++;
      }

      await refreshStats(batchId);
    } catch (err) {
      console.error("[AiCommand] Failed structural analysis:", err);
    }

    // Finalize
    await db(BATCHES_TABLE).where("id", batchId).update({
      status: totalRecommendations > 0 ? "ready" : "ready",
      summary:
        totalRecommendations > 0
          ? `Found ${totalRecommendations} recommendation(s) across your selected targets.`
          : "No changes recommended. The content looks good against your requirements.",
      updated_at: db.fn.now(),
    });

    await refreshStats(batchId);

    console.log(
      `[AiCommand] ✓ Batch ${batchId} complete: ${totalRecommendations} recommendations`
    );
  } catch (err) {
    console.error(`[AiCommand] Batch ${batchId} failed:`, err);
    await db(BATCHES_TABLE).where("id", batchId).update({
      status: "failed",
      summary: `Analysis failed: ${(err as Error).message}`,
      updated_at: db.fn.now(),
    });
  }
}

// ---------------------------------------------------------------------------
// Execution context — shared state across recommendations in a batch run
// ---------------------------------------------------------------------------

interface ExecutionContext {
  createdPages: Map<string, { path: string; id: string }>;   // purpose → { path, id }
  createdPosts: Map<string, { id: string; slug: string; post_type_slug: string }>;  // slug → { id, slug, type }
  createdMenus: Map<string, string>;                          // slug → id
  createdRedirects: Map<string, string>;                      // from_path → to_path
}

function createExecutionContext(): ExecutionContext {
  return {
    createdPages: new Map(),
    createdPosts: new Map(),
    createdMenus: new Map(),
    createdRedirects: new Map(),
  };
}

// Execution phases — deterministic ordering so dependencies resolve correctly
const EXECUTION_PHASE_ORDER: Record<string, number> = {
  create_post: 1,        // Posts first (services, doctors, etc.)
  create_page: 2,        // Pages second (may reference posts)
  create_menu: 3,        // Menus third (need to know what pages/posts exist)
  update_menu: 4,        // Menu item changes
  create_redirect: 5,    // Redirects fourth (targets should exist)
  update_redirect: 6,    // Redirect updates
  delete_redirect: 7,    // Redirect deletes
  update_post_meta: 8,   // Post metadata updates
  update_page_path: 9,   // Page path updates
  page_section: 10,      // HTML edits last
  layout: 10,
  post: 10,
};

// ---------------------------------------------------------------------------
// Execute batch (Phase C)
// ---------------------------------------------------------------------------

export async function executeBatch(batchId: string): Promise<void> {
  const batch = await db(BATCHES_TABLE).where("id", batchId).first();
  if (!batch) throw new Error(`Batch ${batchId} not found`);

  if (batch.status !== "ready") {
    throw new Error(`Batch ${batchId} status is "${batch.status}", expected "ready"`);
  }

  await db(BATCHES_TABLE)
    .where("id", batchId)
    .update({ status: "executing", updated_at: db.fn.now() });

  const approved = await db(RECS_TABLE)
    .where({ batch_id: batchId, status: "approved" })
    .orderBy("sort_order", "asc");

  // Sort by execution phase — posts first, then pages, menus, redirects, edits last
  const sorted = [...approved].sort((a, b) => {
    const phaseA = EXECUTION_PHASE_ORDER[a.target_type] ?? 99;
    const phaseB = EXECUTION_PHASE_ORDER[b.target_type] ?? 99;
    if (phaseA !== phaseB) return phaseA - phaseB;
    return a.sort_order - b.sort_order;
  });

  console.log(
    `[AiCommand] Executing batch ${batchId}: ${sorted.length} approved recommendations (phase-ordered)`
  );

  const ctx = createExecutionContext();
  let executedCount = 0;
  let failedCount = 0;

  for (const rec of sorted) {
    try {
      await executeRecommendation(rec, ctx);
      executedCount++;
    } catch (err) {
      console.error(
        `[AiCommand] Recommendation ${rec.id} failed:`,
        (err as Error).message
      );
      await db(RECS_TABLE)
        .where("id", rec.id)
        .update({
          status: "failed",
          execution_result: JSON.stringify({
            success: false,
            error: (err as Error).message,
          }),
        });
      failedCount++;
    }

    await refreshStats(batchId);
  }

  await db(BATCHES_TABLE)
    .where("id", batchId)
    .update({
      status: "completed",
      summary: `Executed ${executedCount} change(s)${failedCount > 0 ? `, ${failedCount} failed` : ""}.`,
      updated_at: db.fn.now(),
    });

  await refreshStats(batchId);

  console.log(
    `[AiCommand] ✓ Batch ${batchId} execution complete: ${executedCount} executed, ${failedCount} failed`
  );
}

async function executeRecommendation(rec: any, ctx: ExecutionContext): Promise<void> {
  // Structural recommendations
  if (rec.target_type === "create_redirect") return executeCreateRedirect(rec);
  if (rec.target_type === "update_redirect") return executeUpdateRedirect(rec);
  if (rec.target_type === "delete_redirect") return executeDeleteRedirect(rec);
  if (rec.target_type === "create_page") return executeCreatePage(rec, ctx);
  if (rec.target_type === "create_post") return executeCreatePost(rec, ctx);
  if (rec.target_type === "create_menu") return executeCreateMenu(rec, ctx);
  if (rec.target_type === "update_menu") return executeUpdateMenu(rec, ctx);
  if (rec.target_type === "update_post_meta") return executeUpdatePostMeta(rec);
  if (rec.target_type === "update_page_path") return executeUpdatePagePath(rec);

  // Stale check — compare stored HTML with current live HTML
  const currentHtml = await getCurrentHtml(rec);

  if (currentHtml !== rec.current_html) {
    await db(RECS_TABLE)
      .where("id", rec.id)
      .update({
        status: "failed",
        execution_result: JSON.stringify({
          success: false,
          error: "Content changed since analysis — skipped to avoid overwriting recent edits.",
        }),
      });
    console.warn(
      `[AiCommand] Stale HTML for ${rec.target_label} — skipping`
    );
    return;
  }

  // LLM edit
  const result = await editHtmlContent({
    instruction: rec.instruction,
    currentHtml: rec.current_html,
    targetLabel: rec.target_label,
  });

  // Save the edited HTML
  await saveEditedHtml(rec, result.editedHtml);

  // Mark as executed
  await db(RECS_TABLE)
    .where("id", rec.id)
    .update({
      status: "executed",
      execution_result: JSON.stringify({
        success: true,
        edited_html: result.editedHtml,
        tokens: {
          input: result.inputTokens,
          output: result.outputTokens,
        },
      }),
    });

  console.log(`[AiCommand] ✓ Executed: ${rec.target_label}`);
}

async function getCurrentHtml(rec: any): Promise<string> {
  const meta =
    typeof rec.target_meta === "string"
      ? JSON.parse(rec.target_meta)
      : rec.target_meta;

  if (rec.target_type === "layout") {
    const project = await db(PROJECTS_TABLE)
      .where("id", rec.target_id)
      .first();
    if (!project) throw new Error(`Project ${rec.target_id} not found`);
    return project[meta.layout_field] || "";
  }

  if (rec.target_type === "page_section") {
    // Prefer draft, fall back to published
    const page = await db(PAGES_TABLE)
      .where("id", rec.target_id)
      .first();
    if (!page) throw new Error(`Page ${rec.target_id} not found`);

    const rawSections = typeof page.sections === "string"
      ? JSON.parse(page.sections)
      : page.sections;
    const sections = normalizeSections(rawSections);
    const section = sections[meta.section_index];
    if (!section) throw new Error(`Section ${meta.section_index} not found`);

    return typeof section === "string"
      ? section
      : section.content || section.html || "";
  }

  if (rec.target_type === "post") {
    const post = await db(POSTS_TABLE).where("id", rec.target_id).first();
    if (!post) throw new Error(`Post ${rec.target_id} not found`);
    return post.content || "";
  }

  throw new Error(`Unknown target type: ${rec.target_type}`);
}

async function saveEditedHtml(rec: any, editedHtml: string): Promise<void> {
  const meta =
    typeof rec.target_meta === "string"
      ? JSON.parse(rec.target_meta)
      : rec.target_meta;

  if (rec.target_type === "layout") {
    await db(PROJECTS_TABLE)
      .where("id", rec.target_id)
      .update({
        [meta.layout_field]: editedHtml,
        updated_at: db.fn.now(),
      });
    return;
  }

  if (rec.target_type === "page_section") {
    const page = await db(PAGES_TABLE).where("id", rec.target_id).first();
    if (!page) throw new Error(`Page ${rec.target_id} not found`);

    // Only edit drafts
    if (page.status !== "draft") {
      throw new Error(
        `Page ${rec.target_id} is not a draft (status: ${page.status}). Create a draft first.`
      );
    }

    const rawSections = typeof page.sections === "string"
      ? JSON.parse(page.sections)
      : page.sections;
    const sections = normalizeSections(rawSections);
    const section = sections[meta.section_index];

    if (typeof section === "string") {
      sections[meta.section_index] = editedHtml;
    } else {
      sections[meta.section_index] = {
        ...section,
        content: editedHtml,
      };
    }

    await db(PAGES_TABLE)
      .where("id", rec.target_id)
      .update({
        sections: JSON.stringify(sections),
        updated_at: db.fn.now(),
      });
    return;
  }

  if (rec.target_type === "post") {
    await db(POSTS_TABLE)
      .where("id", rec.target_id)
      .update({
        content: editedHtml,
        updated_at: db.fn.now(),
      });
    return;
  }

  throw new Error(`Unknown target type: ${rec.target_type}`);
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export async function getBatch(batchId: string): Promise<any> {
  return db(BATCHES_TABLE).where("id", batchId).first();
}

export async function listBatches(projectId: string): Promise<any[]> {
  return db(BATCHES_TABLE)
    .where("project_id", projectId)
    .orderBy("created_at", "desc");
}

export async function deleteBatch(batchId: string): Promise<void> {
  await db(BATCHES_TABLE).where("id", batchId).del();
}

export async function getBatchRecommendations(
  batchId: string,
  filters?: { status?: string; target_type?: string }
): Promise<any[]> {
  let query = db(RECS_TABLE)
    .where("batch_id", batchId)
    .orderBy("sort_order", "asc");

  if (filters?.status) {
    query = query.where("status", filters.status);
  }
  if (filters?.target_type) {
    query = query.where("target_type", filters.target_type);
  }

  return query;
}

// ---------------------------------------------------------------------------
// Update operations
// ---------------------------------------------------------------------------

export async function updateRecommendationStatus(
  recommendationId: string,
  status: "approved" | "rejected",
  metaUpdates?: { reference_url?: string; reference_content?: string }
): Promise<any> {
  const updatePayload: Record<string, unknown> = { status };

  // Merge reference data into target_meta for create_page/create_post
  if (metaUpdates && (metaUpdates.reference_url || metaUpdates.reference_content)) {
    const existing = await db(RECS_TABLE).where("id", recommendationId).first();
    if (existing) {
      const meta = typeof existing.target_meta === "string"
        ? JSON.parse(existing.target_meta)
        : existing.target_meta || {};
      if (metaUpdates.reference_url) meta.reference_url = metaUpdates.reference_url;
      if (metaUpdates.reference_content) meta.reference_content = metaUpdates.reference_content;
      updatePayload.target_meta = JSON.stringify(meta);
    }
  }

  const [rec] = await db(RECS_TABLE)
    .where("id", recommendationId)
    .update(updatePayload)
    .returning("*");

  if (rec) {
    await refreshStats(rec.batch_id);
  }

  return rec;
}

export async function bulkUpdateStatus(
  batchId: string,
  status: "approved" | "rejected",
  filters?: { target_type?: string }
): Promise<number> {
  let query = db(RECS_TABLE)
    .where({ batch_id: batchId, status: "pending" });

  if (filters?.target_type) {
    query = query.where("target_type", filters.target_type);
  }

  const updated = await query.update({ status });
  await refreshStats(batchId);
  return updated;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function refreshStats(batchId: string): Promise<void> {
  const rows = await db(RECS_TABLE)
    .where("batch_id", batchId)
    .select("status")
    .then((rows) =>
      rows.reduce(
        (acc: BatchStats, row: any) => {
          acc.total++;
          const s = row.status as keyof BatchStats;
          if (s in acc) (acc[s] as number)++;
          return acc;
        },
        { total: 0, pending: 0, approved: 0, rejected: 0, executed: 0, failed: 0 }
      )
    );

  await db(BATCHES_TABLE)
    .where("id", batchId)
    .update({ stats: JSON.stringify(rows), updated_at: db.fn.now() });
}

async function resolvePages(
  projectId: string,
  target: string[] | "all"
): Promise<any[]> {
  if (target === "all") {
    // For each path, prefer the draft version; fall back to published
    const allPages = await db(PAGES_TABLE)
      .where({ project_id: projectId })
      .whereIn("status", ["draft", "published"])
      .orderBy("path", "asc")
      .orderByRaw("CASE WHEN status = 'draft' THEN 0 ELSE 1 END ASC");

    // Deduplicate by path — keep first (draft preferred)
    const seen = new Set<string>();
    return allPages.filter((p: any) => {
      if (seen.has(p.path)) return false;
      seen.add(p.path);
      return true;
    });
  }

  // Specific page IDs
  return db(PAGES_TABLE).whereIn("id", target);
}

async function resolvePosts(
  projectId: string,
  target: string[] | "all"
): Promise<any[]> {
  if (target === "all") {
    return db(POSTS_TABLE)
      .where({ project_id: projectId, status: "published" })
      .orderBy("created_at", "desc");
  }

  return db(POSTS_TABLE).whereIn("id", target);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Structural execution handlers
// ---------------------------------------------------------------------------

async function executeCreateRedirect(rec: any): Promise<void> {
  const meta = typeof rec.target_meta === "string" ? JSON.parse(rec.target_meta) : rec.target_meta;

  const result = await redirectsService.createRedirect(rec.target_id, {
    from_path: meta.from_path,
    to_path: meta.to_path,
    type: meta.type || 301,
  });

  if (result.error) {
    await db(RECS_TABLE)
      .where("id", rec.id)
      .update({
        status: "failed",
        execution_result: JSON.stringify({ success: false, error: result.error.message }),
      });
    return;
  }

  await db(RECS_TABLE)
    .where("id", rec.id)
    .update({
      status: "executed",
      execution_result: JSON.stringify({ success: true, redirect_id: result.redirect.id }),
    });

  console.log(`[AiCommand] ✓ Created redirect: ${meta.from_path} → ${meta.to_path}`);
}

async function executeCreatePage(rec: any, ctx: ExecutionContext): Promise<void> {
  const meta = typeof rec.target_meta === "string" ? JSON.parse(rec.target_meta) : rec.target_meta;
  const projectId = rec.target_id;

  // Check if page already exists
  const existing = await db(PAGES_TABLE)
    .where({ project_id: projectId, path: meta.path })
    .whereIn("status", ["draft", "published"])
    .first();

  if (existing) {
    await db(RECS_TABLE).where("id", rec.id).update({
      status: "failed",
      execution_result: JSON.stringify({ success: false, error: `Page already exists at ${meta.path}` }),
    });
    return;
  }

  // Fetch existing pages for style context
  const existingPages = await db(PAGES_TABLE)
    .where({ project_id: projectId, status: "published" })
    .limit(3);

  const existingSections: Array<{ name: string; summary: string }> = [];
  let siteStyleContext = "";

  for (const page of existingPages) {
    const raw = typeof page.sections === "string" ? JSON.parse(page.sections) : page.sections;
    const sections = normalizeSections(raw);
    for (const s of sections) {
      const name = s.name || s.label || "unnamed";
      const content = typeof s === "string" ? s : s.content || s.html || "";
      existingSections.push({ name, summary: content.substring(0, 150) });
      if (siteStyleContext.length < 3000) {
        siteStyleContext += content.substring(0, 1000) + "\n\n";
      }
    }
  }

  // Resolve reference content — scrape URL or use provided text
  let referenceContent = "";
  if (meta.reference_content) {
    referenceContent = meta.reference_content;
  } else if (meta.reference_url) {
    try {
      console.log(`[AiCommand] Scraping reference URL: ${meta.reference_url}`);
      const scrapeResponse = await fetch(meta.reference_url, {
        headers: { "User-Agent": "AlloroBot/1.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (scrapeResponse.ok) {
        const html = await scrapeResponse.text();
        // Strip scripts/styles, keep text content
        referenceContent = html
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .substring(0, 8000);
        console.log(`[AiCommand] ✓ Scraped ${referenceContent.length} chars from reference URL`);
      }
    } catch (err) {
      console.warn(`[AiCommand] Failed to scrape reference URL: ${(err as Error).message}`);
    }
  }

  if (!referenceContent && !meta.reference_url) {
    await db(RECS_TABLE).where("id", rec.id).update({
      status: "failed",
      execution_result: JSON.stringify({
        success: false,
        error: "Reference URL or content is required for page creation. Provide it when approving this recommendation.",
      }),
    });
    return;
  }

  const pageContext = [
    meta.page_purpose || "",
    referenceContent ? `\n\n## Reference Content (from old site or provided text)\n${referenceContent}` : "",
  ].join("");

  // Plan sections
  const plan = await planPageSections({
    purpose: pageContext,
    existingSections,
  });

  // Generate each section
  const createdSections: Array<{ name: string; content: string }> = [];

  for (const planned of plan.sections) {
    const tplId = crypto.randomUUID().slice(0, 12);

    try {
      const result = await generateSectionHtml({
        sectionName: planned.name,
        sectionPurpose: planned.purpose,
        tplId,
        pageContext,
        priorSections: createdSections.map((s) => s.content),
        siteStyleContext,
      });

      createdSections.push({ name: planned.name, content: result.html });
    } catch (err) {
      console.error(`[AiCommand] Failed to generate section ${planned.name}:`, err);
      // Continue with remaining sections
    }
  }

  if (createdSections.length === 0) {
    await db(RECS_TABLE).where("id", rec.id).update({
      status: "failed",
      execution_result: JSON.stringify({ success: false, error: "Failed to generate any sections" }),
    });
    return;
  }

  // Create the page
  const [page] = await db(PAGES_TABLE)
    .insert({
      project_id: projectId,
      path: meta.path,
      version: 1,
      status: "draft",
      sections: JSON.stringify(createdSections),
    })
    .returning("*");

  await db(RECS_TABLE).where("id", rec.id).update({
    status: "executed",
    execution_result: JSON.stringify({
      success: true,
      page_id: page.id,
      sections_created: createdSections.length,
    }),
  });

  // Register in execution context so later recommendations can reference this page
  ctx.createdPages.set(meta.page_purpose || meta.path, { path: meta.path, id: page.id });

  console.log(
    `[AiCommand] ✓ Created page at ${meta.path} with ${createdSections.length} sections (page ID: ${page.id})`
  );
}

async function executeCreatePost(rec: any, ctx: ExecutionContext): Promise<void> {
  const meta = typeof rec.target_meta === "string" ? JSON.parse(rec.target_meta) : rec.target_meta;
  const projectId = rec.target_id;

  // Resolve post type
  const project = await db(PROJECTS_TABLE).where("id", projectId).first();
  if (!project?.template_id) {
    await db(RECS_TABLE).where("id", rec.id).update({
      status: "failed",
      execution_result: JSON.stringify({ success: false, error: "Project has no template — cannot resolve post types" }),
    });
    return;
  }

  const postType = await db(POST_TYPES_TABLE)
    .where({ template_id: project.template_id, slug: meta.post_type_slug })
    .first();

  if (!postType) {
    await db(RECS_TABLE).where("id", rec.id).update({
      status: "failed",
      execution_result: JSON.stringify({ success: false, error: `Post type "${meta.post_type_slug}" not found` }),
    });
    return;
  }

  // Check if post already exists
  const slug = meta.slug || meta.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const existing = await db(POSTS_TABLE)
    .where({ project_id: projectId, post_type_id: postType.id, slug })
    .first();

  if (existing) {
    await db(RECS_TABLE).where("id", rec.id).update({
      status: "failed",
      execution_result: JSON.stringify({ success: false, error: `Post with slug "${slug}" already exists` }),
    });
    return;
  }

  // Generate post content via LLM
  const { editHtmlContent: generateContent } = await import("../../../utils/website-utils/aiCommandService");

  const result = await generateContent({
    instruction: `Create content for a ${meta.post_type_slug} post titled "${meta.title}". ${meta.purpose || ""}. Write professional, informative HTML content suitable for a dental/medical practice website. Include relevant headings, paragraphs, and lists. Use Tailwind CSS classes for styling.`,
    currentHtml: "<div></div>",
    targetLabel: `Post: ${meta.title}`,
  });

  // Create the post
  const [post] = await db(POSTS_TABLE)
    .insert({
      project_id: projectId,
      post_type_id: postType.id,
      title: meta.title,
      slug,
      content: result.editedHtml,
      status: "draft",
      sort_order: 0,
    })
    .returning("*");

  await db(RECS_TABLE).where("id", rec.id).update({
    status: "executed",
    execution_result: JSON.stringify({ success: true, post_id: post.id }),
  });

  // Register in execution context
  ctx.createdPosts.set(slug, { id: post.id, slug, post_type_slug: meta.post_type_slug });

  console.log(`[AiCommand] ✓ Created post: ${meta.title} (${meta.post_type_slug}, ID: ${post.id})`);
}

async function executeUpdateMenu(rec: any, _ctx: ExecutionContext): Promise<void> {
  const meta = typeof rec.target_meta === "string" ? JSON.parse(rec.target_meta) : rec.target_meta;
  const projectId = rec.target_id;

  // Find the menu by slug
  const { menus } = await menuManager.listMenus(projectId);
  const menu = menus.find((m: any) => m.slug === meta.menu_slug);

  if (!menu) {
    await db(RECS_TABLE).where("id", rec.id).update({
      status: "failed",
      execution_result: JSON.stringify({ success: false, error: `Menu "${meta.menu_slug}" not found` }),
    });
    return;
  }

  if (meta.action === "add") {
    // Check if item with same URL already exists
    const menuDetail = await menuManager.getMenu(projectId, menu.id);
    const existingItem = findMenuItemByUrl(menuDetail.menu?.items || [], meta.url);
    if (existingItem) {
      await db(RECS_TABLE).where("id", rec.id).update({
        status: "failed",
        execution_result: JSON.stringify({ success: false, error: `Menu item with URL "${meta.url}" already exists` }),
      });
      return;
    }

    const result = await menuManager.createMenuItem(projectId, menu.id, {
      label: meta.label,
      url: meta.url,
      target: meta.target || "_self",
      parent_id: meta.parent_id || null,
    });

    if (result.error) {
      await db(RECS_TABLE).where("id", rec.id).update({
        status: "failed",
        execution_result: JSON.stringify({ success: false, error: result.error.message }),
      });
      return;
    }

    await db(RECS_TABLE).where("id", rec.id).update({
      status: "executed",
      execution_result: JSON.stringify({ success: true, item_id: result.item.id }),
    });
    console.log(`[AiCommand] ✓ Added menu item: "${meta.label}" → ${meta.url}`);

  } else if (meta.action === "remove") {
    const menuDetail = await menuManager.getMenu(projectId, menu.id);
    const item = findMenuItemByLabel(menuDetail.menu?.items || [], meta.label);

    if (!item) {
      await db(RECS_TABLE).where("id", rec.id).update({
        status: "failed",
        execution_result: JSON.stringify({ success: false, error: `Menu item "${meta.label}" not found` }),
      });
      return;
    }

    await menuManager.deleteMenuItem(projectId, menu.id, item.id);

    await db(RECS_TABLE).where("id", rec.id).update({
      status: "executed",
      execution_result: JSON.stringify({ success: true, deleted_item_id: item.id }),
    });
    console.log(`[AiCommand] ✓ Removed menu item: "${meta.label}"`);

  } else if (meta.action === "update") {
    const menuDetail = await menuManager.getMenu(projectId, menu.id);
    const item = findMenuItemByLabel(menuDetail.menu?.items || [], meta.original_label || meta.label);

    if (!item) {
      await db(RECS_TABLE).where("id", rec.id).update({
        status: "failed",
        execution_result: JSON.stringify({ success: false, error: `Menu item "${meta.original_label || meta.label}" not found` }),
      });
      return;
    }

    const updates: Record<string, string> = {};
    if (meta.label) updates.label = meta.label;
    if (meta.url) updates.url = meta.url;
    if (meta.target) updates.target = meta.target;

    const result = await menuManager.updateMenuItem(projectId, menu.id, item.id, updates);

    if (result.error) {
      await db(RECS_TABLE).where("id", rec.id).update({
        status: "failed",
        execution_result: JSON.stringify({ success: false, error: result.error.message }),
      });
      return;
    }

    await db(RECS_TABLE).where("id", rec.id).update({
      status: "executed",
      execution_result: JSON.stringify({ success: true, item_id: item.id }),
    });
    console.log(`[AiCommand] ✓ Updated menu item: "${meta.label}"`);
  }
}

function findMenuItemByUrl(items: any[], url: string): any | null {
  for (const item of items) {
    if (item.url === url) return item;
    if (item.children?.length) {
      const found = findMenuItemByUrl(item.children, url);
      if (found) return found;
    }
  }
  return null;
}

function findMenuItemByLabel(items: any[], label: string): any | null {
  for (const item of items) {
    if (item.label.toLowerCase() === label.toLowerCase()) return item;
    if (item.children?.length) {
      const found = findMenuItemByLabel(item.children, label);
      if (found) return found;
    }
  }
  return null;
}

async function executeCreateMenu(rec: any, ctx: ExecutionContext): Promise<void> {
  const meta = typeof rec.target_meta === "string" ? JSON.parse(rec.target_meta) : rec.target_meta;
  const projectId = rec.target_id;

  // Check if menu with this slug already exists
  const { menus } = await menuManager.listMenus(projectId);
  const existing = menus.find((m: any) => m.slug === meta.slug);
  if (existing) {
    await db(RECS_TABLE).where("id", rec.id).update({
      status: "failed",
      execution_result: JSON.stringify({ success: false, error: `Menu "${meta.slug}" already exists` }),
    });
    return;
  }

  const result = await menuManager.createMenu(projectId, { name: meta.name, slug: meta.slug });
  if (result.error) {
    await db(RECS_TABLE).where("id", rec.id).update({
      status: "failed",
      execution_result: JSON.stringify({ success: false, error: result.error.message }),
    });
    return;
  }

  ctx.createdMenus.set(meta.slug, result.menu.id);

  await db(RECS_TABLE).where("id", rec.id).update({
    status: "executed",
    execution_result: JSON.stringify({ success: true, menu_id: result.menu.id }),
  });
  console.log(`[AiCommand] ✓ Created menu: "${meta.name}" (${meta.slug})`);
}

async function executeUpdateRedirect(rec: any): Promise<void> {
  const meta = typeof rec.target_meta === "string" ? JSON.parse(rec.target_meta) : rec.target_meta;

  // Find existing redirect by from_path
  const existing = await db("website_builder.redirects")
    .where({ project_id: rec.target_id, from_path: meta.from_path })
    .first();

  if (!existing) {
    await db(RECS_TABLE).where("id", rec.id).update({
      status: "failed",
      execution_result: JSON.stringify({ success: false, error: `Redirect from "${meta.from_path}" not found` }),
    });
    return;
  }

  const result = await redirectsService.updateRedirect(existing.id, {
    to_path: meta.to_path,
    type: meta.type,
  });

  if (result.error) {
    await db(RECS_TABLE).where("id", rec.id).update({
      status: "failed",
      execution_result: JSON.stringify({ success: false, error: result.error.message }),
    });
    return;
  }

  await db(RECS_TABLE).where("id", rec.id).update({
    status: "executed",
    execution_result: JSON.stringify({ success: true, redirect_id: existing.id }),
  });
  console.log(`[AiCommand] ✓ Updated redirect: ${meta.from_path} → ${meta.to_path}`);
}

async function executeDeleteRedirect(rec: any): Promise<void> {
  const meta = typeof rec.target_meta === "string" ? JSON.parse(rec.target_meta) : rec.target_meta;

  const existing = await db("website_builder.redirects")
    .where({ project_id: rec.target_id, from_path: meta.from_path })
    .first();

  if (!existing) {
    await db(RECS_TABLE).where("id", rec.id).update({
      status: "failed",
      execution_result: JSON.stringify({ success: false, error: `Redirect from "${meta.from_path}" not found` }),
    });
    return;
  }

  await redirectsService.deleteRedirect(existing.id);

  await db(RECS_TABLE).where("id", rec.id).update({
    status: "executed",
    execution_result: JSON.stringify({ success: true, deleted_redirect_id: existing.id }),
  });
  console.log(`[AiCommand] ✓ Deleted redirect: ${meta.from_path}`);
}

async function executeUpdatePostMeta(rec: any): Promise<void> {
  const meta = typeof rec.target_meta === "string" ? JSON.parse(rec.target_meta) : rec.target_meta;

  const post = await db(POSTS_TABLE).where("id", meta.post_id).first();
  if (!post) {
    await db(RECS_TABLE).where("id", rec.id).update({
      status: "failed",
      execution_result: JSON.stringify({ success: false, error: `Post ${meta.post_id} not found` }),
    });
    return;
  }

  const updates: Record<string, unknown> = { updated_at: db.fn.now() };
  if (meta.title !== undefined) updates.title = meta.title;
  if (meta.slug !== undefined) updates.slug = meta.slug;
  if (meta.custom_fields !== undefined) updates.custom_fields = JSON.stringify(meta.custom_fields);
  if (meta.featured_image !== undefined) updates.featured_image = meta.featured_image;
  if (meta.status !== undefined) updates.status = meta.status;

  await db(POSTS_TABLE).where("id", meta.post_id).update(updates);

  await db(RECS_TABLE).where("id", rec.id).update({
    status: "executed",
    execution_result: JSON.stringify({ success: true, post_id: meta.post_id }),
  });
  console.log(`[AiCommand] ✓ Updated post meta: ${meta.post_id}`);
}

async function executeUpdatePagePath(rec: any): Promise<void> {
  const meta = typeof rec.target_meta === "string" ? JSON.parse(rec.target_meta) : rec.target_meta;

  const page = await db(PAGES_TABLE).where("id", meta.page_id).first();
  if (!page) {
    await db(RECS_TABLE).where("id", rec.id).update({
      status: "failed",
      execution_result: JSON.stringify({ success: false, error: `Page ${meta.page_id} not found` }),
    });
    return;
  }

  const updates: Record<string, unknown> = { updated_at: db.fn.now() };
  if (meta.new_path !== undefined) updates.path = meta.new_path;

  await db(PAGES_TABLE).where("id", meta.page_id).update(updates);

  await db(RECS_TABLE).where("id", rec.id).update({
    status: "executed",
    execution_result: JSON.stringify({ success: true, page_id: meta.page_id }),
  });
  console.log(`[AiCommand] ✓ Updated page path: ${page.path} → ${meta.new_path}`);
}

// ---------------------------------------------------------------------------
// Context helpers for structural analysis
// ---------------------------------------------------------------------------

async function getExistingPaths(projectId: string): Promise<string[]> {
  const pages = await db(PAGES_TABLE)
    .where({ project_id: projectId })
    .whereIn("status", ["draft", "published"])
    .select("path")
    .groupBy("path");
  return pages.map((p: any) => p.path);
}

async function getExistingPostSlugs(
  projectId: string
): Promise<Array<{ slug: string; post_type_slug: string }>> {
  const posts = await db(POSTS_TABLE)
    .where({ project_id: projectId })
    .join(POST_TYPES_TABLE, `${POSTS_TABLE}.post_type_id`, `${POST_TYPES_TABLE}.id`)
    .select(`${POSTS_TABLE}.slug`, `${POST_TYPES_TABLE}.slug as post_type_slug`);
  return posts;
}

async function getProjectPostTypes(
  projectId: string,
  templateId: string | null
): Promise<any[]> {
  if (!templateId) return [];
  return db(POST_TYPES_TABLE).where("template_id", templateId);
}

async function getExistingMenuItems(
  projectId: string
): Promise<Array<{ menu_slug: string; items: Array<{ label: string; url: string }> }>> {
  const { menus } = await menuManager.listMenus(projectId);
  const result: Array<{ menu_slug: string; items: Array<{ label: string; url: string }> }> = [];

  for (const menu of menus) {
    const detail = await menuManager.getMenu(projectId, menu.id);
    const items = flattenMenuItems(detail.menu?.items || []);
    result.push({ menu_slug: menu.slug, items });
  }

  return result;
}

function flattenMenuItems(items: any[]): Array<{ label: string; url: string }> {
  const flat: Array<{ label: string; url: string }> = [];
  for (const item of items) {
    flat.push({ label: item.label, url: item.url });
    if (item.children?.length) {
      flat.push(...flattenMenuItems(item.children));
    }
  }
  return flat;
}
