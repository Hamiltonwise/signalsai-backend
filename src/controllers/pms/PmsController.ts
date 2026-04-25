import { Request, Response } from "express";
import * as uploadService from "./pms-services/pms-upload.service";
import * as approvalService from "./pms-services/pms-approval.service";
import * as automationService from "./pms-services/pms-automation.service";
import * as dataService from "./pms-services/pms-data.service";
import * as retryService from "./pms-services/pms-retry.service";
import * as pasteParseService from "./pms-services/pms-paste-parse.service";
import * as sanitizationService from "./pms-services/pms-paste-analysis.service";
import { coerceBoolean } from "./pms-utils/pms-validator.util";
import { validateJobId } from "./pms-utils/pms-validator.util";
import { PmsStatus } from "./pms-utils/pms-constants";
import { RBACRequest } from "../../middleware/rbac";

function handleError(res: Response, error: any, operation: string): Response {
  const statusCode = error.statusCode || 500;
  console.error(`[PMS] ${operation} Error:`, error?.message || error);
  return res.status(statusCode).json({
    success: false,
    error: `Failed to ${operation.toLowerCase()}`,
    message: error?.message || "Unknown error occurred",
  });
}

/**
 * POST /pms/upload
 * Upload and process PMS data from CSV, XLS, XLSX, or TXT files
 * OR accept manually entered data (JSON body with entryType: 'manual')
 */
export async function uploadPmsData(req: Request, res: Response) {
  try {
    const { domain, pmsType, manualData, entryType, locationId: reqLocationId } = req.body;
    const rbacReq = req as RBACRequest;
    const organizationId = rbacReq.organizationId ?? null;
    const locationId = reqLocationId ? Number(reqLocationId) : null;

    if (!domain) {
      return res.status(400).json({
        success: false,
        error: "Missing domain parameter",
      });
    }

    // MANUAL ENTRY PATH
    if (entryType === "manual" && manualData) {
      // Parse manualData if it's a string
      let parsedManualData = manualData;
      if (typeof manualData === "string") {
        try {
          parsedManualData = JSON.parse(manualData);
        } catch (parseError) {
          return res.status(400).json({
            success: false,
            error: "Invalid manualData format - must be valid JSON",
          });
        }
      }

      if (!Array.isArray(parsedManualData) || parsedManualData.length === 0) {
        return res.status(400).json({
          success: false,
          error: "manualData must be a non-empty array of month entries",
        });
      }

      const result = await uploadService.processManualEntry(
        domain,
        parsedManualData,
        organizationId,
        locationId
      );

      return res.json({
        success: true,
        data: {
          recordsProcessed: result.recordsProcessed,
          recordsStored: result.recordsStored,
          entryType: result.entryType,
          jobId: result.jobId,
        },
        message: `Manual entry received - ${result.recordsProcessed} month(s) processed. Insights are being generated.`,
      });
    }

    // FILE UPLOAD PATH
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No data file or manual entry provided",
      });
    }

    const useMappingFlow = req.body?.useMappingFlow === "true" || req.body?.useMappingFlow === true;
    const result = await uploadService.processFileUpload(req.file, domain, organizationId, locationId, { useMappingFlow });

    // Mapping preview path -- caller must POST confirmed mapping next.
    if ((result as any).requiresMapping) {
      return res.json({ success: true, data: result });
    }

    const ingestion = result as Awaited<ReturnType<typeof uploadService.processConfirmedMapping>>;
    return res.json({
      success: true,
      data: {
        recordsProcessed: ingestion.recordsProcessed,
        recordsStored: ingestion.recordsStored,
        entryType: ingestion.entryType,
        jobId: ingestion.jobId,
        instantFinding: ingestion.instantFinding,
        parserFailed: ingestion.parserFailed ?? false,
        parserMessage: (ingestion as any).parserMessage ?? undefined,
        hipaaReport: (ingestion as any).hipaaReport ?? null,
        referralSummary: (ingestion as any).referralSummary ?? null,
        stats: (ingestion as any).stats ?? null,
        plainEnglishSummary: (ingestion as any).plainEnglishSummary ?? null,
      },
      message: `Successfully processed file ${ingestion.originalName} with ${ingestion.recordsProcessed} records`,
    });
  } catch (error: any) {
    console.error("Error in /pms/upload:", error?.message || error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: `Failed to process PMS upload: ${error.message}`,
    });
  }
}

/**
 * POST /pms/upload/confirm-mapping
 * Confirm a Haiku-suggested column mapping for a draft pms_job and run
 * the full ingestion pipeline. Stores the mapping on the organization
 * so future uploads with the same header structure auto-apply it.
 *
 * Body: { jobId: number, mapping: ColumnMapping }
 */
