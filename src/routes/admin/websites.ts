/**
 * Admin Websites API Routes
 *
 * Portal to manage website-builder data from the admin panel.
 * Reads/writes to the website_builder schema tables.
 */

import express, { Request, Response } from "express";
import { db } from "../../database/connection";
import importsRouter from "./imports";

const router = express.Router();

// Schema prefix for website_builder tables
const PROJECTS_TABLE = "website_builder.projects";
const PAGES_TABLE = "website_builder.pages";
const TEMPLATES_TABLE = "website_builder.templates";

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

    // Build data query
    let dataQuery = db(PROJECTS_TABLE).select(
      "id",
      "user_id",
      "generated_hostname",
      "status",
      "selected_place_id",
      "selected_website_url",
      "step_gbp_scrape",
      "created_at",
      "updated_at"
    );

    if (status) {
      dataQuery = dataQuery.where("status", status);
    }

    const projects = await dataQuery
      .orderBy("created_at", "desc")
      .limit(limitNum)
      .offset(offset);

    console.log(
      `[Admin Websites] Found ${projects.length} of ${total} projects (page ${pageNum})`
    );

    return res.json({
      success: true,
      data: projects,
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
    const { name, html_template, is_active = false } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "name is required",
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
        html_template: html_template || "",
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

/**
 * GET /api/admin/websites/templates/:templateId
 * Get a single template
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

    return res.json({
      success: true,
      data: template,
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
      placeId,
      websiteUrl,
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

    console.log(`[Admin Websites] Triggering webhook: ${n8nWebhookUrl}`);
    console.log(`[Admin Websites] Payload:`, {
      projectId,
      templateId: finalTemplateId,
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
        placeId,
        websiteUrl,
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

    const project = await db(PROJECTS_TABLE).where("id", id).first();

    if (!project) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Project not found",
      });
    }

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
    const { path = "/", htmlContent, publish = false } = req.body;

    if (!htmlContent) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "htmlContent is required",
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
        html_content: { html: htmlContent },
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

// =====================================================================
// EXPORTS
// =====================================================================

export default router;
