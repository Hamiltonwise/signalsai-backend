/**
 * Admin Websites API Routes
 *
 * Portal to manage website-builder data from the admin panel.
 * Reads/writes to the website_builder schema tables.
 */

import express, { Request, Response } from "express";
import { db } from "../../database/connection";
import importsRouter from "./imports";
import * as cheerio from "cheerio";
import sanitizeHtml from "sanitize-html";
import fs from "fs";
import path from "path";

const router = express.Router();

// Schema prefix for website_builder tables
const PROJECTS_TABLE = "website_builder.projects";
const PAGES_TABLE = "website_builder.pages";
const TEMPLATES_TABLE = "website_builder.templates";
const TEMPLATE_PAGES_TABLE = "website_builder.template_pages";
const HFC_TABLE = "website_builder.header_footer_code";

// =====================================================================
// Helper: Normalize sections (handles both [...] and {sections: [...]} from N8N)
// =====================================================================
function normalizeSections(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (
    raw &&
    typeof raw === "object" &&
    "sections" in (raw as Record<string, unknown>) &&
    Array.isArray((raw as Record<string, unknown>).sections)
  ) {
    return (raw as Record<string, unknown>).sections as any[];
  }
  return [];
}

// =====================================================================
// Helper: Generate random hostname
// =====================================================================
function generateHostname(): string {
  const adjectives = [
    "bright",
    "swift",
    "calm",
    "bold",
    "fresh",
    "prime",
    "smart",
    "clear",
  ];
  const nouns = [
    "dental",
    "clinic",
    "care",
    "health",
    "smile",
    "wellness",
    "medical",
    "beauty",
  ];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${adj}-${noun}-${num}`;
}

// =====================================================================
// Helper: Sanitize HTML code snippets
// =====================================================================
function sanitizeCodeSnippet(code: string): { sanitized: string; isValid: boolean; error?: string } {
  try {
    const sanitized = sanitizeHtml(code, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat([
        'script', 'style', 'link', 'meta', 'noscript', 'iframe'
      ]),
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        script: ['src', 'type', 'async', 'defer', 'crossorigin', 'integrity'],
        link: ['rel', 'href', 'type', 'sizes', 'media', 'crossorigin', 'integrity'],
        meta: ['name', 'content', 'property', 'charset', 'http-equiv'],
        iframe: ['src', 'width', 'height', 'frameborder', 'allowfullscreen', 'loading'],
        '*': ['class', 'id', 'data-*']
      },
      allowedSchemes: ['http', 'https', 'mailto', 'tel'],
      allowedSchemesByTag: {
        script: ['https'],
        link: ['https']
      },
      allowVulnerableTags: true
    });

    if (!sanitized.trim()) {
      return { sanitized: '', isValid: false, error: 'Code cannot be empty' };
    }

    return { sanitized, isValid: true };
  } catch (error: any) {
    return { sanitized: '', isValid: false, error: error.message || 'Invalid HTML' };
  }
}

// =====================================================================
// PROJECTS
// =====================================================================

/**
 * GET /api/admin/websites
 * List all website projects with pagination
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { status, page = "1", limit = "50" } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    console.log("[Admin Websites] Fetching projects with filters:", req.query);

    // Build count query
    let countQuery = db(PROJECTS_TABLE);
    if (status) {
      countQuery = countQuery.where("status", status);
    }

    const [{ count }] = await countQuery.count("* as count");
    const total = parseInt(count as string, 10);
    const totalPages = Math.ceil(total / limitNum);

    // Build data query with organization LEFT JOIN
    let dataQuery = db(PROJECTS_TABLE)
      .leftJoin("organizations", `${PROJECTS_TABLE}.organization_id`, "organizations.id")
      .select(
        `${PROJECTS_TABLE}.id`,
        `${PROJECTS_TABLE}.user_id`,
        `${PROJECTS_TABLE}.generated_hostname`,
        `${PROJECTS_TABLE}.status`,
        `${PROJECTS_TABLE}.selected_place_id`,
        `${PROJECTS_TABLE}.selected_website_url`,
        `${PROJECTS_TABLE}.template_id`,
        `${PROJECTS_TABLE}.step_gbp_scrape`,
        `${PROJECTS_TABLE}.created_at`,
        `${PROJECTS_TABLE}.updated_at`,
        db.raw("json_build_object('id', organizations.id, 'name', organizations.name, 'subscription_tier', organizations.subscription_tier) as organization")
      );

    if (status) {
      dataQuery = dataQuery.where(`${PROJECTS_TABLE}.status`, status);
    }

    const projects = await dataQuery
      .orderBy(`${PROJECTS_TABLE}.created_at`, "desc")
      .limit(limitNum)
      .offset(offset);

    // Parse organization JSON (will be null if not linked)
    const projectsWithOrg = projects.map((p) => ({
      ...p,
      organization: p.organization && p.organization.id ? p.organization : null,
    }));

    console.log(
      `[Admin Websites] Found ${projectsWithOrg.length} of ${total} projects (page ${pageNum})`
    );

    return res.json({
      success: true,
      data: projectsWithOrg,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
      },
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching projects:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch projects",
    });
  }
});

/**
 * POST /api/admin/websites
 * Create a new website project
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { user_id, hostname } = req.body;

    const generatedHostname = hostname || generateHostname();
    const userId = user_id || "admin-portal";

    console.log(
      `[Admin Websites] Creating project with hostname: ${generatedHostname}`
    );

    const [project] = await db(PROJECTS_TABLE)
      .insert({
        user_id: userId,
        generated_hostname: generatedHostname,
        status: "CREATED",
      })
      .returning("*");

    console.log(`[Admin Websites] ✓ Created project ID: ${project.id}`);

    return res.status(201).json({
      success: true,
      data: project,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error creating project:", error);
    return res.status(500).json({
      success: false,
      error: "CREATE_ERROR",
      message: error?.message || "Failed to create project",
    });
  }
});

/**
 * GET /api/admin/websites/statuses
 * Get unique statuses for filter dropdown
 */
router.get("/statuses", async (_req: Request, res: Response) => {
  try {
    console.log("[Admin Websites] Fetching unique statuses");

    const statuses = await db(PROJECTS_TABLE)
      .distinct("status")
      .whereNotNull("status")
      .orderBy("status", "asc");

    const statusList = statuses.map((s) => s.status);

    console.log(`[Admin Websites] Found ${statusList.length} unique statuses`);

    return res.json({
      success: true,
      statuses: statusList,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching statuses:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch statuses",
    });
  }
});

// =====================================================================
// STATUS POLLING
// =====================================================================

/**
 * GET /api/admin/websites/:id/status
 * Lightweight status polling — returns only status-relevant fields
 */
router.get("/:id/status", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const project = await db(PROJECTS_TABLE)
      .select(
        "id",
        "status",
        "selected_place_id",
        "selected_website_url",
        "step_gbp_scrape",
        "step_website_scrape",
        "step_image_analysis",
        "updated_at"
      )
      .where("id", id)
      .first();

    if (!project) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Project not found",
      });
    }

    return res.json(project);
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching project status:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch project status",
    });
  }
});

// =====================================================================
// ORGANIZATION LINKING
// =====================================================================

/**
 * PATCH /api/admin/websites/:id/link-organization
 * Link or unlink a website to/from an organization
 * Body: { organizationId: number | null }
 */
router.patch("/:id/link-organization", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.body;

    console.log(`[Admin Websites] Linking/unlinking project ${id} to organization ${organizationId}`);

    // Validate project exists
    const project = await db(PROJECTS_TABLE).where("id", id).first();
    if (!project) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Project not found",
      });
    }

    // If unlinking (organizationId is null)
    if (organizationId === null) {
      console.log(`[Admin Websites] Unlinking project ${id}`);
      await db(PROJECTS_TABLE)
        .where("id", id)
        .update({ organization_id: null, updated_at: db.fn.now() });

      const [updatedProject] = await db(PROJECTS_TABLE)
        .where("id", id)
        .returning("*");

      console.log(`[Admin Websites] ✓ Unlinked project ${id}`);
      return res.json({
        success: true,
        data: updatedProject,
      });
    }

    // If linking (organizationId is provided)
    if (typeof organizationId !== "number") {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "organizationId must be a number or null",
      });
    }

    // Validate organization exists
    const organization = await db("organizations").where("id", organizationId).first();
    if (!organization) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Organization not found",
      });
    }

    // Validate organization is DFY tier
    if (organization.subscription_tier !== "DFY") {
      return res.status(400).json({
        success: false,
        error: "INVALID_TIER",
        message: "Only DFY organizations can have websites",
      });
    }

    // Check if organization is already linked to another website
    const existingLink = await db(PROJECTS_TABLE)
      .where("organization_id", organizationId)
      .whereNot("id", id)
      .first();

    if (existingLink) {
      return res.status(400).json({
        success: false,
        error: "ALREADY_LINKED",
        message: "Organization already linked to another website",
      });
    }

    // Link the website to the organization
    console.log(`[Admin Websites] Linking project ${id} to organization ${organizationId}`);
    await db(PROJECTS_TABLE)
      .where("id", id)
      .update({ organization_id: organizationId, updated_at: db.fn.now() });

    const [updatedProject] = await db(PROJECTS_TABLE)
      .where("id", id)
      .returning("*");

    console.log(`[Admin Websites] ✓ Linked project ${id} to organization ${organizationId}`);
    return res.json({
      success: true,
      data: updatedProject,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error linking organization:", error);
    return res.status(500).json({
      success: false,
      error: "LINK_ERROR",
      message: error?.message || "Failed to link organization",
    });
  }
});

// =====================================================================
// TEMPLATES
// =====================================================================

/**
 * GET /api/admin/websites/templates
 * Get all templates
 */
router.get("/templates", async (_req: Request, res: Response) => {
  try {
    console.log("[Admin Websites] Fetching templates");

    const templates = await db(TEMPLATES_TABLE).orderBy("created_at", "desc");

    console.log(`[Admin Websites] Found ${templates.length} templates`);

    return res.json({
      success: true,
      data: templates,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching templates:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch templates",
    });
  }
});

/**
 * POST /api/admin/websites/templates
 * Create a new template
 */
router.post("/templates", async (req: Request, res: Response) => {
  try {
    const { name, wrapper, header, footer, is_active = false } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "name is required",
      });
    }

    // Validate wrapper contains {{slot}} if provided
    if (wrapper && !wrapper.includes("{{slot}}")) {
      return res.status(400).json({
        success: false,
        error: "INVALID_WRAPPER",
        message: "Wrapper must contain the {{slot}} placeholder where page content should be injected.",
      });
    }

    console.log(`[Admin Websites] Creating template: ${name}`);

    // If setting as active, deactivate all others
    if (is_active) {
      await db(TEMPLATES_TABLE)
        .where({ is_active: true })
        .update({ is_active: false, updated_at: db.fn.now() });
    }

    const [template] = await db(TEMPLATES_TABLE)
      .insert({
        name,
        wrapper: wrapper || "",
        header: header || "",
        footer: footer || "",
        status: "draft",
        is_active,
      })
      .returning("*");

    console.log(`[Admin Websites] ✓ Created template ID: ${template.id}`);

    return res.status(201).json({
      success: true,
      data: template,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error creating template:", error);
    return res.status(500).json({
      success: false,
      error: "CREATE_ERROR",
      message: error?.message || "Failed to create template",
    });
  }
});

// =====================================================================
// TEMPLATE PAGES
// =====================================================================

/**
 * GET /api/admin/websites/templates/:templateId/pages
 * Fetch all pages for a template
 */
router.get("/templates/:templateId/pages", async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;

    console.log(`[Admin Websites] Fetching template pages for template ID: ${templateId}`);

    const template = await db(TEMPLATES_TABLE).where("id", templateId).first();
    if (!template) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Template not found",
      });
    }

    const pages = await db(TEMPLATE_PAGES_TABLE)
      .where("template_id", templateId)
      .orderBy("created_at", "asc");

    return res.json({
      success: true,
      data: pages,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching template pages:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch template pages",
    });
  }
});

/**
 * POST /api/admin/websites/templates/:templateId/pages
 * Create a new template page
 */
router.post("/templates/:templateId/pages", async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const { name, sections } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "name is required",
      });
    }

    console.log(`[Admin Websites] Creating template page for template ID: ${templateId}`);

    const template = await db(TEMPLATES_TABLE).where("id", templateId).first();
    if (!template) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Template not found",
      });
    }

    const [page] = await db(TEMPLATE_PAGES_TABLE)
      .insert({
        template_id: templateId,
        name,
        sections: JSON.stringify(sections || []),
      })
      .returning("*");

    console.log(`[Admin Websites] ✓ Created template page ID: ${page.id}`);

    return res.status(201).json({
      success: true,
      data: page,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error creating template page:", error);
    return res.status(500).json({
      success: false,
      error: "CREATE_ERROR",
      message: error?.message || "Failed to create template page",
    });
  }
});

/**
 * GET /api/admin/websites/templates/:templateId/pages/:pageId
 * Get a single template page
 */
router.get("/templates/:templateId/pages/:pageId", async (req: Request, res: Response) => {
  try {
    const { templateId, pageId } = req.params;

    console.log(`[Admin Websites] Fetching template page ID: ${pageId}`);

    const page = await db(TEMPLATE_PAGES_TABLE)
      .where({ id: pageId, template_id: templateId })
      .first();

    if (!page) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Template page not found",
      });
    }

    return res.json({
      success: true,
      data: page,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching template page:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch template page",
    });
  }
});

/**
 * PATCH /api/admin/websites/templates/:templateId/pages/:pageId
 * Update a template page
 */
router.patch("/templates/:templateId/pages/:pageId", async (req: Request, res: Response) => {
  try {
    const { templateId, pageId } = req.params;
    const updates = req.body;

    console.log(`[Admin Websites] Updating template page ID: ${pageId}`);

    const existing = await db(TEMPLATE_PAGES_TABLE)
      .where({ id: pageId, template_id: templateId })
      .first();

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Template page not found",
      });
    }

    delete updates.id;
    delete updates.template_id;
    delete updates.created_at;

    // Stringify JSONB fields for pg driver compatibility
    if (updates.sections !== undefined) {
      updates.sections = JSON.stringify(updates.sections);
    }

    const [page] = await db(TEMPLATE_PAGES_TABLE)
      .where({ id: pageId, template_id: templateId })
      .update({
        ...updates,
        updated_at: db.fn.now(),
      })
      .returning("*");

    console.log(`[Admin Websites] ✓ Updated template page ID: ${pageId}`);

    return res.json({
      success: true,
      data: page,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating template page:", error);
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update template page",
    });
  }
});

/**
 * DELETE /api/admin/websites/templates/:templateId/pages/:pageId
 * Delete a template page
 */
router.delete("/templates/:templateId/pages/:pageId", async (req: Request, res: Response) => {
  try {
    const { templateId, pageId } = req.params;

    console.log(`[Admin Websites] Deleting template page ID: ${pageId}`);

    const existing = await db(TEMPLATE_PAGES_TABLE)
      .where({ id: pageId, template_id: templateId })
      .first();

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Template page not found",
      });
    }

    await db(TEMPLATE_PAGES_TABLE)
      .where({ id: pageId, template_id: templateId })
      .del();

    console.log(`[Admin Websites] ✓ Deleted template page ID: ${pageId}`);

    return res.json({
      success: true,
      message: "Template page deleted successfully",
      data: { id: pageId },
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting template page:", error);
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to delete template page",
    });
  }
});

/**
 * GET /api/admin/websites/templates/:templateId
 * Get a single template (with template pages)
 */
router.get("/templates/:templateId", async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;

    console.log(`[Admin Websites] Fetching template ID: ${templateId}`);

    const template = await db(TEMPLATES_TABLE).where("id", templateId).first();

    if (!template) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Template not found",
      });
    }

    const templatePages = await db(TEMPLATE_PAGES_TABLE)
      .where("template_id", templateId)
      .orderBy("created_at", "asc");

    return res.json({
      success: true,
      data: {
        ...template,
        template_pages: templatePages,
      },
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching template:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch template",
    });
  }
});

/**
 * PATCH /api/admin/websites/templates/:templateId
 * Update a template
 */
router.patch("/templates/:templateId", async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const updates = req.body;

    console.log(`[Admin Websites] Updating template ID: ${templateId}`);

    const existing = await db(TEMPLATES_TABLE).where("id", templateId).first();

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Template not found",
      });
    }

    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates.created_at;

    // Validate wrapper contains {{slot}} if being updated
    if (updates.wrapper && !updates.wrapper.includes("{{slot}}")) {
      return res.status(400).json({
        success: false,
        error: "INVALID_WRAPPER",
        message: "Wrapper must contain the {{slot}} placeholder where page content should be injected.",
      });
    }

    const [template] = await db(TEMPLATES_TABLE)
      .where("id", templateId)
      .update({
        ...updates,
        updated_at: db.fn.now(),
      })
      .returning("*");

    console.log(`[Admin Websites] ✓ Updated template ID: ${templateId}`);

    return res.json({
      success: true,
      data: template,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating template:", error);
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update template",
    });
  }
});

/**
 * DELETE /api/admin/websites/templates/:templateId
 * Delete a template
 */
router.delete("/templates/:templateId", async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;

    console.log(`[Admin Websites] Deleting template ID: ${templateId}`);

    const existing = await db(TEMPLATES_TABLE).where("id", templateId).first();

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Template not found",
      });
    }

    await db(TEMPLATES_TABLE).where("id", templateId).del();

    console.log(`[Admin Websites] ✓ Deleted template ID: ${templateId}`);

    return res.json({
      success: true,
      message: "Template deleted successfully",
      data: { id: templateId },
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting template:", error);
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to delete template",
    });
  }
});

/**
 * POST /api/admin/websites/templates/:templateId/activate
 * Set a template as active
 */
router.post("/templates/:templateId/activate", async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;

    console.log(`[Admin Websites] Activating template ID: ${templateId}`);

    const existing = await db(TEMPLATES_TABLE).where("id", templateId).first();

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Template not found",
      });
    }

    // Deactivate all templates
    await db(TEMPLATES_TABLE)
      .where({ is_active: true })
      .update({ is_active: false, updated_at: db.fn.now() });

    // Activate this template
    const [template] = await db(TEMPLATES_TABLE)
      .where("id", templateId)
      .update({ is_active: true, updated_at: db.fn.now() })
      .returning("*");

    console.log(`[Admin Websites] ✓ Activated template ID: ${templateId}`);

    return res.json({
      success: true,
      data: template,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error activating template:", error);
    return res.status(500).json({
      success: false,
      error: "ACTIVATE_ERROR",
      message: error?.message || "Failed to activate template",
    });
  }
});

// =====================================================================
// PAGE EDITOR — SYSTEM PROMPT
// =====================================================================

/**
 * GET /api/admin/websites/editor/system-prompt
 * Fetch the current page editor system prompt from admin_settings
 */
router.get("/editor/system-prompt", async (_req: Request, res: Response) => {
  try {
    const { getPageEditorPrompt } = await import("../../prompts/pageEditorPrompt");
    const prompt = await getPageEditorPrompt();
    return res.json({ success: true, prompt });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching editor system prompt:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch system prompt",
    });
  }
});

// =====================================================================
// PIPELINE
// =====================================================================

/**
 * POST /api/admin/websites/start-pipeline
 * Trigger the N8N webhook to start the website generation pipeline
 */
router.post("/start-pipeline", async (req: Request, res: Response) => {
  try {
    const {
      projectId,
      templateId,
      templatePageId,
      path: pagePath,
      placeId,
      websiteUrl,
      pageContext,
      practiceSearchString,
      businessName,
      formattedAddress,
      city,
      state,
      phone,
      category,
      rating,
      reviewCount,
    } = req.body;

    if (!projectId || !placeId) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "projectId and placeId are required",
      });
    }

    console.log(`[Admin Websites] Starting pipeline for project ID: ${projectId}`);

    // If no templateId provided, get the active template
    let finalTemplateId = templateId;
    if (!finalTemplateId) {
      const activeTemplate = await db(TEMPLATES_TABLE)
        .where("is_active", true)
        .first();
      if (activeTemplate) {
        finalTemplateId = activeTemplate.id;
        console.log(`[Admin Websites] Using active template ID: ${finalTemplateId}`);
      } else {
        // Fallback to first published template
        const firstTemplate = await db(TEMPLATES_TABLE)
          .where("status", "published")
          .first();
        if (firstTemplate) {
          finalTemplateId = firstTemplate.id;
          console.log(`[Admin Websites] Using first published template ID: ${finalTemplateId}`);
        }
      }
    }

    if (!finalTemplateId) {
      console.warn("[Admin Websites] No template available");
      return res.status(400).json({
        success: false,
        error: "NO_TEMPLATE",
        message: "No template available. Please create and publish a template first.",
      });
    }

    const n8nWebhookUrl = process.env.N8N_WEBHOOK_START_PIPELINE;

    if (!n8nWebhookUrl) {
      console.warn("[Admin Websites] N8N_WEBHOOK_START_PIPELINE not configured");
      return res.status(500).json({
        success: false,
        error: "CONFIG_ERROR",
        message: "Pipeline webhook not configured",
      });
    }

    const finalPath = pagePath || "/";

    // Fetch template data to include inline so N8N doesn't need to query the DB
    const template = await db(TEMPLATES_TABLE).where("id", finalTemplateId).first();
    const templatePage = templatePageId
      ? await db(TEMPLATE_PAGES_TABLE).where("id", templatePageId).first()
      : null;

    const templateData = {
      wrapper: template.wrapper,
      header: template.header,
      footer: template.footer,
      sections: normalizeSections(templatePage?.sections),
    };

    console.log(`[Admin Websites] Triggering webhook: ${n8nWebhookUrl}`);
    console.log(`[Admin Websites] Payload:`, {
      projectId,
      templateId: finalTemplateId,
      templatePageId,
      path: finalPath,
      placeId,
      websiteUrl,
      businessName,
    });

    // Trigger the N8N webhook
    const webhookResponse = await fetch(n8nWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        templateId: finalTemplateId,
        templatePageId,
        templateData,
        path: finalPath,
        placeId,
        websiteUrl,
        pageContext,
        practiceSearchString,
        businessName,
        formattedAddress,
        city,
        state,
        phone,
        category,
        rating,
        reviewCount,
      }),
    });

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.error(
        `[Admin Websites] Pipeline webhook failed: ${webhookResponse.status} ${webhookResponse.statusText}`,
        errorText
      );
      return res.status(500).json({
        success: false,
        error: "WEBHOOK_ERROR",
        message: "Failed to trigger pipeline",
      });
    }

    console.log(`[Admin Websites] ✓ Pipeline triggered for project ID: ${projectId}`);

    return res.json({
      success: true,
      message: "Pipeline started successfully",
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error starting pipeline:", error);
    return res.status(500).json({
      success: false,
      error: "PIPELINE_ERROR",
      message: error?.message || "Failed to start pipeline",
    });
  }
});

// =====================================================================
// WEBSITE SCRAPE
// =====================================================================

// Logger for website scraping operations
const LOG_DIR = path.join(__dirname, "../logs");
const SCRAPE_LOG_FILE = path.join(LOG_DIR, "website-scrape.log");

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const scrapeLogger = {
  _write(level: string, message: string, data?: Record<string, unknown>) {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` | ${JSON.stringify(data)}` : "";
    const line = `[${timestamp}] [SCRAPE] [${level}] ${message}${dataStr}\n`;
    try {
      fs.appendFileSync(SCRAPE_LOG_FILE, line);
    } catch {
      // Ignore write errors
    }
  },
  info(msg: string, data?: Record<string, unknown>) { this._write("INFO", msg, data); },
  error(msg: string, data?: Record<string, unknown>) { this._write("ERROR", msg, data); },
  warn(msg: string, data?: Record<string, unknown>) { this._write("WARN", msg, data); },
};

// Scrape helpers
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

function toAbsoluteUrl(href: string, baseUrl: string): string | null {
  try {
    if (href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:") || href.startsWith("#")) {
      return null;
    }
    return new URL(href, baseUrl).href;
  } catch {
    return null;
  }
}

function isInternalUrl(url: string, baseUrl: string): boolean {
  try {
    return new URL(url).hostname === new URL(baseUrl).hostname;
  } catch {
    return false;
  }
}

function getPageName(url: string): string {
  try {
    const urlPath = new URL(url).pathname;
    if (urlPath === "/" || urlPath === "") return "home";
    const segments = urlPath.split("/").filter(Boolean);
    const last = segments[segments.length - 1] || "page";
    return last.replace(/\.(html?|php|aspx?)$/i, "").toLowerCase();
  } catch {
    return "page";
  }
}

function isValidImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  const exts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif"];
  if (exts.some((ext) => lower.includes(ext))) return true;
  if (lower.includes("/images/") || lower.includes("/img/") || lower.includes("/media/")) return true;
  return false;
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AlloroBot/1.0; +https://getalloro.com)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    const ct = response.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return null;
    return await response.text();
  } catch (error) {
    scrapeLogger.error(`Failed to fetch ${url}`, { error: String(error) });
    return null;
  }
}

function extractInternalLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const links = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const abs = toAbsoluteUrl(href, baseUrl);
    if (abs && isInternalUrl(abs, baseUrl)) {
      try {
        const u = new URL(abs);
        u.hash = "";
        links.add(u.origin + u.pathname);
      } catch { /* skip */ }
    }
  });
  return Array.from(links);
}

function extractImages(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const images = new Set<string>();

  $("img[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (src) {
      const abs = toAbsoluteUrl(src, baseUrl);
      if (abs && isValidImageUrl(abs)) images.add(abs);
    }
  });

  $("img[srcset]").each((_, el) => {
    const srcset = $(el).attr("srcset");
    if (srcset) {
      srcset.split(",").map((s) => s.trim().split(/\s+/)[0]).forEach((url) => {
        const abs = toAbsoluteUrl(url, baseUrl);
        if (abs && isValidImageUrl(abs)) images.add(abs);
      });
    }
  });

  $('[style*="background"]').each((_, el) => {
    const style = $(el).attr("style") || "";
    const match = style.match(/url\(['"]?([^'")\s]+)['"]?\)/);
    if (match && match[1]) {
      const abs = toAbsoluteUrl(match[1], baseUrl);
      if (abs && isValidImageUrl(abs)) images.add(abs);
    }
  });

  return Array.from(images);
}

/**
 * POST /api/admin/websites/scrape
 * Scrape a website for multi-page HTML content + images (for AI website generation)
 * Auth: x-scraper-key header
 */
router.post("/scrape", async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    // Validate scraper API key
    const scraperKey = req.headers["x-scraper-key"];
    const expectedKey = process.env.SCRAPER_API_KEY;
    if (expectedKey && scraperKey !== expectedKey) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const { url } = req.body;

    if (!url || typeof url !== "string") {
      return res.status(400).json({ success: false, error: "URL is required" });
    }

    let baseUrl: string;
    try {
      baseUrl = new URL(url).origin;
    } catch {
      return res.status(400).json({ success: false, error: "Invalid URL" });
    }

    scrapeLogger.info("Starting scrape", { url, baseUrl });

    // Fetch home page
    const homeHtml = await fetchPage(url);
    if (!homeHtml) {
      scrapeLogger.error("Failed to fetch home page", { url });
      return res.status(500).json({ success: false, error: "Failed to fetch home page" });
    }

    // Extract internal links
    const internalLinks = extractInternalLinks(homeHtml, baseUrl);
    scrapeLogger.info("Found internal links", { count: internalLinks.length });

    const pages: Record<string, string> = {};
    const homeImages: string[] = [];
    const otherImages: string[] = [];

    pages["home"] = homeHtml;
    homeImages.push(...extractImages(homeHtml, baseUrl));

    // Fetch linked pages (max 10)
    const linksToFetch = internalLinks.slice(0, 10);
    await Promise.all(
      linksToFetch.map(async (link) => {
        const html = await fetchPage(link);
        if (html) {
          const pageName = getPageName(link);
          const uniqueName = pages[pageName] ? `${pageName}-${Date.now()}` : pageName;
          pages[uniqueName] = html;
          otherImages.push(...extractImages(html, baseUrl));
        }
      })
    );

    // Deduplicate and cap images at 10
    const uniqueHomeImages = [...new Set(homeImages)];
    const uniqueOtherImages = [...new Set(otherImages)].filter((img) => !uniqueHomeImages.includes(img));

    let selectedImages: string[];
    if (uniqueHomeImages.length >= 10) {
      selectedImages = [...uniqueHomeImages].sort(() => Math.random() - 0.5).slice(0, 10);
    } else {
      const remaining = 10 - uniqueHomeImages.length;
      const otherSelected = [...uniqueOtherImages].sort(() => Math.random() - 0.5).slice(0, remaining);
      selectedImages = [...uniqueHomeImages, ...otherSelected];
    }

    const allContent = Object.values(pages).join("");
    const charLength = allContent.length;
    const tokens = estimateTokens(allContent);
    const elapsedMs = Date.now() - startTime;

    scrapeLogger.info("Scrape completed", {
      baseUrl,
      pagesScraped: Object.keys(pages).length,
      homepageImages: uniqueHomeImages.length,
      otherImages: uniqueOtherImages.length,
      selectedImages: selectedImages.length,
      charLength,
      estimatedTokens: tokens,
      elapsedMs,
    });

    return res.json({
      success: true,
      baseUrl,
      pages,
      images: selectedImages,
      elapsedMs,
      charLength,
      estimatedTokens: tokens,
    });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : "Unknown error";
    scrapeLogger.error("Scrape failed", { error: message });
    return res.status(500).json({ success: false, error: message });
  }
});

// =====================================================================
// IMPORTS (sub-router — must come before parameterized /:id routes)
// =====================================================================

router.use("/imports", importsRouter);

// =====================================================================
// PROJECTS (parameterized routes - must come after literal paths)
// =====================================================================

/**
 * GET /api/admin/websites/:id
 * Get a single project with its pages
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    console.log(`[Admin Websites] Fetching project ID: ${id}`);

    const project = await db(PROJECTS_TABLE)
      .leftJoin("organizations", `${PROJECTS_TABLE}.organization_id`, "organizations.id")
      .select(
        `${PROJECTS_TABLE}.*`,
        db.raw("json_build_object('id', organizations.id, 'name', organizations.name, 'subscription_tier', organizations.subscription_tier) as organization")
      )
      .where(`${PROJECTS_TABLE}.id`, id)
      .first();

    if (!project) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Project not found",
      });
    }

    // Parse organization JSON (will be null if not linked)
    const organization = project.organization && project.organization.id ? project.organization : null;

    // Get pages for this project
    const pages = await db(PAGES_TABLE)
      .where("project_id", id)
      .orderBy("path", "asc")
      .orderBy("version", "desc");

    console.log(`[Admin Websites] Found project with ${pages.length} pages`);

    return res.json({
      success: true,
      data: {
        ...project,
        organization,
        pages,
      },
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching project:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch project",
    });
  }
});

/**
 * PATCH /api/admin/websites/:id
 * Update a project
 */
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    console.log(`[Admin Websites] Updating project ID: ${id}`, updates);

    // Check if project exists
    const existing = await db(PROJECTS_TABLE).where("id", id).first();

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Project not found",
      });
    }

    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates.created_at;

    // Validate wrapper contains {{slot}} if being updated
    if (updates.wrapper && !updates.wrapper.includes("{{slot}}")) {
      return res.status(400).json({
        success: false,
        error: "INVALID_WRAPPER",
        message: "Wrapper must contain the {{slot}} placeholder where page content should be injected.",
      });
    }

    const [project] = await db(PROJECTS_TABLE)
      .where("id", id)
      .update({
        ...updates,
        updated_at: db.fn.now(),
      })
      .returning("*");

    console.log(`[Admin Websites] ✓ Updated project ID: ${id}`);

    return res.json({
      success: true,
      data: project,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating project:", error);
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update project",
    });
  }
});

/**
 * DELETE /api/admin/websites/:id
 * Delete a project (cascades to pages)
 */
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    console.log(`[Admin Websites] Deleting project ID: ${id}`);

    // Check if project exists
    const existing = await db(PROJECTS_TABLE).where("id", id).first();

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Project not found",
      });
    }

    // Delete project (pages will cascade)
    await db(PROJECTS_TABLE).where("id", id).del();

    console.log(`[Admin Websites] ✓ Deleted project ID: ${id}`);

    return res.json({
      success: true,
      message: "Project deleted successfully",
      data: { id },
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting project:", error);
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to delete project",
    });
  }
});

// =====================================================================
// PAGES
// =====================================================================

/**
 * GET /api/admin/websites/:id/pages
 * Get all pages for a project
 */
router.get("/:id/pages", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { path } = req.query;

    console.log(`[Admin Websites] Fetching pages for project ID: ${id}`);

    let query = db(PAGES_TABLE).where("project_id", id);

    if (path) {
      query = query.where("path", path);
    }

    const pages = await query.orderBy("path", "asc").orderBy("version", "desc");

    console.log(`[Admin Websites] Found ${pages.length} pages`);

    return res.json({
      success: true,
      data: pages,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching pages:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch pages",
    });
  }
});

/**
 * POST /api/admin/websites/:id/pages
 * Create a new page version
 */
router.post("/:id/pages", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { path = "/", sections, publish = false } = req.body;

    if (!sections) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "sections is required",
      });
    }

    console.log(
      `[Admin Websites] Creating page for project ID: ${id}, path: ${path}`
    );

    // Get latest version for this project+path
    const latestPage = await db(PAGES_TABLE)
      .where({ project_id: id, path })
      .orderBy("version", "desc")
      .first();

    const newVersion = latestPage ? latestPage.version + 1 : 1;

    // Mark existing drafts as inactive
    await db(PAGES_TABLE)
      .where({ project_id: id, path, status: "draft" })
      .update({ status: "inactive", updated_at: db.fn.now() });

    // Create new page
    const [page] = await db(PAGES_TABLE)
      .insert({
        project_id: id,
        path,
        version: newVersion,
        status: publish ? "published" : "draft",
        sections: JSON.stringify(sections),
      })
      .returning("*");

    // If publishing, mark previous published as inactive
    if (publish) {
      await db(PAGES_TABLE)
        .where({ project_id: id, path, status: "published" })
        .whereNot("id", page.id)
        .update({ status: "inactive", updated_at: db.fn.now() });
    }

    console.log(
      `[Admin Websites] ✓ Created page ID: ${page.id}, version: ${newVersion}`
    );

    return res.status(201).json({
      success: true,
      data: page,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error creating page:", error);
    return res.status(500).json({
      success: false,
      error: "CREATE_ERROR",
      message: error?.message || "Failed to create page",
    });
  }
});

/**
 * POST /api/admin/websites/:id/pages/:pageId/publish
 * Publish a page
 */
router.post("/:id/pages/:pageId/publish", async (req: Request, res: Response) => {
  try {
    const { id, pageId } = req.params;

    console.log(
      `[Admin Websites] Publishing page ID: ${pageId} for project ID: ${id}`
    );

    // Get the page
    const page = await db(PAGES_TABLE).where("id", pageId).first();

    if (!page) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Page not found",
      });
    }

    // Unpublish any currently published page for this project+path
    await db(PAGES_TABLE)
      .where({ project_id: page.project_id, path: page.path, status: "published" })
      .update({ status: "inactive", updated_at: db.fn.now() });

    // Publish this page
    const [publishedPage] = await db(PAGES_TABLE)
      .where("id", pageId)
      .update({ status: "published", updated_at: db.fn.now() })
      .returning("*");

    console.log(`[Admin Websites] ✓ Published page ID: ${pageId}`);

    return res.json({
      success: true,
      data: publishedPage,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error publishing page:", error);
    return res.status(500).json({
      success: false,
      error: "PUBLISH_ERROR",
      message: error?.message || "Failed to publish page",
    });
  }
});

/**
 * GET /api/admin/websites/:id/pages/:pageId
 * Get a single page by ID
 */
router.get("/:id/pages/:pageId", async (req: Request, res: Response) => {
  try {
    const { id, pageId } = req.params;

    console.log(`[Admin Websites] Fetching page ID: ${pageId} for project ID: ${id}`);

    const page = await db(PAGES_TABLE)
      .where({ id: pageId, project_id: id })
      .first();

    if (!page) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Page not found",
      });
    }

    return res.json({
      success: true,
      data: page,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching page:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch page",
    });
  }
});

/**
 * PATCH /api/admin/websites/:id/pages/:pageId
 * Update a draft page's sections and/or chat history
 */
router.patch("/:id/pages/:pageId", async (req: Request, res: Response) => {
  try {
    const { id, pageId } = req.params;
    const { sections, edit_chat_history } = req.body;

    if (!sections && edit_chat_history === undefined) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "sections or edit_chat_history is required",
      });
    }

    console.log(`[Admin Websites] Updating page ID: ${pageId} for project ID: ${id}`);

    const page = await db(PAGES_TABLE)
      .where({ id: pageId, project_id: id })
      .first();

    if (!page) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Page not found",
      });
    }

    if (page.status !== "draft") {
      return res.status(400).json({
        success: false,
        error: "INVALID_STATUS",
        message: "Only draft pages can be edited",
      });
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: db.fn.now(),
    };

    if (sections) {
      updatePayload.sections = JSON.stringify(sections);
    }

    if (edit_chat_history !== undefined) {
      updatePayload.edit_chat_history = JSON.stringify(edit_chat_history);
    }

    const [updatedPage] = await db(PAGES_TABLE)
      .where("id", pageId)
      .update(updatePayload)
      .returning("*");

    console.log(`[Admin Websites] ✓ Updated page ID: ${pageId}`);

    return res.json({
      success: true,
      data: updatedPage,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating page:", error);
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update page",
    });
  }
});

/**
 * DELETE /api/admin/websites/:id/pages/by-path?path=/about
 * Delete ALL versions of a page at a given path
 */
router.delete("/:id/pages/by-path", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const path = req.query.path as string | undefined;

    if (!path) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "path query parameter is required",
      });
    }

    console.log(`[Admin Websites] Deleting all versions at path "${path}" for project ID: ${id}`);

    const pages = await db(PAGES_TABLE)
      .where({ project_id: id, path })
      .select("id");

    if (pages.length === 0) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: `No pages found at path "${path}"`,
      });
    }

    const deletedCount = await db(PAGES_TABLE)
      .where({ project_id: id, path })
      .del();

    console.log(`[Admin Websites] ✓ Deleted ${deletedCount} version(s) at path "${path}"`);

    return res.json({
      success: true,
      message: `Deleted ${deletedCount} version(s) at path "${path}"`,
      data: { path, deletedCount },
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting page by path:", error);
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to delete page",
    });
  }
});

/**
 * DELETE /api/admin/websites/:id/pages/:pageId
 * Delete a page version (cannot delete published or the last remaining version)
 */
router.delete("/:id/pages/:pageId", async (req: Request, res: Response) => {
  try {
    const { id, pageId } = req.params;

    console.log(`[Admin Websites] Deleting page ID: ${pageId} for project ID: ${id}`);

    const page = await db(PAGES_TABLE)
      .where({ id: pageId, project_id: id })
      .first();

    if (!page) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Page not found",
      });
    }

    if (page.status === "published") {
      return res.status(400).json({
        success: false,
        error: "INVALID_STATUS",
        message: "Cannot delete a published page version",
      });
    }

    // Check if this is the last remaining version for this path
    const siblingCount = await db(PAGES_TABLE)
      .where({ project_id: id, path: page.path })
      .count("* as count")
      .first();

    if (siblingCount && parseInt(siblingCount.count as string, 10) <= 1) {
      return res.status(400).json({
        success: false,
        error: "LAST_VERSION",
        message: "Cannot delete the only remaining version of a page",
      });
    }

    await db(PAGES_TABLE).where("id", pageId).del();

    console.log(`[Admin Websites] ✓ Deleted page ID: ${pageId}`);

    return res.json({
      success: true,
      message: "Page version deleted successfully",
      data: { id: pageId },
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting page:", error);
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to delete page version",
    });
  }
});

/**
 * POST /api/admin/websites/:id/pages/:pageId/create-draft
 * Clone a published page into a new draft version for editing.
 * Idempotent: returns existing draft if one already exists for the same path.
 */
router.post("/:id/pages/:pageId/create-draft", async (req: Request, res: Response) => {
  try {
    const { id, pageId } = req.params;

    console.log(`[Admin Websites] Creating draft from page ID: ${pageId} for project ID: ${id}`);

    const sourcePage = await db(PAGES_TABLE)
      .where({ id: pageId, project_id: id })
      .first();

    if (!sourcePage) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Source page not found",
      });
    }

    if (sourcePage.status !== "published") {
      return res.status(400).json({
        success: false,
        error: "INVALID_STATUS",
        message: "Can only create drafts from published pages",
      });
    }

    // Check if a draft already exists for this project+path (idempotent)
    const existingDraft = await db(PAGES_TABLE)
      .where({ project_id: id, path: sourcePage.path, status: "draft" })
      .first();

    if (existingDraft) {
      console.log(`[Admin Websites] Returning existing draft ID: ${existingDraft.id}`);
      return res.json({
        success: true,
        data: existingDraft,
      });
    }

    // Get latest version number
    const latestPage = await db(PAGES_TABLE)
      .where({ project_id: id, path: sourcePage.path })
      .orderBy("version", "desc")
      .first();

    const newVersion = latestPage ? latestPage.version + 1 : 1;

    // Create the draft
    const [draftPage] = await db(PAGES_TABLE)
      .insert({
        project_id: id,
        path: sourcePage.path,
        version: newVersion,
        status: "draft",
        sections: JSON.stringify(normalizeSections(sourcePage.sections)),
      })
      .returning("*");

    console.log(`[Admin Websites] ✓ Created draft page ID: ${draftPage.id}, version: ${newVersion}`);

    return res.status(201).json({
      success: true,
      data: draftPage,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error creating draft:", error);
    return res.status(500).json({
      success: false,
      error: "CREATE_ERROR",
      message: error?.message || "Failed to create draft",
    });
  }
});

/**
 * POST /api/admin/websites/:id/pages/:pageId/edit
 * Send an edit instruction to Claude for a specific component
 */
router.post("/:id/pages/:pageId/edit", async (req: Request, res: Response) => {
  try {
    const { id, pageId } = req.params;
    const { alloroClass, currentHtml, instruction, chatHistory } = req.body;

    if (!alloroClass || !currentHtml || !instruction) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "alloroClass, currentHtml, and instruction are required",
      });
    }

    console.log(`[Admin Websites] Edit request for page ${pageId}, class: ${alloroClass}`);

    // Verify page exists and belongs to project
    const page = await db(PAGES_TABLE)
      .where({ id: pageId, project_id: id })
      .first();

    if (!page) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Page not found",
      });
    }

    // Fetch media library for this project to inject into AI context
    const mediaItems = await db("website_builder.media")
      .where({ project_id: id })
      .orderBy("created_at", "desc")
      .select("display_name", "s3_url", "alt_text", "mime_type", "width", "height");

    let mediaContext = "";
    if (mediaItems.length > 0) {
      mediaContext = `\n\n## Available Media Library\n\nYou have access to the following uploaded media for this project. You can reference these images/videos by their URLs in your HTML:\n\n`;
      for (const media of mediaItems) {
        const dimensions = media.width && media.height ? ` (${media.width}x${media.height})` : "";
        const altText = media.alt_text ? ` - ${media.alt_text}` : "";
        mediaContext += `- **${media.display_name}**${altText}${dimensions}\n  URL: ${media.s3_url}\n  Type: ${media.mime_type}\n\n`;
      }
      mediaContext += `**Note:** When inserting images from the media library, use the exact URL provided above. These images are already optimized and hosted on S3.\n`;
    }

    // Import the service lazily to avoid circular deps
    const { editHtmlComponent } = await import("../../services/pageEditorService");

    const result = await editHtmlComponent({
      alloroClass,
      currentHtml,
      instruction,
      chatHistory,
      mediaContext, // Inject media library context
    });

    console.log(`[Admin Websites] ✓ Edit completed for class: ${alloroClass}`);

    return res.json({
      success: true,
      editedHtml: result.editedHtml,
      message: result.message,
      rejected: result.rejected,
      debug: result.debug,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error editing page component:", error);
    return res.status(500).json({
      success: false,
      error: "EDIT_ERROR",
      message: error?.message || "Failed to edit component",
    });
  }
});

