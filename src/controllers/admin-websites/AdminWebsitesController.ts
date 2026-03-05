/**
 * Admin Websites Controller
 *
 * Named exports handling request/response for all admin website endpoints.
 * Delegates business logic to feature services.
 *
 * Groups:
 * 1. Project Management (9 endpoints)
 * 2. Template Management (8 endpoints)
 * 3. Template Pages (5 endpoints)
 * 4. Project Pages (10 endpoints)
 * 5. Template HFCM (6 endpoints)
 * 6. Project HFCM (6 endpoints)
 * 7. Post Types (5 endpoints)
 * 8. Post Blocks (5 endpoints)
 * 9. Post Taxonomy (8 endpoints)
 * 10. Posts (5 endpoints)
 */

import { Request, Response } from "express";
import * as projectManager from "./feature-services/service.project-manager";
import * as templateManager from "./feature-services/service.template-manager";
import * as pageEditor from "./feature-services/service.page-editor";
import * as hfcmManager from "./feature-services/service.hfcm-manager";
import * as websiteScraper from "./feature-services/service.website-scraper";
import * as deploymentPipeline from "./feature-services/service.deployment-pipeline";
import * as customDomain from "./feature-services/service.custom-domain";
import * as postTypeManager from "./feature-services/service.post-type-manager";
import * as postBlockManager from "./feature-services/service.post-block-manager";
import * as menuTemplateManager from "./feature-services/service.menu-template-manager";
import * as postTaxonomyManager from "./feature-services/service.post-taxonomy-manager";
import * as postManager from "./feature-services/service.post-manager";
import * as menuManager from "./feature-services/service.menu-manager";
import { db } from "../../database/connection";
import { FormSubmissionModel } from "../../models/website-builder/FormSubmissionModel";
import { OrganizationUserModel } from "../../models/OrganizationUserModel";

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

/** PATCH /pages/:pageId/generation-status — N8N callback to update page generation status */
export async function updatePageGenerationStatus(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { pageId } = req.params;
    const { generation_status, html_content, sections, wrapper, header, footer } = req.body;

    if (!["generating", "ready", "failed"].includes(generation_status)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_STATUS",
        message: "generation_status must be generating, ready, or failed",
      });
    }

    const result = await projectManager.updatePageGenerationStatus(pageId, {
      generation_status,
      html_content,
      sections,
      wrapper,
      header,
      footer,
    });

    if (result.error) {
      return res.status(result.error.status).json({
        success: false,
        error: result.error.code,
        message: result.error.message,
      });
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating page generation status:", error);
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update page generation status",
    });
  }
}

/** GET /:id/pages/generation-status — Per-page generation status for polling */
export async function getPagesGenerationStatus(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const pages = await projectManager.getPagesGenerationStatus(id);
    return res.json({ success: true, data: pages });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching page generation status:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch page generation status",
    });
  }
}

/** POST /:id/create-all-from-template — Bulk create all pages and kick off N8N per page */
export async function createAllFromTemplate(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const {
      templateId,
      placeId,
      pages,
      businessName,
      formattedAddress,
      city,
      state,
      phone,
      category,
      primaryColor,
      accentColor,
      practiceSearchString,
      rating,
      reviewCount,
    } = req.body;

    if (!placeId) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "placeId is required",
      });
    }

    if (!Array.isArray(pages) || pages.length === 0) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "pages array is required and must not be empty",
      });
    }

    // Create all page rows as queued
    const createResult = await projectManager.createAllFromTemplate(id, {
      templateId,
      placeId,
      pages,
      businessName,
      formattedAddress,
      city,
      state,
      phone,
      category,
      primaryColor,
      accentColor,
      practiceSearchString,
      rating,
      reviewCount,
    });

    if (createResult.error) {
      return res.status(createResult.error.status).json({
        success: false,
        error: createResult.error.code,
        message: createResult.error.message,
      });
    }

    // Fire N8N webhook per page (fire-and-forget — don't await all)
    // Pass existingPageId so startPipeline skips pre-creating another row.
    const createdPages = createResult.pages!;
    for (let i = 0; i < createdPages.length; i++) {
      const createdPage = createdPages[i];
      const pageConfig = pages[i];
      deploymentPipeline.startPipeline({
        projectId: id,
        templateId,
        templatePageId: createdPage.templatePageId,
        path: createdPage.path,
        placeId,
        websiteUrl: pageConfig?.websiteUrl ?? undefined,
        businessName,
        formattedAddress,
        city,
        state,
        phone,
        category,
        primaryColor,
        accentColor,
        practiceSearchString,
        rating,
        reviewCount,
        existingPageId: createdPage.id,
      }).catch((err: any) => {
        console.error(`[Admin Websites] Pipeline fire failed for page ${createdPage.id}:`, err);
      });
    }

    return res.status(201).json({ success: true, data: createdPages });
  } catch (error: any) {
    console.error("[Admin Websites] Error in create-all-from-template:", error);
    return res.status(500).json({
      success: false,
      error: "CREATE_ERROR",
      message: error?.message || "Failed to create pages from template",
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
// CUSTOM DOMAIN
// =====================================================================

/** POST /:id/connect-domain — Connect a custom domain */
export async function connectDomainHandler(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "domain is required",
      });
    }

    const { data, error } = await customDomain.connectDomain(id, domain);

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.json({ success: true, data });
  } catch (error: any) {
    console.error("[Admin Websites] Error connecting domain:", error);
    return res.status(500).json({
      success: false,
      error: "DOMAIN_ERROR",
      message: error?.message || "Failed to connect domain",
    });
  }
}