export async function confirmReferralMapping(req: Request, res: Response) {
  try {
    const rbacReq = req as RBACRequest;
    const organizationId = rbacReq.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }
    const { jobId, mapping } = req.body || {};
    if (typeof jobId !== "number" || !Number.isFinite(jobId)) {
      return res.status(400).json({ success: false, error: "jobId is required" });
    }
    if (!mapping || typeof mapping !== "object") {
      return res.status(400).json({ success: false, error: "mapping is required" });
    }
    const result = await uploadService.processConfirmedMapping(jobId, mapping, organizationId);
    return res.json({
      success: true,
      data: {
        recordsProcessed: result.recordsProcessed,
        recordsStored: result.recordsStored,
        jobId: result.jobId,
        instantFinding: result.instantFinding,
        parserFailed: result.parserFailed ?? false,
        plainEnglishSummary: (result as any).plainEnglishSummary ?? null,
        referralSummary: (result as any).referralSummary ?? null,
        stats: (result as any).stats ?? null,
      },
      message: (result as any).plainEnglishSummary || "Mapping confirmed and data ingested.",
    });
  } catch (error: any) {
    return handleError(res, error, "confirmReferralMapping");
  }
}

/**
 * GET /pms/system-notifications
 * Returns un-dismissed system notifications for the authenticated org
 * (e.g. retroactive cleanup notices).
 */
export async function getSystemNotifications(req: Request, res: Response) {
  try {
    const rbacReq = req as RBACRequest;
    const organizationId = rbacReq.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }
    const { db } = await import("../../database/connection");
    const row = await db("organizations").where({ id: organizationId }).select("system_notifications").first();
    const stored = row?.system_notifications;
    const all = Array.isArray(stored) ? stored : (typeof stored === "string" ? JSON.parse(stored) : []);
    const active = all.filter((n: any) => !n.dismissedAt);
    return res.json({ success: true, data: active });
  } catch (error: any) {
    return handleError(res, error, "getSystemNotifications");
  }
}

/**
 * POST /pms/system-notifications/:id/dismiss
 * Marks a single notification dismissed.
 */
export async function dismissSystemNotification(req: Request, res: Response) {
  try {
    const rbacReq = req as RBACRequest;
    const organizationId = rbacReq.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }
    const id = String(req.params.id || "");
    if (!id) {
      return res.status(400).json({ success: false, error: "id is required" });
    }
    const { db } = await import("../../database/connection");
    const row = await db("organizations").where({ id: organizationId }).select("system_notifications").first();
    const stored = row?.system_notifications;
    const all = Array.isArray(stored) ? stored : (typeof stored === "string" ? JSON.parse(stored) : []);
    const updated = all.map((n: any) => n.id === id ? { ...n, dismissedAt: new Date().toISOString() } : n);
    await db("organizations").where({ id: organizationId }).update({ system_notifications: JSON.stringify(updated) });
    return res.json({ success: true });
  } catch (error: any) {
    return handleError(res, error, "dismissSystemNotification");
  }
}

/**
 * POST /pms/summary
 * Placeholder for PMS data summary
 */
export async function getPmsSummary(req: Request, res: Response) {
  try {
    const { clientId } = req.body;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: "Missing clientId",
      });
    }

    // Placeholder response
    return res.json({
      success: true,
      data: {
        summary: {
          totalRecords: 0,
          totalProduction: 0,
          avgProduction: 0,
          earliestDate: null,
          latestDate: null,
          uniqueReferralTypes: 0,
        },
      },
      message: "Summary endpoint placeholder",
    });
  } catch (error: any) {
    console.error("Error in /pms/summary:", error?.message || error);
    return res.status(500).json({
      success: false,
      error: `Failed to fetch PMS summary: ${error.message}`,
    });
  }
}

/**
 * GET /pms/keyData
 * Aggregate PMS key metrics for an organization across all processed jobs.
 */
export async function getKeyData(req: Request, res: Response) {
  try {
    // Use query param if provided, fall back to authenticated org ID
    const queryOrgId = parseInt(String(req.query.organization_id || ""), 10);
    const authOrgId = (req as any).organizationId;
    const organizationId = (!isNaN(queryOrgId) && queryOrgId > 0) ? queryOrgId : authOrgId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid organization_id parameter",
      });
    }

    const locationIdRaw = req.query.location_id
      ? parseInt(String(req.query.location_id), 10)
      : undefined;
    const locationId =
      locationIdRaw !== undefined && !isNaN(locationIdRaw)
        ? locationIdRaw
        : undefined;

    const data = await dataService.aggregateKeyData(organizationId, locationId);

    return res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error("Error in /pms/keyData:", error?.message || error);
    return res.status(500).json({
      success: false,
      error: `Failed to fetch PMS key data: ${error.message}`,
    });
  }
}

