/**
 * Admin Websites Controller
 *
 * 44 named exports handling request/response for all admin website endpoints.
 * Delegates business logic to feature services.
 *
 * Groups:
 * 1. Project Management (9 endpoints)
 * 2. Template Management (8 endpoints)
 * 3. Template Pages (5 endpoints)
 * 4. Project Pages (10 endpoints)
 * 5. Template HFCM (6 endpoints)
 * 6. Project HFCM (6 endpoints)
 */

import { Request, Response } from "express";
import * as projectManager from "./feature-services/service.project-manager";
import * as templateManager from "./feature-services/service.template-manager";
import * as pageEditor from "./feature-services/service.page-editor";
import * as hfcmManager from "./feature-services/service.hfcm-manager";
import * as websiteScraper from "./feature-services/service.website-scraper";
import * as deploymentPipeline from "./feature-services/service.deployment-pipeline";

// =====================================================================
// PROJECTS
// =====================================================================

/** GET / — List all projects with pagination */
export async function listProjects(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { status, page = "1", limit = "50" } = req.query;
    const result = await projectManager.listProjects({
      status: status as string | undefined,
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
    });
    return res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching projects:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch projects",
    });
  }
}

/** POST / — Create a new website project */
export async function createProject(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { user_id, hostname } = req.body;
    const project = await projectManager.createProject({
      user_id,
      hostname,
    });
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
}

/** GET /statuses — Get unique statuses for filter dropdown */
export async function getStatuses(
  _req: Request,
  res: Response
): Promise<Response> {
  try {
    const statusList = await projectManager.getProjectStatuses();
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
}

/** GET /:id/status — Lightweight status polling */
export async function getProjectStatus(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const project = await projectManager.getProjectStatus(id);

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
}

/** PATCH /:id/link-organization — Link or unlink org */
export async function linkOrganization(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const { organizationId } = req.body;

    const { project, error } = await projectManager.linkOrganization(
      id,
      organizationId
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.json({
      success: true,
      data: project,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error linking organization:", error);
    return res.status(500).json({
      success: false,
      error: "LINK_ERROR",
      message: error?.message || "Failed to link organization",
    });
  }
}

/** GET /:id — Get single project with pages */
export async function getProject(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const project = await projectManager.getProjectById(id);

    if (!project) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Project not found",
      });
    }

    return res.json({
      success: true,
      data: project,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching project:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch project",
    });
  }
}

/** PATCH /:id — Update a project */
export async function updateProject(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { project, error } = await projectManager.updateProject(id, updates);

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

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
}

/** DELETE /:id — Delete a project (cascade pages) */
export async function deleteProject(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;

    const { error } = await projectManager.deleteProject(id);

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

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
}

/** POST /start-pipeline — Trigger N8N webhook */
export async function startPipeline(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { error } = await deploymentPipeline.startPipeline(req.body);

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

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
}

// =====================================================================
// TEMPLATES
// =====================================================================

/** GET /templates — List all templates */
export async function listTemplates(
  _req: Request,
  res: Response
): Promise<Response> {
  try {
    const templates = await templateManager.listTemplates();
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
}

/** POST /templates — Create a template */
export async function createTemplate(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { template, error } = await templateManager.createTemplate(req.body);

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

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
}

/** GET /templates/:templateId — Get template with pages */
export async function getTemplate(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId } = req.params;
    const template = await templateManager.getTemplateById(templateId);

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
}

/** PATCH /templates/:templateId — Update a template */
export async function updateTemplate(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId } = req.params;
    const { template, error } = await templateManager.updateTemplate(
      templateId,
      req.body
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

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
}

/** DELETE /templates/:templateId — Delete a template */
export async function deleteTemplate(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId } = req.params;
    const { error } = await templateManager.deleteTemplate(templateId);

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

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
}

/** POST /templates/:templateId/activate — Set active template */
export async function activateTemplate(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId } = req.params;
    const { template, error } = await templateManager.activateTemplate(
      templateId
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

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
}

/** GET /editor/system-prompt — Get page editor system prompt */
export async function getEditorSystemPrompt(
  _req: Request,
  res: Response
): Promise<Response> {
  try {
    const prompt = await templateManager.getPageEditorSystemPrompt();
    return res.json({ success: true, prompt });
  } catch (error: any) {
    console.error(
      "[Admin Websites] Error fetching editor system prompt:",
      error
    );
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch system prompt",
    });
  }
}