/** POST /:id/verify-domain — Verify DNS for custom domain */
export async function verifyDomainHandler(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const { data, error } = await customDomain.verifyDomain(id);

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.json({ success: true, data });
  } catch (error: any) {
    console.error("[Admin Websites] Error verifying domain:", error);
    return res.status(500).json({
      success: false,
      error: "VERIFY_ERROR",
      message: error?.message || "Failed to verify domain",
    });
  }
}

/** DELETE /:id/disconnect-domain — Disconnect custom domain */
export async function disconnectDomainHandler(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const { data, error } = await customDomain.disconnectDomain(id);

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.json({ success: true, data });
  } catch (error: any) {
    console.error("[Admin Websites] Error disconnecting domain:", error);
    return res.status(500).json({
      success: false,
      error: "DOMAIN_ERROR",
      message: error?.message || "Failed to disconnect domain",
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

// =====================================================================
// RECIPIENTS
// =====================================================================

/** GET /:id/recipients — Get configured recipients + org users */
export async function getRecipients(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const project = await db("website_builder.projects")
      .where("id", id)
      .select("id", "recipients", "organization_id")
      .first();

    if (!project) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Project not found" });
    }

    // Fetch org users so the UI can offer them as options
    let orgUsers: { name: string; email: string; role: string }[] = [];
    if (project.organization_id) {
      const users = await OrganizationUserModel.listByOrgWithUsers(project.organization_id);
      orgUsers = users.map((u) => ({ name: u.name, email: u.email, role: u.role }));
    }

    return res.json({
      success: true,
      data: {
        recipients: project.recipients || [],
        orgUsers,
      },
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching recipients:", error);
    return res.status(500).json({ success: false, error: "FETCH_ERROR", message: error?.message || "Failed to fetch recipients" });
  }
}

/** PUT /:id/recipients — Update recipients list */
export async function updateRecipients(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const { recipients } = req.body;

    if (!Array.isArray(recipients)) {
      return res.status(400).json({ success: false, error: "VALIDATION_ERROR", message: "recipients must be an array of email strings" });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalid = recipients.filter((e: string) => !emailRegex.test(e));
    if (invalid.length > 0) {
      return res.status(400).json({ success: false, error: "VALIDATION_ERROR", message: `Invalid email(s): ${invalid.join(", ")}` });
    }

    await db("website_builder.projects")
      .where("id", id)
      .update({ recipients: JSON.stringify(recipients), updated_at: db.fn.now() });

    return res.json({ success: true, data: { recipients } });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating recipients:", error);
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message || "Failed to update recipients" });
  }
}

// =====================================================================
// FORM SUBMISSIONS
// =====================================================================

/** GET /:id/form-submissions — List submissions with pagination */
export async function listFormSubmissions(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
    const readFilter = req.query.read;
    const filterParam = req.query.filter as string | undefined;

    const filters: { is_read?: boolean; is_flagged?: boolean; form_name?: string; form_name_not?: string } = {};
    if (readFilter === "true") filters.is_read = true;
    if (readFilter === "false") filters.is_read = false;

    if (filterParam === "verified") {
      filters.is_flagged = false;
      filters.form_name_not = "Newsletter Signup";
    } else if (filterParam === "flagged") {
      filters.is_flagged = true;
    } else if (filterParam === "optins") {
      filters.form_name = "Newsletter Signup";
    }

    const result = await FormSubmissionModel.findByProjectId(
      id,
      { offset: (page - 1) * limit, limit },
      filters,
    );

    const [unreadCount, flaggedCount, verifiedCount, optinsCount] = await Promise.all([
      FormSubmissionModel.countUnreadByProjectId(id),
      FormSubmissionModel.countFlaggedByProjectId(id),
      FormSubmissionModel.countVerifiedByProjectId(id),
      FormSubmissionModel.countOptinsByProjectId(id),
    ]);

    const totalPages = Math.ceil(result.total / limit);

    return res.json({ success: true, data: result.data, pagination: { page, limit, total: result.total, totalPages }, unreadCount, flaggedCount, verifiedCount, optinsCount });
  } catch (error: any) {
    console.error("[Admin Websites] Error listing form submissions:", error);
    return res.status(500).json({ success: false, error: "FETCH_ERROR", message: error?.message || "Failed to fetch submissions" });
  }
}

