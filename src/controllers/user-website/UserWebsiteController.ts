/**
 * User Website Controller
 *
 * Handles HTTP request/response for user-facing website operations.
 * Delegates business logic to userWebsite.service.
 *
 * Endpoints:
 * - GET  / → getUserWebsite (DFY tier website data)
 * - POST /pages/:pageId/edit → editPageComponent (AI page edit)
 */

import { Response } from "express";
import { RBACRequest } from "../../middleware/rbac";
import * as userWebsiteService from "./user-website-services/userWebsite.service";
import * as customDomainService from "../admin-websites/feature-services/service.custom-domain";
import { ProjectModel } from "../../models/website-builder/ProjectModel";
import { FormSubmissionModel } from "../../models/website-builder/FormSubmissionModel";
import { OrganizationUserModel } from "../../models/OrganizationUserModel";
import { db } from "../../database/connection";

// =====================================================================
// Error handler
// =====================================================================

function handleError(
  res: Response,
  error: any,
  operation: string
): Response {
  // Check for service-level errors with statusCode
  if (error.statusCode) {
    const body: Record<string, unknown> = {
      error: error.errorCode || error.message,
      message: error.message,
    };
    if (error.limit !== undefined) body.limit = error.limit;
    if (error.reset_at !== undefined) body.reset_at = error.reset_at;
    return res.status(error.statusCode).json(body);
  }

  console.error(
    `[User/Website] ${operation} Error:`,
    error?.message || error
  );
  return res.status(500).json({
    success: false,
    error: `Failed to ${operation.toLowerCase()}`,
    message: error?.message || "Unknown error occurred",
  });
}

// =====================================================================
// GET /api/user/website — Fetch user's organization website
// =====================================================================

export async function getUserWebsite(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;

    if (!orgId) {
      return res.status(400).json({ error: "No organization found" });
    }

    const data = await userWebsiteService.fetchUserWebsiteData(orgId);

    // PREPARING state — project not yet created
    if (data.preparing) {
      return res.json({
        status: data.status,
        message: data.message,
      });
    }

    return res.json({
      project: data.project,
      pages: data.pages,
      media: data.media,
      usage: data.usage,
    });
  } catch (error) {
    return handleError(res, error, "Fetch user website");
  }
}

// =====================================================================
// POST /api/user/website/pages/:pageId/edit — AI page component edit
// =====================================================================

export async function editPageComponent(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const { pageId } = req.params;
    const { alloroClass, currentHtml, instruction, chatHistory = [] } =
      req.body;
    const userId = req.userId || 0;
    const orgId = req.organizationId;

    // Input validation
    if (!alloroClass || !currentHtml || !instruction) {
      return res.status(400).json({
        error: "INVALID_INPUT",
        message: "alloroClass, currentHtml, and instruction are required",
      });
    }

    if (!orgId) {
      return res.status(400).json({ error: "No organization found" });
    }

    const result = await userWebsiteService.editPageComponent({
      orgId,
      userId,
      pageId,
      alloroClass,
      currentHtml,
      instruction,
      chatHistory,
    });

    return res.json({
      success: result.success,
      editedHtml: result.editedHtml,
      message: result.message,
      rejected: result.rejected,
      edits_remaining: result.edits_remaining,
    });
  } catch (error: any) {
    // Rate limit errors need specific response shape
    if (error.errorCode === "RATE_LIMIT_EXCEEDED") {
      return res.status(429).json({
        error: "RATE_LIMIT_EXCEEDED",
        message: error.message,
        limit: error.limit,
        reset_at: error.reset_at,
      });
    }

    // READ_ONLY errors
    if (error.errorCode === "READ_ONLY") {
      return res.status(403).json({
        error: "READ_ONLY",
        message: error.message,
      });
    }

    // DFY_TIER_REQUIRED
    if (error.errorCode === "DFY_TIER_REQUIRED") {
      return res.status(403).json({ error: "DFY_TIER_REQUIRED" });
    }

    // 404 errors (website not found, page not found)
    if (error.statusCode === 404) {
      return res.status(404).json({ error: error.message });
    }

    // Generic edit error — matches original error shape exactly
    console.error("[User/Website] Error editing page component:", error);
    return res.status(500).json({
      error: "EDIT_ERROR",
      message: error?.message || "Failed to edit component",
    });
  }
}

// =====================================================================
// Custom Domain — helpers
// =====================================================================

async function getProjectIdForOrg(orgId: number): Promise<string | null> {
  const project = await ProjectModel.findByOrganizationId(orgId);
  return project?.id || null;
}

// =====================================================================
// POST /api/user/website/domain/connect
// =====================================================================

export async function connectDomain(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const projectId = await getProjectIdForOrg(orgId);
    if (!projectId) return res.status(404).json({ error: "No website found" });

    const { domain } = req.body;
    if (!domain) {
      return res.status(400).json({ error: "domain is required" });
    }

    const { data, error } = await customDomainService.connectDomain(projectId, domain);
    if (error) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }

    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, "Connect domain");
  }
}

// =====================================================================
// POST /api/user/website/domain/verify
// =====================================================================