// =====================================================================
// LAYOUT EDITOR — AI EDIT
// =====================================================================

/**
 * POST /api/admin/websites/:id/edit-layout
 * Send an edit instruction to Claude for a layout component (header/footer)
 * Same LLM service as page editing, but operates on project-level layout fields.
 */
router.post("/:id/edit-layout", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { alloroClass, currentHtml, instruction, chatHistory } = req.body;

    if (!alloroClass || !currentHtml || !instruction) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "alloroClass, currentHtml, and instruction are required",
      });
    }

    console.log(`[Admin Websites] Layout edit request for project ${id}, class: ${alloroClass}`);

    // Verify project exists
    const project = await db(PROJECTS_TABLE).where("id", id).first();
    if (!project) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Project not found",
      });
    }

    // Fetch media library for this project to inject into AI context
    const mediaItems = await db("website_builder.media")
      .where({ project_id: id })
      .orderBy("created_at", "desc")
      .select("display_name", "s3_url", "alt_text", "mime_type", "width", "height");

    let mediaContext = "";
    if (mediaItems.length > 0) {
      mediaContext = `\n\n## Available Media Library\n\nYou have access to the following uploaded media for this project. You can reference these images/videos by their URLs in your HTML:\n\n`;
      for (const media of mediaItems) {
        const dimensions = media.width && media.height ? ` (${media.width}x${media.height})` : "";
        const altText = media.alt_text ? ` - ${media.alt_text}` : "";
        mediaContext += `- **${media.display_name}**${altText}${dimensions}\n  URL: ${media.s3_url}\n  Type: ${media.mime_type}\n\n`;
      }
      mediaContext += `**Note:** When inserting images from the media library, use the exact URL provided above. These images are already optimized and hosted on S3.\n`;
    }

    const { editHtmlComponent } = await import("../../services/pageEditorService");

    const result = await editHtmlComponent({
      alloroClass,
      currentHtml,
      instruction,
      chatHistory,
      mediaContext, // Inject media library context
    });

    console.log(`[Admin Websites] ✓ Layout edit completed for class: ${alloroClass}`);

    return res.json({
      success: true,
      editedHtml: result.editedHtml,
      message: result.message,
      rejected: result.rejected,
      debug: result.debug,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error editing layout component:", error);
    return res.status(500).json({
      success: false,
      error: "EDIT_ERROR",
      message: error?.message || "Failed to edit layout component",
    });
  }
});