/** GET /:id/form-submissions/:submissionId — Get single submission */
export async function getFormSubmission(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { submissionId } = req.params;
    const submission = await FormSubmissionModel.findById(submissionId);

    if (!submission) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Submission not found" });
    }

    return res.json({ success: true, data: submission });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching submission:", error);
    return res.status(500).json({ success: false, error: "FETCH_ERROR", message: error?.message || "Failed to fetch submission" });
  }
}

/** PATCH /:id/form-submissions/:submissionId/read — Toggle read status */
export async function toggleFormSubmissionRead(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { submissionId } = req.params;
    const { is_read } = req.body;

    if (is_read) {
      await FormSubmissionModel.markAsRead(submissionId);
    } else {
      await FormSubmissionModel.markAsUnread(submissionId);
    }

    return res.json({ success: true, data: { is_read } });
  } catch (error: any) {
    console.error("[Admin Websites] Error toggling submission read:", error);
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message || "Failed to update submission" });
  }
}

/** DELETE /:id/form-submissions/:submissionId — Delete a submission */
export async function deleteFormSubmission(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { submissionId } = req.params;
    await FormSubmissionModel.deleteById(submissionId);
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting submission:", error);
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message || "Failed to delete submission" });
  }
}

// =====================================================================
// POST TYPES
// =====================================================================

/** GET /templates/:templateId/post-types */
export async function listPostTypes(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId } = req.params;
    const result = await postTypeManager.listPostTypes(templateId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.postTypes });
  } catch (error: any) {
    console.error("[Admin Websites] Error listing post types:", error);
    return res.status(500).json({ success: false, error: "LIST_ERROR", message: error?.message });
  }
}

/** POST /templates/:templateId/post-types */
export async function createPostType(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId } = req.params;
    const result = await postTypeManager.createPostType(templateId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.postType });
  } catch (error: any) {
    console.error("[Admin Websites] Error creating post type:", error);
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** GET /templates/:templateId/post-types/:postTypeId */
export async function getPostType(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, postTypeId } = req.params;
    const postType = await postTypeManager.getPostType(templateId, postTypeId);
    if (!postType) return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Post type not found" });
    return res.json({ success: true, data: postType });
  } catch (error: any) {
    console.error("[Admin Websites] Error getting post type:", error);
    return res.status(500).json({ success: false, error: "GET_ERROR", message: error?.message });
  }
}

/** PATCH /templates/:templateId/post-types/:postTypeId */
export async function updatePostType(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, postTypeId } = req.params;
    const result = await postTypeManager.updatePostType(templateId, postTypeId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.postType });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating post type:", error);
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /templates/:templateId/post-types/:postTypeId */
export async function deletePostType(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, postTypeId } = req.params;
    const result = await postTypeManager.deletePostType(templateId, postTypeId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting post type:", error);
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

// =====================================================================
// POST BLOCKS
// =====================================================================

/** GET /templates/:templateId/post-blocks */
export async function listPostBlocks(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId } = req.params;
    const result = await postBlockManager.listPostBlocks(templateId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.postBlocks });
  } catch (error: any) {
    console.error("[Admin Websites] Error listing post blocks:", error);
    return res.status(500).json({ success: false, error: "LIST_ERROR", message: error?.message });
  }
}

/** POST /templates/:templateId/post-blocks */
export async function createPostBlock(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId } = req.params;
    const result = await postBlockManager.createPostBlock(templateId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.postBlock });
  } catch (error: any) {
    console.error("[Admin Websites] Error creating post block:", error);
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** GET /templates/:templateId/post-blocks/:postBlockId */
export async function getPostBlock(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, postBlockId } = req.params;
    const postBlock = await postBlockManager.getPostBlock(templateId, postBlockId);
    if (!postBlock) return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Post block not found" });
    return res.json({ success: true, data: postBlock });
  } catch (error: any) {
    console.error("[Admin Websites] Error getting post block:", error);
    return res.status(500).json({ success: false, error: "GET_ERROR", message: error?.message });
  }
}