/** POST /scrape — Scrape a website */
export async function scrapeWebsite(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const scraperKey = req.headers["x-scraper-key"];
    const { url } = req.body;

    const { result, error } = await websiteScraper.scrapeWebsite(
      url,
      scraperKey
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.message,
      });
    }

    return res.json({
      success: true,
      baseUrl: result!.baseUrl,
      pages: result!.pages,
      images: result!.images,
      elapsedMs: result!.elapsedMs,
      charLength: result!.charLength,
      estimatedTokens: result!.estimatedTokens,
    });
  } catch (error: any) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ success: false, error: message });
  }
}

// =====================================================================
// TEMPLATE PAGES
// =====================================================================

/** GET /templates/:templateId/pages — List template pages */
export async function listTemplatePages(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId } = req.params;
    const { pages, error } = await templateManager.listTemplatePages(
      templateId
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

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
}

/** POST /templates/:templateId/pages — Create template page */
export async function createTemplatePage(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId } = req.params;
    const { page, error } = await templateManager.createTemplatePage(
      templateId,
      req.body
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

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
}

/** GET /templates/:templateId/pages/:pageId — Get template page */
export async function getTemplatePage(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId, pageId } = req.params;
    const page = await templateManager.getTemplatePage(templateId, pageId);

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
}

/** PATCH /templates/:templateId/pages/:pageId — Update template page */
export async function updateTemplatePage(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId, pageId } = req.params;
    const { page, error } = await templateManager.updateTemplatePage(
      templateId,
      pageId,
      req.body
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

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
}

/** DELETE /templates/:templateId/pages/:pageId — Delete template page */
export async function deleteTemplatePage(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId, pageId } = req.params;
    const { error } = await templateManager.deleteTemplatePage(
      templateId,
      pageId
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

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
}

// =====================================================================
// PROJECT PAGES
// =====================================================================

/** GET /:id/pages — List project pages */
export async function listPages(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const { path } = req.query;
    const pages = await pageEditor.listPages(id, path as string | undefined);
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
}

/** POST /:id/pages — Create page version */
export async function createPage(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const { page, error } = await pageEditor.createPage(id, req.body);

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

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
}

/** POST /:id/pages/:pageId/publish — Publish a page */
export async function publishPage(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id, pageId } = req.params;
    const { page, error } = await pageEditor.publishPage(id, pageId);

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.json({
      success: true,
      data: page,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error publishing page:", error);
    return res.status(500).json({
      success: false,
      error: "PUBLISH_ERROR",
      message: error?.message || "Failed to publish page",
    });
  }
}

/** GET /:id/pages/:pageId — Get single page */
export async function getPage(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id, pageId } = req.params;
    const page = await pageEditor.getPageById(id, pageId);

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
}

/** PATCH /:id/pages/:pageId — Update draft page */
export async function updatePage(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id, pageId } = req.params;
    const { page, error } = await pageEditor.updatePage(id, pageId, req.body);

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.json({
      success: true,
      data: page,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating page:", error);
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update page",
    });
  }
}

/** DELETE /:id/pages/by-path — Delete all versions at path */
export async function deletePagesByPath(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const pagePath = req.query.path as string | undefined;

    if (!pagePath) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "path query parameter is required",
      });
    }

    const { deletedCount, error } = await pageEditor.deletePagesByPath(
      id,
      pagePath
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.json({
      success: true,
      message: `Deleted ${deletedCount} version(s) at path "${pagePath}"`,
      data: { path: pagePath, deletedCount },
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting page by path:", error);
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to delete page",
    });
  }
}

/** DELETE /:id/pages/:pageId — Delete a page version */
export async function deletePage(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id, pageId } = req.params;
    const { error } = await pageEditor.deletePage(id, pageId);

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

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
}