// =====================================================================
// HEADER FOOTER CODE MANAGER (HFCM)
// =====================================================================

/**
 * GET /api/admin/websites/templates/:templateId/code-snippets
 * List all code snippets for a template
 */
router.get("/templates/:templateId/code-snippets", async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;

    console.log(`[HFCM] Fetching code snippets for template: ${templateId}`);

    const snippets = await db(HFC_TABLE)
      .where({ template_id: templateId })
      .orderBy('location', 'asc')
      .orderBy('order_index', 'asc');

    return res.json({
      success: true,
      data: snippets,
    });
  } catch (error: any) {
    console.error("[HFCM] Error fetching template code snippets:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch code snippets",
    });
  }
});

/**
 * POST /api/admin/websites/templates/:templateId/code-snippets
 * Create a new code snippet for a template
 */
router.post("/templates/:templateId/code-snippets", async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const { name, location, code, page_ids = [], order_index = 0 } = req.body;

    // Validate required fields
    if (!name || !location || !code) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: "Name, location, and code are required",
      });
    }

    // Validate location enum
    const validLocations = ['head_start', 'head_end', 'body_start', 'body_end'];
    if (!validLocations.includes(location)) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: `Location must be one of: ${validLocations.join(', ')}`,
      });
    }

    // Sanitize code
    const { sanitized, isValid, error: sanitizeError } = sanitizeCodeSnippet(code);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: sanitizeError || "Invalid HTML code",
      });
    }

    console.log(`[HFCM] Creating template snippet: ${name} at ${location}`);

    const [snippet] = await db(HFC_TABLE)
      .insert({
        template_id: templateId,
        name,
        location,
        code: sanitized,
        page_ids: JSON.stringify(page_ids),
        order_index,
      })
      .returning('*');

    console.log(`[HFCM] ✓ Created template snippet: ${snippet.id}`);

    return res.status(201).json({
      success: true,
      data: snippet,
    });
  } catch (error: any) {
    console.error("[HFCM] Error creating template code snippet:", error);
    return res.status(500).json({
      success: false,
      error: "CREATE_ERROR",
      message: error?.message || "Failed to create code snippet",
    });
  }
});

