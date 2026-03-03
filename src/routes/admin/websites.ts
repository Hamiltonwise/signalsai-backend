/**
 * Admin Websites API Routes
 *
 * Portal to manage website-builder data from the admin panel.
 * Reads/writes to the website_builder schema tables.
 *
 * 44 endpoints delegating to AdminWebsitesController.
 */

import express from "express";
import * as controller from "../../controllers/admin-websites/AdminWebsitesController";
import importsRouter from "./imports";

const router = express.Router();

// =====================================================================
// PROJECTS (non-parameterized routes first)
// =====================================================================

// GET  / — List all projects with pagination
router.get("/", controller.listProjects);

// POST / — Create a new website project
router.post("/", controller.createProject);

// GET  /statuses — Get unique statuses
router.get("/statuses", controller.getStatuses);

// POST /start-pipeline — Trigger N8N webhook
router.post("/start-pipeline", controller.startPipeline);

// =====================================================================
// PAGE GENERATION STATUS (non-parameterized by project — must be before /:id)
// =====================================================================

// PATCH /pages/:pageId/generation-status — N8N callback to update page status
router.patch("/pages/:pageId/generation-status", controller.updatePageGenerationStatus);

// =====================================================================
// TEMPLATES
// =====================================================================

// GET  /templates — List all templates
router.get("/templates", controller.listTemplates);

// POST /templates — Create a template
router.post("/templates", controller.createTemplate);

// =====================================================================
// TEMPLATE PAGES (must come before /templates/:templateId)
// =====================================================================

// GET  /templates/:templateId/pages — List template pages
router.get("/templates/:templateId/pages", controller.listTemplatePages);

// POST /templates/:templateId/pages — Create template page
router.post("/templates/:templateId/pages", controller.createTemplatePage);

// GET  /templates/:templateId/pages/:pageId — Get template page
router.get("/templates/:templateId/pages/:pageId", controller.getTemplatePage);

// PATCH /templates/:templateId/pages/:pageId — Update template page
router.patch("/templates/:templateId/pages/:pageId", controller.updateTemplatePage);

// DELETE /templates/:templateId/pages/:pageId — Delete template page
router.delete("/templates/:templateId/pages/:pageId", controller.deleteTemplatePage);

// =====================================================================
// TEMPLATE HFCM (must come before /templates/:templateId)
// =====================================================================

// PATCH /templates/:templateId/code-snippets/reorder — Reorder (before :id)
router.patch("/templates/:templateId/code-snippets/reorder", controller.reorderTemplateSnippets);

// GET  /templates/:templateId/code-snippets — List template snippets
router.get("/templates/:templateId/code-snippets", controller.listTemplateSnippets);

// POST /templates/:templateId/code-snippets — Create template snippet
router.post("/templates/:templateId/code-snippets", controller.createTemplateSnippet);

// PATCH /templates/:templateId/code-snippets/:id/toggle — Toggle (before :id patch)
router.patch("/templates/:templateId/code-snippets/:id/toggle", controller.toggleTemplateSnippet);

// PATCH /templates/:templateId/code-snippets/:id — Update template snippet
router.patch("/templates/:templateId/code-snippets/:id", controller.updateTemplateSnippet);

// DELETE /templates/:templateId/code-snippets/:id — Delete template snippet
router.delete("/templates/:templateId/code-snippets/:id", controller.deleteTemplateSnippet);

// =====================================================================
// TEMPLATES (parameterized — after sub-paths)
// =====================================================================

// GET  /templates/:templateId — Get template with pages
router.get("/templates/:templateId", controller.getTemplate);

// PATCH /templates/:templateId — Update template
router.patch("/templates/:templateId", controller.updateTemplate);

// DELETE /templates/:templateId — Delete template
router.delete("/templates/:templateId", controller.deleteTemplate);

// POST /templates/:templateId/activate — Activate template
router.post("/templates/:templateId/activate", controller.activateTemplate);

// =====================================================================
// PAGE EDITOR — SYSTEM PROMPT
// =====================================================================

// GET /editor/system-prompt — Get page editor system prompt
router.get("/editor/system-prompt", controller.getEditorSystemPrompt);

// =====================================================================
// WEBSITE SCRAPE
// =====================================================================

// POST /scrape — Scrape website for content
router.post("/scrape", controller.scrapeWebsite);

// =====================================================================
// IMPORTS (sub-router — must come before parameterized /:id routes)
// =====================================================================

router.use("/imports", importsRouter);

// =====================================================================
// PROJECTS (parameterized routes — must come after literal paths)
// =====================================================================

// GET  /:id/status — Lightweight status polling
router.get("/:id/status", controller.getProjectStatus);

