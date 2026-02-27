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