/**
 * PATCH /api/admin/websites/templates/:templateId/code-snippets/:id
 * Update a code snippet
 */
router.patch("/templates/:templateId/code-snippets/:id", async (req: Request, res: Response) => {
  try {
    const { templateId, id } = req.params;
    const { name, location, code, page_ids, order_index } = req.body;

    // Verify ownership
    const existing = await db(HFC_TABLE).where({ id }).first();
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Code snippet not found",
      });
    }

    if (existing.template_id !== templateId) {
      return res.status(403).json({
        success: false,
        error: "FORBIDDEN",
        message: "This snippet belongs to a different template",
      });
    }

    // Build update object
    const updates: any = { updated_at: db.fn.now() };
    if (name !== undefined) updates.name = name;
    if (location !== undefined) {
      const validLocations = ['head_start', 'head_end', 'body_start', 'body_end'];
      if (!validLocations.includes(location)) {
        return res.status(400).json({
          success: false,
          error: "VALIDATION_ERROR",
          message: `Location must be one of: ${validLocations.join(', ')}`,
        });
      }
      updates.location = location;
    }
    if (code !== undefined) {
      const { sanitized, isValid, error: sanitizeError } = sanitizeCodeSnippet(code);
      if (!isValid) {
        return res.status(400).json({
          success: false,
          error: "VALIDATION_ERROR",
          message: sanitizeError || "Invalid HTML code",
        });
      }
      updates.code = sanitized;
    }
    if (page_ids !== undefined) updates.page_ids = JSON.stringify(page_ids);
    if (order_index !== undefined) updates.order_index = order_index;

    console.log(`[HFCM] Updating template snippet: ${id}`);

    const [updated] = await db(HFC_TABLE)
      .where({ id })
      .update(updates)
      .returning('*');

    console.log(`[HFCM] ✓ Updated template snippet: ${id}`);

    return res.json({
      success: true,
      data: updated,
    });
  } catch (error: any) {
    console.error("[HFCM] Error updating template code snippet:", error);
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update code snippet",
    });
  }
});