/** PATCH /templates/:templateId/post-blocks/:postBlockId */
export async function updatePostBlock(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, postBlockId } = req.params;
    const result = await postBlockManager.updatePostBlock(templateId, postBlockId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.postBlock });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating post block:", error);
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /templates/:templateId/post-blocks/:postBlockId */
export async function deletePostBlock(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, postBlockId } = req.params;
    const result = await postBlockManager.deletePostBlock(templateId, postBlockId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting post block:", error);
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

// =====================================================================
// MENU TEMPLATES
// =====================================================================

/** GET /templates/:templateId/menu-templates */
export async function listMenuTemplates(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId } = req.params;
    const result = await menuTemplateManager.listMenuTemplates(templateId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.menuTemplates });
  } catch (error: any) {
    console.error("[Admin Websites] Error listing menu templates:", error);
    return res.status(500).json({ success: false, error: "LIST_ERROR", message: error?.message });
  }
}

/** POST /templates/:templateId/menu-templates */
export async function createMenuTemplate(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId } = req.params;
    const result = await menuTemplateManager.createMenuTemplate(templateId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.menuTemplate });
  } catch (error: any) {
    console.error("[Admin Websites] Error creating menu template:", error);
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** GET /templates/:templateId/menu-templates/:menuTemplateId */
export async function getMenuTemplate(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, menuTemplateId } = req.params;
    const menuTemplate = await menuTemplateManager.getMenuTemplate(templateId, menuTemplateId);
    if (!menuTemplate) return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Menu template not found" });
    return res.json({ success: true, data: menuTemplate });
  } catch (error: any) {
    console.error("[Admin Websites] Error getting menu template:", error);
    return res.status(500).json({ success: false, error: "GET_ERROR", message: error?.message });
  }
}

/** PATCH /templates/:templateId/menu-templates/:menuTemplateId */
export async function updateMenuTemplate(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, menuTemplateId } = req.params;
    const result = await menuTemplateManager.updateMenuTemplate(templateId, menuTemplateId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.menuTemplate });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating menu template:", error);
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /templates/:templateId/menu-templates/:menuTemplateId */
export async function deleteMenuTemplate(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, menuTemplateId } = req.params;
    const result = await menuTemplateManager.deleteMenuTemplate(templateId, menuTemplateId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting menu template:", error);
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

// =====================================================================
// POST TAXONOMY (Categories & Tags)
// =====================================================================

/** GET /post-types/:postTypeId/categories */
export async function listCategories(req: Request, res: Response): Promise<Response> {
  try {
    const { postTypeId } = req.params;
    const result = await postTaxonomyManager.listCategories(postTypeId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.categories });
  } catch (error: any) {
    console.error("[Admin Websites] Error listing categories:", error);
    return res.status(500).json({ success: false, error: "LIST_ERROR", message: error?.message });
  }
}