/** POST /:id/pages/:pageId/create-draft — Clone published to draft */
export async function createDraft(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id, pageId } = req.params;
    const { page, isExisting, error } = await pageEditor.createDraft(
      id,
      pageId
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    // Idempotent: existing draft returns 200, new draft returns 201
    return res.status(isExisting ? 200 : 201).json({
      success: true,
      data: page,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error creating draft:", error);
    return res.status(500).json({
      success: false,
      error: "CREATE_ERROR",
      message: error?.message || "Failed to create draft",
    });
  }
}

/** POST /:id/pages/:pageId/edit — AI edit page component */
export async function editPageComponent(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id, pageId } = req.params;
    const { result, error } = await pageEditor.editPageComponent(
      id,
      pageId,
      req.body
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

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
}

/** POST /:id/edit-layout — AI edit layout component */
export async function editLayoutComponent(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const { result, error } = await pageEditor.editLayoutComponent(
      id,
      req.body
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

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
}

// =====================================================================
// TEMPLATE HFCM
// =====================================================================

/** GET /templates/:templateId/code-snippets — List template snippets */
export async function listTemplateSnippets(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId } = req.params;
    const snippets = await hfcmManager.listTemplateSnippets(templateId);
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
}

/** POST /templates/:templateId/code-snippets — Create template snippet */
export async function createTemplateSnippet(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId } = req.params;
    const { snippet, error } = await hfcmManager.createTemplateSnippet(
      templateId,
      req.body
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

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
}

/** PATCH /templates/:templateId/code-snippets/:id — Update template snippet */
export async function updateTemplateSnippet(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId, id } = req.params;
    const { snippet, error } = await hfcmManager.updateTemplateSnippet(
      templateId,
      id,
      req.body
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.json({
      success: true,
      data: snippet,
    });
  } catch (error: any) {
    console.error("[HFCM] Error updating template code snippet:", error);
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update code snippet",
    });
  }
}

/** DELETE /templates/:templateId/code-snippets/:id — Delete template snippet */
export async function deleteTemplateSnippet(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId, id } = req.params;
    const { error } = await hfcmManager.deleteTemplateSnippet(templateId, id);

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

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
}

/** PATCH /templates/:templateId/code-snippets/:id/toggle — Toggle template snippet */
export async function toggleTemplateSnippet(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId, id } = req.params;
    const { is_enabled, error } = await hfcmManager.toggleTemplateSnippet(
      templateId,
      id
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.json({
      success: true,
      data: { is_enabled },
    });
  } catch (error: any) {
    console.error("[HFCM] Error toggling template code snippet:", error);
    return res.status(500).json({
      success: false,
      error: "TOGGLE_ERROR",
      message: error?.message || "Failed to toggle code snippet",
    });
  }
}

/** PATCH /templates/:templateId/code-snippets/reorder — Reorder template snippets */
export async function reorderTemplateSnippets(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId } = req.params;
    const { snippetIds } = req.body;
    const { error } = await hfcmManager.reorderTemplateSnippets(
      templateId,
      snippetIds
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

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
}

// =====================================================================
// PROJECT HFCM
// =====================================================================

/** GET /:projectId/code-snippets — List project snippets */
export async function listProjectSnippets(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { projectId } = req.params;
    const snippets = await hfcmManager.listProjectSnippets(projectId);
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
}

/** POST /:projectId/code-snippets — Create project snippet */
export async function createProjectSnippet(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { projectId } = req.params;
    const { snippet, error } = await hfcmManager.createProjectSnippet(
      projectId,
      req.body
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

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
}

/** PATCH /:projectId/code-snippets/:id — Update project snippet */
export async function updateProjectSnippet(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { projectId, id } = req.params;
    const { snippet, error } = await hfcmManager.updateProjectSnippet(
      projectId,
      id,
      req.body
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.json({
      success: true,
      data: snippet,
    });
  } catch (error: any) {
    console.error("[HFCM] Error updating project code snippet:", error);
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update code snippet",
    });
  }
}

/** DELETE /:projectId/code-snippets/:id — Delete project snippet */
export async function deleteProjectSnippet(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { projectId, id } = req.params;
    const { error } = await hfcmManager.deleteProjectSnippet(projectId, id);

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

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
}

/** PATCH /:projectId/code-snippets/:id/toggle — Toggle project snippet */
export async function toggleProjectSnippet(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { projectId, id } = req.params;
    const { is_enabled, error } = await hfcmManager.toggleProjectSnippet(
      projectId,
      id
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.json({
      success: true,
      data: { is_enabled },
    });
  } catch (error: any) {
    console.error("[HFCM] Error toggling project code snippet:", error);
    return res.status(500).json({
      success: false,
      error: "TOGGLE_ERROR",
      message: error?.message || "Failed to toggle code snippet",
    });
  }
}

/** PATCH /:projectId/code-snippets/reorder — Reorder project snippets */
export async function reorderProjectSnippets(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { projectId } = req.params;
    const { snippetIds } = req.body;
    const { error } = await hfcmManager.reorderProjectSnippets(
      projectId,
      snippetIds
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

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
}