/**
 * DELETE /api/admin/websites/templates/:templateId/code-snippets/:id
 * Delete a code snippet
 */
router.delete("/templates/:templateId/code-snippets/:id", async (req: Request, res: Response) => {
  try {
    const { templateId, id } = req.params;

    // Verify ownership
    const existing = await db(HFC_TABLE).where({ id }).first();
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Code snippet not found",
      });
    }

    if (existing.template_id !== templateId) {
      return res.status(403).json({
        success: false,
        error: "FORBIDDEN",
        message: "This snippet belongs to a different template",
      });
    }

    console.log(`[HFCM] Deleting template snippet: ${id} (${existing.name})`);

    await db(HFC_TABLE).where({ id }).delete();

    console.log(`[HFCM] ✓ Deleted template snippet: ${id}`);

    return res.json({
      success: true,
    });
  } catch (error: any) {
    console.error("[HFCM] Error deleting template code snippet:", error);
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to delete code snippet",
    });
  }
});

/**
 * PATCH /api/admin/websites/templates/:templateId/code-snippets/:id/toggle
 * Toggle is_enabled for a code snippet
 */
router.patch("/templates/:templateId/code-snippets/:id/toggle", async (req: Request, res: Response) => {
  try {
    const { templateId, id } = req.params;

    // Verify ownership
    const existing = await db(HFC_TABLE).where({ id }).first();
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Code snippet not found",
      });
    }

    if (existing.template_id !== templateId) {
      return res.status(403).json({
        success: false,
        error: "FORBIDDEN",
        message: "This snippet belongs to a different template",
      });
    }

    const newState = !existing.is_enabled;
    console.log(`[HFCM] Toggling template snippet: ${id} to ${newState ? 'enabled' : 'disabled'}`);

    await db(HFC_TABLE)
      .where({ id })
      .update({ is_enabled: newState, updated_at: db.fn.now() });

    console.log(`[HFCM] ✓ Toggled template snippet: ${id}`);

    return res.json({
      success: true,
      data: { is_enabled: newState },
    });
  } catch (error: any) {
    console.error("[HFCM] Error toggling template code snippet:", error);
    return res.status(500).json({
      success: false,
      error: "TOGGLE_ERROR",
      message: error?.message || "Failed to toggle code snippet",
    });
  }
});