/** POST /post-types/:postTypeId/categories */
export async function createCategory(req: Request, res: Response): Promise<Response> {
  try {
    const { postTypeId } = req.params;
    const result = await postTaxonomyManager.createCategory(postTypeId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.category });
  } catch (error: any) {
    console.error("[Admin Websites] Error creating category:", error);
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** PATCH /post-types/:postTypeId/categories/:categoryId */
export async function updateCategory(req: Request, res: Response): Promise<Response> {
  try {
    const { postTypeId, categoryId } = req.params;
    const result = await postTaxonomyManager.updateCategory(postTypeId, categoryId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.category });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating category:", error);
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /post-types/:postTypeId/categories/:categoryId */
export async function deleteCategory(req: Request, res: Response): Promise<Response> {
  try {
    const { postTypeId, categoryId } = req.params;
    const result = await postTaxonomyManager.deleteCategory(postTypeId, categoryId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting category:", error);
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

/** GET /post-types/:postTypeId/tags */
export async function listTags(req: Request, res: Response): Promise<Response> {
  try {
    const { postTypeId } = req.params;
    const result = await postTaxonomyManager.listTags(postTypeId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.tags });
  } catch (error: any) {
    console.error("[Admin Websites] Error listing tags:", error);
    return res.status(500).json({ success: false, error: "LIST_ERROR", message: error?.message });
  }
}

/** POST /post-types/:postTypeId/tags */
export async function createTag(req: Request, res: Response): Promise<Response> {
  try {
    const { postTypeId } = req.params;
    const result = await postTaxonomyManager.createTag(postTypeId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.tag });
  } catch (error: any) {
    console.error("[Admin Websites] Error creating tag:", error);
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** PATCH /post-types/:postTypeId/tags/:tagId */
export async function updateTag(req: Request, res: Response): Promise<Response> {
  try {
    const { postTypeId, tagId } = req.params;
    const result = await postTaxonomyManager.updateTag(postTypeId, tagId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.tag });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating tag:", error);
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /post-types/:postTypeId/tags/:tagId */
export async function deleteTag(req: Request, res: Response): Promise<Response> {
  try {
    const { postTypeId, tagId } = req.params;
    const result = await postTaxonomyManager.deleteTag(postTypeId, tagId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting tag:", error);
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

// =====================================================================
// POSTS
// =====================================================================

/** GET /:id/posts */
export async function listPosts(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = req.params.id;
    const { post_type_id, status } = req.query;
    const result = await postManager.listPosts(projectId, {
      post_type_id: post_type_id as string | undefined,
      status: status as string | undefined,
    });
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.posts });
  } catch (error: any) {
    console.error("[Admin Websites] Error listing posts:", error);
    return res.status(500).json({ success: false, error: "LIST_ERROR", message: error?.message });
  }
}

/** POST /:id/posts */
export async function createPost(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = req.params.id;
    const result = await postManager.createPost(projectId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.post });
  } catch (error: any) {
    console.error("[Admin Websites] Error creating post:", error);
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** GET /:id/posts/:postId */
export async function getPost(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, postId } = req.params;
    const post = await postManager.getPost(projectId, postId);
    if (!post) return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Post not found" });
    return res.json({ success: true, data: post });
  } catch (error: any) {
    console.error("[Admin Websites] Error getting post:", error);
    return res.status(500).json({ success: false, error: "GET_ERROR", message: error?.message });
  }
}

/** PATCH /:id/posts/:postId */
export async function updatePost(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, postId } = req.params;
    const result = await postManager.updatePost(projectId, postId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.post });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating post:", error);
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /:id/posts/:postId */
export async function deletePost(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, postId } = req.params;
    const result = await postManager.deletePost(projectId, postId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting post:", error);
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

// =====================================================================
// MENUS
// =====================================================================

/** GET /:id/menus */
export async function listMenus(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = req.params.id;
    const result = await menuManager.listMenus(projectId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.menus });
  } catch (error: any) {
    console.error("[Admin Websites] Error listing menus:", error);
    return res.status(500).json({ success: false, error: "LIST_ERROR", message: error?.message });
  }
}

/** POST /:id/menus */
export async function createMenu(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = req.params.id;
    const result = await menuManager.createMenu(projectId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.menu });
  } catch (error: any) {
    console.error("[Admin Websites] Error creating menu:", error);
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** GET /:id/menus/:menuId */
export async function getMenu(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, menuId } = req.params;
    const result = await menuManager.getMenu(projectId, menuId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.menu });
  } catch (error: any) {
    console.error("[Admin Websites] Error getting menu:", error);
    return res.status(500).json({ success: false, error: "GET_ERROR", message: error?.message });
  }
}

/** PATCH /:id/menus/:menuId */
export async function updateMenu(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, menuId } = req.params;
    const result = await menuManager.updateMenu(projectId, menuId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.menu });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating menu:", error);
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /:id/menus/:menuId */
export async function deleteMenu(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, menuId } = req.params;
    const result = await menuManager.deleteMenu(projectId, menuId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting menu:", error);
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

/** POST /:id/menus/:menuId/items */
export async function createMenuItem(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, menuId } = req.params;
    const result = await menuManager.createMenuItem(projectId, menuId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.item });
  } catch (error: any) {
    console.error("[Admin Websites] Error creating menu item:", error);
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** PATCH /:id/menus/:menuId/items/:itemId */
export async function updateMenuItem(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, menuId, itemId } = req.params;
    const result = await menuManager.updateMenuItem(projectId, menuId, itemId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.item });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating menu item:", error);
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /:id/menus/:menuId/items/:itemId */
export async function deleteMenuItem(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, menuId, itemId } = req.params;
    const result = await menuManager.deleteMenuItem(projectId, menuId, itemId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting menu item:", error);
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

/** PATCH /:id/menus/:menuId/items/reorder */
export async function reorderMenuItems(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, menuId } = req.params;
    const result = await menuManager.reorderItems(projectId, menuId, req.body.items || []);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Websites] Error reordering menu items:", error);
    return res.status(500).json({ success: false, error: "REORDER_ERROR", message: error?.message });
  }
}