export async function verifyDomain(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const projectId = await getProjectIdForOrg(orgId);
    if (!projectId) return res.status(404).json({ error: "No website found" });

    const { data, error } = await customDomainService.verifyDomain(projectId);
    if (error) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }

    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, "Verify domain");
  }
}

// =====================================================================
// DELETE /api/user/website/domain/disconnect
// =====================================================================

export async function disconnectDomain(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const projectId = await getProjectIdForOrg(orgId);
    if (!projectId) return res.status(404).json({ error: "No website found" });

    const { data, error } = await customDomainService.disconnectDomain(projectId);
    if (error) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }

    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, "Disconnect domain");
  }
}

// =====================================================================
// RECIPIENTS
// =====================================================================

/** GET /api/user/website/recipients */
export async function getRecipients(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const project = await ProjectModel.findByOrganizationId(orgId);
    if (!project) return res.status(404).json({ error: "No website found" });

    let orgUsers: { name: string; email: string; role: string }[] = [];
    const users = await OrganizationUserModel.listByOrgWithUsers(orgId);
    orgUsers = users.map((u) => ({ name: u.name, email: u.email, role: u.role }));

    return res.json({
      success: true,
      data: {
        recipients: (project as any).recipients || [],
        orgUsers,
      },
    });
  } catch (error) {
    return handleError(res, error, "Fetch recipients");
  }
}

/** PUT /api/user/website/recipients */
export async function updateRecipients(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const project = await ProjectModel.findByOrganizationId(orgId);
    if (!project) return res.status(404).json({ error: "No website found" });

    const { recipients } = req.body;
    if (!Array.isArray(recipients)) {
      return res.status(400).json({ error: "recipients must be an array of email strings" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalid = recipients.filter((e: string) => !emailRegex.test(e));
    if (invalid.length > 0) {
      return res.status(400).json({ error: `Invalid email(s): ${invalid.join(", ")}` });
    }

    await db("website_builder.projects")
      .where("id", project.id)
      .update({ recipients: JSON.stringify(recipients), updated_at: db.fn.now() });

    return res.json({ success: true, data: { recipients } });
  } catch (error) {
    return handleError(res, error, "Update recipients");
  }
}

// =====================================================================
// FORM SUBMISSIONS
// =====================================================================

/** GET /api/user/website/form-submissions */
export async function listFormSubmissions(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const project = await ProjectModel.findByOrganizationId(orgId);
    if (!project) return res.status(404).json({ error: "No website found" });

    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
    const readFilter = req.query.read;

    const filters: { is_read?: boolean } = {};
    if (readFilter === "true") filters.is_read = true;
    if (readFilter === "false") filters.is_read = false;

    const result = await FormSubmissionModel.findByProjectId(
      project.id,
      { page, limit },
      filters,
    );

    const unreadCount = await FormSubmissionModel.countUnreadByProjectId(project.id);

    return res.json({ success: true, data: result.data, pagination: result.pagination, unreadCount });
  } catch (error) {
    return handleError(res, error, "Fetch form submissions");
  }
}

/** GET /api/user/website/form-submissions/:id */
export async function getFormSubmission(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const submission = await FormSubmissionModel.findById(id);

    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    return res.json({ success: true, data: submission });
  } catch (error) {
    return handleError(res, error, "Fetch form submission");
  }
}

// =====================================================================
// VERSION HISTORY
// =====================================================================

/** GET /api/user/website/pages/:pageId/versions */
export async function getPageVersions(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId)
      return res.status(400).json({ error: "No organization found" });

    const { pageId } = req.params;
    const result = await userWebsiteService.listPageVersions(orgId, pageId);

    return res.json({ success: true, data: result });
  } catch (error) {
    return handleError(res, error, "Fetch page versions");
  }
}

/** GET /api/user/website/pages/:pageId/versions/:versionId */
export async function getPageVersionContent(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId)
      return res.status(400).json({ error: "No organization found" });

    const { pageId, versionId } = req.params;
    const version = await userWebsiteService.getPageVersionContent(
      orgId,
      pageId,
      versionId
    );

    return res.json({ success: true, data: version });
  } catch (error) {
    return handleError(res, error, "Fetch page version content");
  }
}

/** POST /api/user/website/pages/:pageId/versions/:versionId/restore */
export async function restorePageVersion(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId)
      return res.status(400).json({ error: "No organization found" });

    const { pageId, versionId } = req.params;
    const result = await userWebsiteService.restorePageVersion(
      orgId,
      pageId,
      versionId
    );

    return res.json({ success: true, data: result });
  } catch (error) {
    return handleError(res, error, "Restore page version");
  }
}

/** PATCH /api/user/website/form-submissions/:id/read */
export async function toggleFormSubmissionRead(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const { is_read } = req.body;

    if (is_read) {
      await FormSubmissionModel.markAsRead(id);
    } else {
      await FormSubmissionModel.markAsUnread(id);
    }

    return res.json({ success: true, data: { is_read } });
  } catch (error) {
    return handleError(res, error, "Toggle submission read");
  }
}