/**
 * PATCH /api/admin/websites/templates/:templateId/code-snippets/reorder
 * Reorder code snippets
 */
router.patch("/templates/:templateId/code-snippets/reorder", async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const { snippetIds } = req.body;

    if (!Array.isArray(snippetIds)) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: "snippetIds must be an array",
      });
    }

    console.log(`[HFCM] Reordering template snippets for template: ${templateId}`);

    // Use transaction for atomic update
    await db.transaction(async (trx) => {
      for (let i = 0; i < snippetIds.length; i++) {
        await trx(HFC_TABLE)
          .where({ id: snippetIds[i], template_id: templateId })
          .update({ order_index: i, updated_at: trx.fn.now() });
      }
    });

    console.log(`[HFCM] ✓ Reordered ${snippetIds.length} template snippets`);

    return res.json({
      success: true,
    });
  } catch (error: any) {
    console.error("[HFCM] Error reordering template code snippets:", error);
    return res.status(500).json({
      success: false,
      error: "REORDER_ERROR",
      message: error?.message || "Failed to reorder code snippets",
    });
  }
});

/**
 * GET /api/admin/websites/:projectId/code-snippets
 * List all code snippets for a project
 */
router.get("/:projectId/code-snippets", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    console.log(`[HFCM] Fetching code snippets for project: ${projectId}`);

    const snippets = await db(HFC_TABLE)
      .where({ project_id: projectId })
      .orderBy('location', 'asc')
      .orderBy('order_index', 'asc');

    return res.json({
      success: true,
      data: snippets,
    });
  } catch (error: any) {
    console.error("[HFCM] Error fetching project code snippets:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch code snippets",
    });
  }
});