// GET  /:id/pages/generation-status — Per-page generation status (before /:id/pages/:pageId)
router.get("/:id/pages/generation-status", controller.getPagesGenerationStatus);

// POST /:id/create-all-from-template — Bulk create all pages from template
router.post("/:id/create-all-from-template", controller.createAllFromTemplate);

// PATCH /:id/link-organization — Link/unlink org
router.patch("/:id/link-organization", controller.linkOrganization);

// POST /:id/connect-domain — Connect a custom domain
router.post("/:id/connect-domain", controller.connectDomainHandler);

// POST /:id/verify-domain — Verify DNS for custom domain
router.post("/:id/verify-domain", controller.verifyDomainHandler);

// DELETE /:id/disconnect-domain — Disconnect custom domain
router.delete("/:id/disconnect-domain", controller.disconnectDomainHandler);

// =====================================================================
// RECIPIENTS
// =====================================================================

// GET  /:id/recipients — Get configured recipients + org users
router.get("/:id/recipients", controller.getRecipients);

// PUT  /:id/recipients — Update recipients list
router.put("/:id/recipients", controller.updateRecipients);

// =====================================================================
// FORM SUBMISSIONS
// =====================================================================

// GET  /:id/form-submissions — List submissions with pagination
router.get("/:id/form-submissions", controller.listFormSubmissions);

// GET  /:id/form-submissions/:submissionId — Get single submission
router.get("/:id/form-submissions/:submissionId", controller.getFormSubmission);

// PATCH /:id/form-submissions/:submissionId/read — Toggle read status
router.patch("/:id/form-submissions/:submissionId/read", controller.toggleFormSubmissionRead);

// DELETE /:id/form-submissions/:submissionId — Delete a submission
router.delete("/:id/form-submissions/:submissionId", controller.deleteFormSubmission);

// =====================================================================
// PROJECT PAGES
// =====================================================================

// DELETE /:id/pages/by-path — Delete all versions at path (before :pageId)
router.delete("/:id/pages/by-path", controller.deletePagesByPath);

// GET  /:id/pages — List project pages
router.get("/:id/pages", controller.listPages);

// POST /:id/pages — Create page version
router.post("/:id/pages", controller.createPage);

// POST /:id/pages/:pageId/publish — Publish a page
router.post("/:id/pages/:pageId/publish", controller.publishPage);

// POST /:id/pages/:pageId/create-draft — Clone published to draft
router.post("/:id/pages/:pageId/create-draft", controller.createDraft);

// POST /:id/pages/:pageId/edit — AI edit page component
router.post("/:id/pages/:pageId/edit", controller.editPageComponent);

// GET  /:id/pages/:pageId — Get single page
router.get("/:id/pages/:pageId", controller.getPage);

// PATCH /:id/pages/:pageId — Update draft page
router.patch("/:id/pages/:pageId", controller.updatePage);

// DELETE /:id/pages/:pageId — Delete page version
router.delete("/:id/pages/:pageId", controller.deletePage);

// =====================================================================
// LAYOUT EDITOR — AI EDIT
// =====================================================================

// POST /:id/edit-layout — AI edit layout component
router.post("/:id/edit-layout", controller.editLayoutComponent);

// =====================================================================
// PROJECT HFCM
// =====================================================================

// PATCH /:projectId/code-snippets/reorder — Reorder (before :id)
router.patch("/:projectId/code-snippets/reorder", controller.reorderProjectSnippets);

// GET  /:projectId/code-snippets — List project snippets
router.get("/:projectId/code-snippets", controller.listProjectSnippets);

// POST /:projectId/code-snippets — Create project snippet
router.post("/:projectId/code-snippets", controller.createProjectSnippet);

// PATCH /:projectId/code-snippets/:id/toggle — Toggle (before :id patch)
router.patch("/:projectId/code-snippets/:id/toggle", controller.toggleProjectSnippet);

// PATCH /:projectId/code-snippets/:id — Update project snippet
router.patch("/:projectId/code-snippets/:id", controller.updateProjectSnippet);

// DELETE /:projectId/code-snippets/:id — Delete project snippet
router.delete("/:projectId/code-snippets/:id", controller.deleteProjectSnippet);

// =====================================================================
// PROJECTS (parameterized — last to avoid matching other routes)
// =====================================================================

// GET  /:id — Get single project with pages
router.get("/:id", controller.getProject);

// PATCH /:id — Update project
router.patch("/:id", controller.updateProject);

// DELETE /:id — Delete project (cascade pages)
router.delete("/:id", controller.deleteProject);

// =====================================================================
// EXPORTS
// =====================================================================

export default router;