/**
 * GET /pms/jobs
 * Fetch paginated PMS job records with optional filtering.
 */
export async function listJobs(req: Request, res: Response) {
  try {
    const {
      page: pageParam,
      status: statusParam,
      isApproved,
      organization_id,
      location_id,
    } = req.query;

    const page = Math.max(parseInt(String(pageParam || "1"), 10) || 1, 1);
    const statuses: PmsStatus[] = Array.isArray(statusParam)
      ? (statusParam as string[])
      : statusParam
      ? String(statusParam)
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : [];

    const approvedFilter = coerceBoolean(isApproved);
    const organizationFilter =
      typeof organization_id === "string" && organization_id.trim().length > 0
        ? parseInt(organization_id.trim(), 10)
        : undefined;
    const locationFilter =
      typeof location_id === "string" && location_id.trim().length > 0
        ? parseInt(location_id.trim(), 10)
        : undefined;

    const data = await dataService.listJobsPaginated(
      { statuses, approvedFilter, organizationFilter, locationFilter },
      page
    );

    return res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error("Error in /pms/jobs:", error?.message || error);
    return res.status(500).json({
      success: false,
      error: `Failed to fetch PMS jobs: ${error.message}`,
    });
  }
}

/**
 * PATCH /pms/jobs/:id/approval
 * Toggle or set the approval status of a PMS job.
 */
export async function approveJob(req: Request, res: Response) {
  try {
    const jobId = validateJobId(req.params.id);

    const requestedApproval = coerceBoolean(req.body?.isApproved);

    if (requestedApproval === undefined) {
      return res.status(400).json({
        success: false,
        error: "isApproved must be provided as a boolean value",
      });
    }

    const result = await approvalService.approveByAdmin(
      jobId,
      requestedApproval
    );

    if (!result.changed) {
      return res.json({
        success: true,
        data: { job: result.job },
        message: "PMS job approval status unchanged",
      });
    }

    return res.json({
      success: true,
      data: { job: result.job },
      message: `PMS job ${
        result.nextApprovalValue ? "approved" : "updated"
      } successfully`,
    });
  } catch (error: any) {
    console.error(
      "Error in /pms/jobs/:id/approval:",
      error?.message || error
    );
    return res.status(error.statusCode || 500).json({
      success: false,
      error: `Failed to update PMS job approval: ${error.message}`,
    });
  }
}

/**
 * PATCH /pms/jobs/:id/client-approval
 * Update the client approval flag for a PMS job.
 */
export async function clientApproveJob(req: Request, res: Response) {
  try {
    const jobId = validateJobId(req.params.id);

    const clientApproval = coerceBoolean(req.body?.isClientApproved);

    if (clientApproval === undefined) {
      return res.status(400).json({
        success: false,
        error: "isClientApproved must be provided as a boolean",
      });
    }

    const result = await approvalService.approveByClient(
      jobId,
      clientApproval
    );

    return res.json({
      success: true,
      data: { job: result.job },
      message: `PMS job client approval ${
        result.clientApproval ? "confirmed" : "reset"
      } successfully`,
      toastMessage: result.clientApproval
        ? "We're now processing and setting up your action items. You'll be notified when ready!"
        : undefined,
    });
  } catch (error: any) {
    console.error(
      "Error in /pms/jobs/:id/client-approval:",
      error?.message || error
    );
    return res.status(error.statusCode || 500).json({
      success: false,
      error: `Failed to update PMS job client approval: ${error.message}`,
    });
  }
}

/**
 * PATCH /pms/jobs/:id/response
 * Update the stored response log JSON for a PMS job.
 */
export async function updateResponseLog(req: Request, res: Response) {
  try {
    const jobId = validateJobId(req.params.id);

    const { responseLog } = req.body ?? {};

    if (responseLog === undefined) {
      return res.status(400).json({
        success: false,
        error: "responseLog body value is required",
      });
    }

    const job = await dataService.updateJobResponse(jobId, responseLog);

    return res.json({
      success: true,
      data: { job },
      message: "PMS job response log updated successfully",
    });
  } catch (error: any) {
    console.error(
      "Error in /pms/jobs/:id/response:",
      error?.message || error
    );
    return res.status(error.statusCode || 500).json({
      success: false,
      error: `Failed to update PMS job response: ${error.message}`,
    });
  }
}