/**
 * POST /api/admin/websites/:projectId/code-snippets
 * Create a new code snippet for a project
 */
router.post("/:projectId/code-snippets", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { name, location, code, page_ids = [], order_index = 0 } = req.body;

    // Validate required fields
    if (!name || !location || !code) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: "Name, location, and code are required",
      });
    }

    // Validate location enum
    const validLocations = ['head_start', 'head_end', 'body_start', 'body_end'];
    if (!validLocations.includes(location)) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: `Location must be one of: ${validLocations.join(', ')}`,
      });
    }

    // Sanitize code
    const { sanitized, isValid, error: sanitizeError } = sanitizeCodeSnippet(code);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: sanitizeError || "Invalid HTML code",
      });
    }

    console.log(`[HFCM] Creating project snippet: ${name} at ${location}`);

    const [snippet] = await db(HFC_TABLE)
      .insert({
        project_id: projectId,
        name,
        location,
        code: sanitized,
        page_ids: JSON.stringify(page_ids),
        order_index,
      })
      .returning('*');

    console.log(`[HFCM] ✓ Created project snippet: ${snippet.id}`);

    return res.status(201).json({
      success: true,
      data: snippet,
    });
  } catch (error: any) {
    console.error("[HFCM] Error creating project code snippet:", error);
    return res.status(500).json({
      success: false,
      error: "CREATE_ERROR",
      message: error?.message || "Failed to create code snippet",
    });
  }
});

/**
 * PATCH /api/admin/websites/:projectId/code-snippets/:id
 * Update a project code snippet
 */
router.patch("/:projectId/code-snippets/:id", async (req: Request, res: Response) => {
  try {
    const { projectId, id } = req.params;
    const { name, location, code, page_ids, order_index } = req.body;

    // Verify ownership
    const existing = await db(HFC_TABLE).where({ id }).first();
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Code snippet not found",
      });
    }

    if (existing.project_id !== projectId) {
      return res.status(403).json({
        success: false,
        error: "FORBIDDEN",
        message: "This snippet belongs to a different project",
      });
    }

    // Build update object
    const updates: any = { updated_at: db.fn.now() };
    if (name !== undefined) updates.name = name;
    if (location !== undefined) {
      const validLocations = ['head_start', 'head_end', 'body_start', 'body_end'];
      if (!validLocations.includes(location)) {
        return res.status(400).json({
          success: false,
          error: "VALIDATION_ERROR",
          message: `Location must be one of: ${validLocations.join(', ')}`,
        });
      }
      updates.location = location;
    }
    if (code !== undefined) {
      const { sanitized, isValid, error: sanitizeError } = sanitizeCodeSnippet(code);
      if (!isValid) {
        return res.status(400).json({
          success: false,
          error: "VALIDATION_ERROR",
          message: sanitizeError || "Invalid HTML code",
        });
      }
      updates.code = sanitized;
    }
    if (page_ids !== undefined) updates.page_ids = JSON.stringify(page_ids);
    if (order_index !== undefined) updates.order_index = order_index;

    console.log(`[HFCM] Updating project snippet: ${id}`);

    const [updated] = await db(HFC_TABLE)
      .where({ id })
      .update(updates)
      .returning('*');

    console.log(`[HFCM] ✓ Updated project snippet: ${id}`);

    return res.json({
      success: true,
      data: updated,
    });
  } catch (error: any) {
    console.error("[HFCM] Error updating project code snippet:", error);
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update code snippet",
    });
  }
});

/**
 * DELETE /api/admin/websites/:projectId/code-snippets/:id
 * Delete a project code snippet
 */
router.delete("/:projectId/code-snippets/:id", async (req: Request, res: Response) => {
  try {
    const { projectId, id } = req.params;

    // Verify ownership
    const existing = await db(HFC_TABLE).where({ id }).first();
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Code snippet not found",
      });
    }

    if (existing.project_id !== projectId) {
      return res.status(403).json({
        success: false,
        error: "FORBIDDEN",
        message: "This snippet belongs to a different project",
      });
    }

    console.log(`[HFCM] Deleting project snippet: ${id} (${existing.name})`);

    await db(HFC_TABLE).where({ id }).delete();

    console.log(`[HFCM] ✓ Deleted project snippet: ${id}`);

    return res.json({
      success: true,
    });
  } catch (error: any) {
    console.error("[HFCM] Error deleting project code snippet:", error);
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to delete code snippet",
    });
  }
});

/**
 * PATCH /api/admin/websites/:projectId/code-snippets/:id/toggle
 * Toggle is_enabled for a project code snippet
 */
router.patch("/:projectId/code-snippets/:id/toggle", async (req: Request, res: Response) => {
  try {
    const { projectId, id } = req.params;

    // Verify ownership
    const existing = await db(HFC_TABLE).where({ id }).first();
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Code snippet not found",
      });
    }

    if (existing.project_id !== projectId) {
      return res.status(403).json({
        success: false,
        error: "FORBIDDEN",
        message: "This snippet belongs to a different project",
      });
    }

    const newState = !existing.is_enabled;
    console.log(`[HFCM] Toggling project snippet: ${id} to ${newState ? 'enabled' : 'disabled'}`);

    await db(HFC_TABLE)
      .where({ id })
      .update({ is_enabled: newState, updated_at: db.fn.now() });

    console.log(`[HFCM] ✓ Toggled project snippet: ${id}`);

    return res.json({
      success: true,
      data: { is_enabled: newState },
    });
  } catch (error: any) {
    console.error("[HFCM] Error toggling project code snippet:", error);
    return res.status(500).json({
      success: false,
      error: "TOGGLE_ERROR",
      message: error?.message || "Failed to toggle code snippet",
    });
  }
});

/**
 * PATCH /api/admin/websites/:projectId/code-snippets/reorder
 * Reorder project code snippets
 */
router.patch("/:projectId/code-snippets/reorder", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { snippetIds } = req.body;

    if (!Array.isArray(snippetIds)) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: "snippetIds must be an array",
      });
    }

    console.log(`[HFCM] Reordering project snippets for project: ${projectId}`);

    // Use transaction for atomic update
    await db.transaction(async (trx) => {
      for (let i = 0; i < snippetIds.length; i++) {
        await trx(HFC_TABLE)
          .where({ id: snippetIds[i], project_id: projectId })
          .update({ order_index: i, updated_at: trx.fn.now() });
      }
    });

    console.log(`[HFCM] ✓ Reordered ${snippetIds.length} project snippets`);

    return res.json({
      success: true,
    });
  } catch (error: any) {
    console.error("[HFCM] Error reordering project code snippets:", error);
    return res.status(500).json({
      success: false,
      error: "REORDER_ERROR",
      message: error?.message || "Failed to reorder code snippets",
    });
  }
});

// =====================================================================
// EXPORTS
// =====================================================================

export default router;