/**
 * DELETE /pms/jobs/:id
 * Permanently remove a PMS job entry.
 */
export async function deleteJob(req: Request, res: Response) {
  try {
    const jobId = validateJobId(req.params.id);

    const data = await dataService.deleteJobById(jobId);

    return res.json({
      success: true,
      data,
      message: "PMS job deleted successfully",
    });
  } catch (error: any) {
    console.error("Error in DELETE /pms/jobs/:id:", error?.message || error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: `Failed to delete PMS job: ${error.message}`,
    });
  }
}

/**
 * GET /pms/jobs/:id/automation-status
 * Polling endpoint for automation progress tracking
 */
export async function getAutomationStatus(req: Request, res: Response) {
  try {
    const jobId = validateJobId(req.params.id);

    const data = await automationService.getJobAutomationStatus(jobId);

    return res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error(
      "Error in /pms/jobs/:id/automation-status:",
      error?.message || error
    );
    return res.status(error.statusCode || 500).json({
      success: false,
      error: `Failed to fetch automation status: ${error.message}`,
    });
  }
}

/**
 * GET /pms/automation/active
 * Get all active (non-completed) PMS automation jobs for dashboard
 */
export async function getActiveAutomations(req: Request, res: Response) {
  try {
    const { organization_id, location_id } = req.query;
    const organizationFilter =
      organization_id && typeof organization_id === "string"
        ? parseInt(organization_id, 10)
        : undefined;
    const locationFilter =
      location_id && typeof location_id === "string"
        ? parseInt(location_id, 10)
        : undefined;

    const data = await automationService.getActiveJobs(
      organizationFilter,
      !isNaN(locationFilter as number) ? locationFilter : undefined
    );

    return res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error(
      "Error in /pms/automation/active:",
      error?.message || error
    );
    return res.status(500).json({
      success: false,
      error: `Failed to fetch active automation jobs: ${error.message}`,
    });
  }
}

/**
 * POST /pms/parse-paste
 * Parse pasted spreadsheet/CSV text using AI (Haiku) and return structured data.
 * Stateless — no database writes. Used by the manual entry modal.
 */
export async function parsePaste(req: Request, res: Response) {
  try {
    const { rawText, currentMonth } = req.body;

    if (!rawText || typeof rawText !== "string") {
      return res.status(400).json({
        success: false,
        error: "rawText is required and must be a string",
      });
    }

    if (
      !currentMonth ||
      typeof currentMonth !== "string" ||
      !/^\d{4}-\d{2}$/.test(currentMonth)
    ) {
      return res.status(400).json({
        success: false,
        error: "currentMonth is required in YYYY-MM format",
      });
    }

    const result = pasteParseService.parsePastedData(rawText, currentMonth);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("Error in /pms/parse-paste:", error?.message || error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error?.message || "Failed to parse pasted data",
    });
  }
}

/**
 * POST /pms/sanitize-paste
 * Deduplicate and clean parsed PMS rows.
 */
export async function sanitizePaste(req: Request, res: Response) {
  try {
    const { rows } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: "rows is required and must be a non-empty array",
      });
    }

    const result = await sanitizationService.sanitizeParsedData(rows);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("Error in /pms/sanitize-paste:", error?.message || error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error?.message || "Failed to sanitize pasted data",
    });
  }
}

/**
 * POST /pms/jobs/:id/restart
 * Delete all data from a completed run and re-trigger from scratch
 */
export async function restartJob(req: Request, res: Response) {
  try {
    const jobId = validateJobId(req.params.id);

    const data = await retryService.restartMonthlyAgents(jobId);

    return res.json({
      success: true,
      message: "Run restarted",
      data,
    });
  } catch (error: any) {
    return handleError(res, error, "Restart job");
  }
}

/**
 * POST /pms/jobs/:id/retry
 * Retry a failed automation step (pms_parser or monthly_agents)
 */
export async function retryJob(req: Request, res: Response) {
  try {
    const jobId = validateJobId(req.params.id);
    const { stepToRetry } = req.body;

    const data = await retryService.retryFailedStep(jobId, stepToRetry);

    return res.json({
      success: true,
      message: `${
        stepToRetry === "pms_parser" ? "PMS parser" : "Monthly agents"
      } retry initiated successfully`,
      data,
    });
  } catch (error: any) {
    console.error(
      "Error in POST /pms/jobs/:id/retry:",
      error?.message || error
    );
    return res.status(error.statusCode || 500).json({
      success: false,
      error: `Failed to retry step: ${error.message}`,
    });
  }
}
