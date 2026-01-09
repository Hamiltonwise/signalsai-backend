import express from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import csv from "csvtojson";
import axios from "axios";
import db from "../database/connection";
import { aggregatePmsData } from "../utils/pmsAggregator";
import { createNotification, notifyAdmins } from "../utils/notificationHelper";
import {
  initializeAutomationStatus,
  updateAutomationStatus,
  completeStep,
  setAwaitingApproval,
  getAutomationStatus,
  resetToStep,
  AutomationStatusDetail,
} from "../utils/pmsAutomationStatus";

const APP_URL =
  process.env.NODE_ENV === "production"
    ? "https://app.getalloro.com"
    : "http://localhost:5174";

type PmsStatus = "pending" | "error" | "completed" | string;

const PAGE_SIZE = 10;

const coerceBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const stringValue = String(value).toLowerCase();
  if (["1", "true", "yes"].includes(stringValue)) {
    return true;
  }
  if (["0", "false", "no"].includes(stringValue)) {
    return false;
  }

  return undefined;
};

const parseResponseLog = (value: unknown) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (error) {
      // Fallback to raw string when JSON parsing fails
      return value;
    }
  }

  return value;
};

type RawPmsSource = {
  name?: string;
  referrals?: number | string;
  production?: number | string;
};

type RawPmsMonthEntry = {
  month?: string;
  sources?: RawPmsSource[];
  self_referrals?: number | string;
  total_referrals?: number | string;
  doctor_referrals?: number | string;
  production_total?: number | string;
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.\-]/g, "");
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const ensureArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) {
    return value as T[];
  }
  return [];
};

const extractMonthEntriesFromResponse = (
  responseLog: unknown
): RawPmsMonthEntry[] => {
  if (responseLog === null || responseLog === undefined) {
    return [];
  }

  let candidate: unknown = responseLog;

  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch (error) {
      return [];
    }
  }

  if (Array.isArray(candidate)) {
    return candidate as RawPmsMonthEntry[];
  }

  if (typeof candidate === "object" && candidate !== null) {
    const container = candidate as Record<string, unknown>;

    // Check for monthly_rollup as the canonical field (primary)
    if (Array.isArray(container.monthly_rollup)) {
      return container.monthly_rollup as RawPmsMonthEntry[];
    }

    // Fallback to report_data for backward compatibility
    if (Array.isArray(container.report_data)) {
      return container.report_data as RawPmsMonthEntry[];
    }
  }

  return [];
};

const pmsRoutes = express.Router();

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
      "text/plain",
    ];
    const allowedExtensions = [".csv", ".xls", ".xlsx", ".txt"];
    const hasValidMimeType = allowedTypes.includes(file.mimetype);
    const hasValidExtension = allowedExtensions.some((ext) =>
      file.originalname.toLowerCase().endsWith(ext)
    );

    if (hasValidMimeType || hasValidExtension) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV, XLS, XLSX, and TXT files are allowed"));
    }
  },
});

/**
 * POST /pms/upload
 * Upload and process PMS data from CSV, XLS, XLSX, or TXT files
 * OR accept manually entered data (JSON body with entryType: 'manual')
 *
 * For file uploads: Converts files to CSV format then to JSON using csvtojson library
 * For manual entry: Data goes directly to monthly agents (skips admin/client approval)
 */
pmsRoutes.post("/upload", upload.single("csvFile"), async (req, res) => {
  try {
    const { domain, pmsType, manualData, entryType } = req.body;

    if (!domain) {
      return res.status(400).json({
        success: false,
        error: "Missing domain parameter",
      });
    }

    // =====================================================================
    // MANUAL ENTRY PATH
    // Client entered data directly - skip parsing, skip approvals
    // =====================================================================
    if (entryType === "manual" && manualData) {
      console.log(
        `[PMS] Manual entry received for domain: ${domain}, months: ${
          Array.isArray(manualData) ? manualData.length : 0
        }`
      );

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

      // Create job record with manual entry data
      const [result] = await db("pms_jobs")
        .insert({
          time_elapsed: 0,
          status: "approved", // Skip directly to approved status
          response_log: JSON.stringify({
            monthly_rollup: parsedManualData,
            entry_type: "manual",
          }),
          domain: domain,
          is_approved: 1, // Auto-approve (no admin review needed)
          is_client_approved: 1, // Auto-approve (client entered it themselves)
        })
        .returning("id");

      const jobId = result?.id;

      if (!jobId) {
        throw new Error("Failed to create PMS job record");
      }

      // Initialize automation status tracking
      await initializeAutomationStatus(jobId);

      // Mark file_upload as completed (manual data received)
      await completeStep(jobId, "file_upload");

      // Skip pms_parser step (no AI parsing needed for manual entry)
      await updateAutomationStatus(jobId, {
        step: "pms_parser",
        stepStatus: "skipped",
        customMessage: "Manual entry - no parsing required",
      });

      // Skip admin_approval step (client entered it themselves)
      await updateAutomationStatus(jobId, {
        step: "admin_approval",
        stepStatus: "skipped",
        customMessage: "Manual entry - no admin approval required",
      });

      // Skip client_approval step (client entered it themselves)
      await updateAutomationStatus(jobId, {
        step: "client_approval",
        stepStatus: "skipped",
        customMessage: "Manual entry - no client approval required",
      });

      // Start monthly agents immediately
      await updateAutomationStatus(jobId, {
        status: "processing",
        step: "monthly_agents",
        stepStatus: "processing",
        subStep: "data_fetch",
        customMessage: "Starting monthly agents - fetching data...",
      });

      // Trigger monthly agents immediately
      try {
        const account = await db("google_accounts")
          .where({ domain_name: domain })
          .first();

        if (account) {
          console.log(
            `[PMS] Manual entry: Triggering monthly agents for ${domain}`
          );

          // Fire async request to start monthly agents (don't wait)
          axios
            .post(
              `http://localhost:${
                process.env.PORT || 3000
              }/api/agents/monthly-agents-run`,
              {
                googleAccountId: account.id,
                domain: domain,
                force: true,
                pmsJobId: jobId,
              }
            )
            .then(() => {
              console.log(
                `[PMS] Monthly agents triggered successfully for ${domain} (manual entry)`
              );
            })
            .catch((error) => {
              console.error(
                `[PMS] Failed to trigger monthly agents for manual entry: ${error.message}`
              );
            });
        } else {
          console.warn(
            `[PMS] No google account found for domain ${domain} - monthly agents not triggered`
          );
        }
      } catch (triggerError: any) {
        console.error(
          `[PMS] Error triggering monthly agents for manual entry: ${triggerError.message}`
        );
        // Don't fail the request if agent trigger fails
      }

      return res.json({
        success: true,
        data: {
          recordsProcessed: parsedManualData.length,
          recordsStored: parsedManualData.length,
          entryType: "manual",
          jobId,
        },
        message: `Manual entry received - ${parsedManualData.length} month(s) processed. Insights are being generated.`,
      });
    }

    // =====================================================================
    // FILE UPLOAD PATH (existing logic)
    // =====================================================================
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No data file or manual entry provided",
      });
    }

    const fileName = req.file.originalname.toLowerCase();
    let csvData: string;

    const [result] = await db("pms_jobs")
      .insert({
        time_elapsed: 0,
        status: "pending",
        response_log: null,
        domain: domain,
      })
      .returning("id");

    const jobId = result?.id;

    if (!jobId) {
      throw new Error("Failed to create PMS job record");
    }

    // Initialize automation status tracking
    await initializeAutomationStatus(jobId);

    // Update status: file received
    await updateAutomationStatus(jobId, {
      step: "file_upload",
      stepStatus: "processing",
      customMessage: "Processing uploaded file...",
    });

    if (fileName.endsWith(".csv") || fileName.endsWith(".txt")) {
      // Directly use CSV/TXT buffer as string
      csvData = req.file.buffer.toString("utf-8");
    } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      // Read Excel file and convert to CSV
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        return res.status(400).json({
          success: false,
          error: "No sheet found in Excel file",
        });
      }
      const worksheet = workbook.Sheets[sheetName];
      csvData = XLSX.utils.sheet_to_csv(worksheet);
    } else {
      return res.status(400).json({
        success: false,
        error: "Unsupported file type",
      });
    }

    // Convert CSV data to JSON using csvtojson
    const jsonData = await csv().fromString(csvData);
    const recordsProcessed = jsonData.length;

    if (!jsonData)
      return res.status(500).json({
        success: false,
        error: "Failed to convert file data to JSON",
      });

    // Save the raw input data for potential retry
    await db("pms_jobs")
      .where({ id: jobId })
      .update({ raw_input_data: JSON.stringify(jsonData) });

    // Complete file_upload step and start pms_parser step
    await completeStep(jobId, "file_upload", "pms_parser");

    // Update status: sending to parser
    await updateAutomationStatus(jobId, {
      step: "pms_parser",
      stepStatus: "processing",
      customMessage: "Sending to PMS parser agent...",
    });

    const response = await axios.post(
      "https://n8napp.getalloro.com/webhook/parse-csv",
      {
        report_data: jsonData,
        jobId,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    console.log(response);

    // Parser has been sent to n8n webhook - it will process asynchronously
    // Keep pms_parser in "processing" state until webhook actually completes
    // The webhook callback or job status update will mark it as complete

    return res.json({
      success: true,
      data: {
        recordsProcessed,
        recordsStored: recordsProcessed,
        entryType: "csv",
        jobId,
      },
      message: `Successfully processed file ${req.file.originalname} with ${recordsProcessed} records`,
    });
  } catch (error: any) {
    console.error("❌ Error in /pms/upload:", error?.message || error);
    return res.status(500).json({
      success: false,
      error: `Failed to process PMS upload: ${error.message}`,
    });
  }
});

/**
 * POST /pms/summary
 * Placeholder for PMS data summary
 */
pmsRoutes.post("/summary", async (req, res) => {
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
    console.error("❌ Error in /pms/summary:", error?.message || error);
    return res.status(500).json({
      success: false,
      error: `Failed to fetch PMS summary: ${error.message}`,
    });
  }
});

/**
 * GET /pms/keyData
 * Aggregate PMS key metrics for a given domain across all processed jobs.
 */
pmsRoutes.get("/keyData", async (req, res) => {
  try {
    const domainParam = Array.isArray(req.query.domain)
      ? req.query.domain[0]
      : req.query.domain;

    const domain =
      typeof domainParam === "string" && domainParam.trim().length > 0
        ? domainParam.trim()
        : "artfulorthodontics.com";

    // Build and execute jobs query directly
    let jobsQuery = db("pms_jobs").select(
      "id",
      "timestamp",
      "response_log",
      "is_approved",
      "is_client_approved"
    );
    if (domain) {
      jobsQuery = jobsQuery.where("domain", domain);
    }
    const jobsRaw = await jobsQuery.orderBy("timestamp", "asc");

    // Build and execute latest job query directly
    let latestJobQuery = db("pms_jobs").select(
      "id",
      "timestamp",
      "status",
      "is_approved",
      "is_client_approved",
      "response_log"
    );
    if (domain) {
      latestJobQuery = latestJobQuery.where("domain", domain);
    }
    const latestJob = await latestJobQuery.orderBy("timestamp", "desc").first();

    const normalizeApproval = (value: any): boolean | null => {
      if (value === 1 || value === true || value === "1") {
        return true;
      }
      if (value === 0 || value === false || value === "0") {
        return false;
      }
      return null;
    };

    const normalizeClientApproval = (value: any): boolean | null => {
      if (value === 1 || value === true || value === "1") {
        return true;
      }
      if (value === 0 || value === false || value === "0") {
        return false;
      }
      return null;
    };

    const approvedJobs = jobsRaw.filter(
      (job: any) => normalizeApproval(job.is_approved) === true
    );

    if (!approvedJobs.length) {
      return res.json({
        success: true,
        data: {
          domain,
          months: [],
          sources: [],
          totals: {
            totalReferrals: 0,
            totalProduction: 0,
          },
          stats: {
            jobCount: 0,
            earliestJobTimestamp: null,
            latestJobTimestamp: null,
            distinctMonths: 0,
            latestJobStatus: latestJob?.status ?? null,
            latestJobIsApproved: normalizeApproval(latestJob?.is_approved),
            latestJobIsClientApproved: normalizeClientApproval(
              latestJob?.is_client_approved
            ),
            latestJobId: latestJob?.id ?? null,
          },
          latestJobRaw:
            latestJob?.response_log !== undefined &&
            latestJob?.response_log !== null
              ? parseResponseLog(latestJob.response_log)
              : null,
        },
      });
    }

    // Use shared aggregation function for consistent PMS data handling
    const aggregatedData = await aggregatePmsData(domain);
    const { months, sources, totals } = aggregatedData;

    const stats = {
      jobCount: approvedJobs.length,
      earliestJobTimestamp: approvedJobs[0]?.timestamp ?? null,
      latestJobTimestamp:
        approvedJobs[approvedJobs.length - 1]?.timestamp ?? null,
      distinctMonths: months.length,
      latestJobStatus: latestJob?.status ?? null,
      latestJobIsApproved: normalizeApproval(latestJob?.is_approved),
      latestJobIsClientApproved: normalizeClientApproval(
        latestJob?.is_client_approved
      ),
      latestJobId: latestJob?.id ?? null,
    };

    return res.json({
      success: true,
      data: {
        domain,
        months,
        sources,
        totals,
        stats,
        latestJobRaw:
          latestJob?.response_log !== undefined &&
          latestJob?.response_log !== null
            ? parseResponseLog(latestJob.response_log)
            : null,
      },
    });
  } catch (error: any) {
    console.error("❌ Error in /pms/keyData:", error?.message || error);
    return res.status(500).json({
      success: false,
      error: `Failed to fetch PMS key data: ${error.message}`,
    });
  }
});

/**
 * GET /pms/jobs
 * Fetch paginated PMS job records with optional filtering.
 */
pmsRoutes.get("/jobs", async (req, res) => {
  try {
    const {
      page: pageParam,
      status: statusParam,
      isApproved,
      domain,
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
    const domainFilter =
      typeof domain === "string" && domain.trim().length > 0
        ? domain.trim()
        : undefined;

    // Build count query with filters - execute immediately
    let countQuery = db("pms_jobs");
    if (statuses.length > 0) {
      countQuery = countQuery.whereIn("status", statuses);
    }
    if (approvedFilter !== undefined) {
      countQuery = countQuery.where("is_approved", approvedFilter ? 1 : 0);
    }
    if (domainFilter) {
      countQuery = countQuery.where("domain", domainFilter);
    }
    const totalResult = await countQuery.count({ total: "*" });
    const total = Number(totalResult?.[0]?.total ?? 0);

    // Build data query with same filters - execute immediately
    let dataQuery = db("pms_jobs");
    if (statuses.length > 0) {
      dataQuery = dataQuery.whereIn("status", statuses);
    }
    if (approvedFilter !== undefined) {
      dataQuery = dataQuery.where("is_approved", approvedFilter ? 1 : 0);
    }
    if (domainFilter) {
      dataQuery = dataQuery.where("domain", domainFilter);
    }
    const jobsRaw = await dataQuery
      .orderBy("timestamp", "desc")
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);

    const jobs = jobsRaw.map((job: any) => {
      // Parse automation_status_detail if present
      let automationStatusDetail = null;
      if (job.automation_status_detail) {
        try {
          automationStatusDetail =
            typeof job.automation_status_detail === "string"
              ? JSON.parse(job.automation_status_detail)
              : job.automation_status_detail;
        } catch (e) {
          console.warn(
            `Failed to parse automation_status_detail for job ${job.id}`
          );
        }
      }

      return {
        id: job.id,
        time_elapsed: job.time_elapsed,
        status: job.status,
        response_log: parseResponseLog(job.response_log),
        timestamp: job.timestamp,
        is_approved: job.is_approved === 1 || job.is_approved === true,
        is_client_approved:
          job.is_client_approved === 1 || job.is_client_approved === true,
        domain: job.domain ?? null,
        automation_status_detail: automationStatusDetail,
      };
    });

    const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

    return res.json({
      success: true,
      data: {
        jobs,
        pagination: {
          page,
          perPage: PAGE_SIZE,
          total,
          totalPages,
          hasNextPage: page < totalPages,
        },
        filters: {
          statuses,
          isApproved: approvedFilter,
          domain: domainFilter,
        },
      },
    });
  } catch (error: any) {
    console.error("❌ Error in /pms/jobs:", error?.message || error);
    return res.status(500).json({
      success: false,
      error: `Failed to fetch PMS jobs: ${error.message}`,
    });
  }
});

/**
 * PATCH /pms/jobs/:id/approval
 * Toggle or set the approval status of a PMS job.
 */
pmsRoutes.patch("/jobs/:id/approval", async (req, res) => {
  try {
    const jobId = Number(req.params.id);

    if (Number.isNaN(jobId) || jobId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid job id provided",
      });
    }

    const requestedApproval = coerceBoolean(req.body?.isApproved);

    if (requestedApproval === undefined) {
      return res.status(400).json({
        success: false,
        error: "isApproved must be provided as a boolean value",
      });
    }

    const existingJob = await db("pms_jobs")
      .select(
        "id",
        "time_elapsed",
        "status",
        "response_log",
        "timestamp",
        "is_approved",
        "domain"
      )
      .where({ id: jobId })
      .first();

    if (!existingJob) {
      return res.status(404).json({
        success: false,
        error: "PMS job not found",
      });
    }

    if (existingJob.is_approved === 1 && !requestedApproval) {
      return res.status(400).json({
        success: false,
        error: "Approval status cannot be reverted once enabled",
      });
    }

    const nextApprovalValue = requestedApproval ? 1 : 0;

    const alreadyHasApprovedStatus = existingJob.status === "approved";

    if (
      existingJob.is_approved === nextApprovalValue &&
      (nextApprovalValue === 0 || alreadyHasApprovedStatus)
    ) {
      return res.json({
        success: true,
        data: {
          job: {
            id: existingJob.id,
            time_elapsed: existingJob.time_elapsed,
            status: existingJob.status,
            response_log: parseResponseLog(existingJob.response_log),
            timestamp: existingJob.timestamp,
            is_approved: existingJob.is_approved === 1,
          },
        },
        message: "PMS job approval status unchanged",
      });
    }

    const updatePayload: Record<string, any> = {
      is_approved: nextApprovalValue,
    };

    if (nextApprovalValue === 1 && !alreadyHasApprovedStatus) {
      updatePayload.status = "approved";
    }

    await db("pms_jobs").where({ id: jobId }).update(updatePayload);

    // Update automation status: admin approved, move to client approval
    if (nextApprovalValue === 1) {
      // First, complete pms_parser step if it was still processing
      // (n8n webhook runs async, so it must be done by the time admin can approve)
      await completeStep(jobId, "pms_parser", "admin_approval");
      // Now complete admin_approval and move to client_approval
      await completeStep(jobId, "admin_approval", "client_approval");
      await setAwaitingApproval(jobId, "client_approval");
    }

    // Create notification for PMS approval
    if (nextApprovalValue === 1 && existingJob.domain) {
      await createNotification(
        existingJob.domain,
        "PMS Data Approved",
        "PMS data is now ingested and ready for your review",
        "pms",
        { jobId, timestamp: new Date() }
      );
    }

    const updatedJob = await db("pms_jobs")
      .select(
        "id",
        "time_elapsed",
        "status",
        "response_log",
        "timestamp",
        "is_approved"
      )
      .where({ id: jobId })
      .first();

    return res.json({
      success: true,
      data: {
        job: {
          id: updatedJob?.id,
          time_elapsed: updatedJob?.time_elapsed,
          status: updatedJob?.status,
          response_log: parseResponseLog(updatedJob?.response_log),
          timestamp: updatedJob?.timestamp,
          is_approved: updatedJob?.is_approved === 1,
        },
      },
      message: `PMS job ${
        nextApprovalValue ? "approved" : "updated"
      } successfully`,
    });
  } catch (error: any) {
    console.error(
      "❌ Error in /pms/jobs/:id/approval:",
      error?.message || error
    );
    return res.status(500).json({
      success: false,
      error: `Failed to update PMS job approval: ${error.message}`,
    });
  }
});

/**
 * PATCH /pms/jobs/:id/client-approval
 * Update the client approval flag for a PMS job.
 */
pmsRoutes.patch("/jobs/:id/client-approval", async (req, res) => {
  try {
    const jobId = Number(req.params.id);

    if (Number.isNaN(jobId) || jobId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid job id provided",
      });
    }

    const clientApproval = coerceBoolean(req.body?.isClientApproved);

    if (clientApproval === undefined) {
      return res.status(400).json({
        success: false,
        error: "isClientApproved must be provided as a boolean",
      });
    }

    const existingJob = await db("pms_jobs")
      .select(
        "id",
        "time_elapsed",
        "status",
        "response_log",
        "timestamp",
        "is_approved",
        "is_client_approved"
      )
      .where({ id: jobId })
      .first();

    if (!existingJob) {
      return res.status(404).json({
        success: false,
        error: "PMS job not found",
      });
    }

    await db("pms_jobs")
      .where({ id: jobId })
      .update({ is_client_approved: clientApproval ? 1 : 0 });

    // Update automation status: client approved, start monthly agents
    if (clientApproval) {
      await completeStep(jobId, "client_approval", "monthly_agents");
      await updateAutomationStatus(jobId, {
        status: "processing",
        step: "monthly_agents",
        stepStatus: "processing",
        subStep: "data_fetch",
        customMessage: "Starting monthly agents - fetching data...",
      });
    }

    const updatedJob = await db("pms_jobs")
      .select(
        "id",
        "time_elapsed",
        "status",
        "response_log",
        "timestamp",
        "is_approved",
        "is_client_approved",
        "domain"
      )
      .where({ id: jobId })
      .first();

    // Trigger monthly agents when client approves PMS
    if (clientApproval && updatedJob) {
      console.log(
        `[PMS] Client approved PMS job ${jobId} - triggering monthly agents`
      );

      try {
        // Get google account ID from domain
        const account = await db("google_accounts")
          .where({ domain_name: updatedJob.domain })
          .first();

        if (account) {
          // Trigger monthly agents asynchronously (don't wait for response)
          axios
            .post(
              `http://localhost:${
                process.env.PORT || 3000
              }/api/agents/monthly-agents-run`,
              {
                googleAccountId: account.id,
                domain: updatedJob.domain,
                force: true, // Force re-run to use latest PMS data
                pmsJobId: jobId, // Pass job ID for automation status tracking
              }
            )
            .then(() => {
              console.log(
                `[PMS] Monthly agents triggered successfully for ${updatedJob.domain}`
              );
            })
            .catch((error) => {
              console.error(
                `[PMS] Failed to trigger monthly agents: ${error.message}`
              );
            });
        } else {
          console.warn(
            `[PMS] No account found for domain ${updatedJob.domain}`
          );
        }
      } catch (triggerError: any) {
        console.error(
          `[PMS] Error triggering monthly agents: ${triggerError.message}`
        );
        // Don't fail the approval if agent trigger fails
      }
    }

    return res.json({
      success: true,
      data: {
        job: {
          id: updatedJob?.id,
          time_elapsed: updatedJob?.time_elapsed,
          status: updatedJob?.status,
          response_log: parseResponseLog(updatedJob?.response_log),
          timestamp: updatedJob?.timestamp,
          is_approved: updatedJob?.is_approved === 1,
          is_client_approved:
            updatedJob?.is_client_approved === 1 ||
            updatedJob?.is_client_approved === true,
        },
      },
      message: `PMS job client approval ${
        clientApproval ? "confirmed" : "reset"
      } successfully`,
      toastMessage: clientApproval
        ? "We're now processing and setting up your action items. You'll be notified when ready!"
        : undefined,
    });
  } catch (error: any) {
    console.error(
      "❌ Error in /pms/jobs/:id/client-approval:",
      error?.message || error
    );
    return res.status(500).json({
      success: false,
      error: `Failed to update PMS job client approval: ${error.message}`,
    });
  }
});

/**
 * PATCH /pms/jobs/:id/response
 * Update the stored response log JSON for a PMS job.
 */
pmsRoutes.patch("/jobs/:id/response", async (req, res) => {
  try {
    const jobId = Number(req.params.id);

    if (Number.isNaN(jobId) || jobId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid job id provided",
      });
    }

    const { responseLog } = req.body ?? {};

    if (responseLog === undefined) {
      return res.status(400).json({
        success: false,
        error: "responseLog body value is required",
      });
    }

    let normalizedResponse: any = null;

    if (typeof responseLog === "string") {
      const trimmed = responseLog.trim();
      if (trimmed.length === 0) {
        normalizedResponse = null;
      } else {
        try {
          normalizedResponse = JSON.parse(trimmed);
        } catch (parseError: any) {
          return res.status(400).json({
            success: false,
            error: `responseLog must be valid JSON: ${parseError.message}`,
          });
        }
      }
    } else {
      // Accept objects/arrays directly
      try {
        JSON.stringify(responseLog);
        normalizedResponse = responseLog;
      } catch (parseError: any) {
        return res.status(400).json({
          success: false,
          error: `responseLog must be JSON serializable: ${parseError.message}`,
        });
      }
    }

    const existingJob = await db("pms_jobs")
      .select("id")
      .where({ id: jobId })
      .first();

    if (!existingJob) {
      return res.status(404).json({
        success: false,
        error: "PMS job not found",
      });
    }

    const responseValue =
      normalizedResponse === null ? null : JSON.stringify(normalizedResponse);

    await db("pms_jobs")
      .where({ id: jobId })
      .update({ response_log: responseValue });

    const updatedJob = await db("pms_jobs")
      .select(
        "id",
        "time_elapsed",
        "status",
        "response_log",
        "timestamp",
        "is_approved",
        "is_client_approved"
      )
      .where({ id: jobId })
      .first();

    return res.json({
      success: true,
      data: {
        job: {
          id: updatedJob?.id,
          time_elapsed: updatedJob?.time_elapsed,
          status: updatedJob?.status,
          response_log: parseResponseLog(updatedJob?.response_log),
          timestamp: updatedJob?.timestamp,
          is_approved: updatedJob?.is_approved === 1,
          is_client_approved:
            updatedJob?.is_client_approved === 1 ||
            updatedJob?.is_client_approved === true,
        },
      },
      message: "PMS job response log updated successfully",
    });
  } catch (error: any) {
    console.error(
      "❌ Error in /pms/jobs/:id/response:",
      error?.message || error
    );
    return res.status(500).json({
      success: false,
      error: `Failed to update PMS job response: ${error.message}`,
    });
  }
});

/**
 * DELETE /pms/jobs/:id
 * Permanently remove a PMS job entry.
 */
pmsRoutes.delete("/jobs/:id", async (req, res) => {
  try {
    const jobId = Number(req.params.id);

    if (Number.isNaN(jobId) || jobId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid job id provided",
      });
    }

    const existingJob = await db("pms_jobs")
      .select("id")
      .where({ id: jobId })
      .first();

    if (!existingJob) {
      return res.status(404).json({
        success: false,
        error: "PMS job not found",
      });
    }

    await db("pms_jobs").where({ id: jobId }).delete();

    return res.json({
      success: true,
      data: { id: jobId },
      message: "PMS job deleted successfully",
    });
  } catch (error: any) {
    console.error("❌ Error in DELETE /pms/jobs/:id:", error?.message || error);
    return res.status(500).json({
      success: false,
      error: `Failed to delete PMS job: ${error.message}`,
    });
  }
});

/**
 * GET /pms/jobs/:id/automation-status
 * Polling endpoint for automation progress tracking
 */
pmsRoutes.get("/jobs/:id/automation-status", async (req, res) => {
  try {
    const jobId = Number(req.params.id);

    if (Number.isNaN(jobId) || jobId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid job id provided",
      });
    }

    // Get job with automation status
    const job = await db("pms_jobs")
      .where({ id: jobId })
      .select(
        "id",
        "domain",
        "status",
        "is_approved",
        "is_client_approved",
        "automation_status_detail",
        "timestamp",
        "response_log"
      )
      .first();

    if (!job) {
      return res.status(404).json({
        success: false,
        error: "PMS job not found",
      });
    }

    // Parse automation status
    let automationStatus: AutomationStatusDetail | null = null;
    if (job.automation_status_detail) {
      automationStatus =
        typeof job.automation_status_detail === "string"
          ? JSON.parse(job.automation_status_detail)
          : job.automation_status_detail;
    }

    // Auto-advance: If job status is "completed" but pms_parser is still processing,
    // n8n has finished - advance to admin_approval awaiting
    if (
      job.status === "completed" &&
      automationStatus?.steps?.pms_parser?.status === "processing" &&
      !job.is_approved
    ) {
      await completeStep(jobId, "pms_parser", "admin_approval");
      await setAwaitingApproval(jobId, "admin_approval");

      // Send admin email notification that PMS output is ready for review
      try {
        const domain = job.domain || "Unknown";
        await notifyAdmins({
          summary: `PMS parser output is ready for admin review for ${domain}`,
          newActionItems: 1,
          practiceRankingsCompleted: [],
          monthlyAgentsCompleted: [],
        });
        console.log(
          `[PMS] ✓ Admin email sent for PMS job ${jobId} ready for review`
        );
      } catch (emailError: any) {
        console.error(
          `[PMS] ⚠ Failed to send admin email for PMS job ${jobId}:`,
          emailError.message
        );
        // Don't fail the request if email fails
      }

      // Refresh the automation status
      const updatedJob = await db("pms_jobs")
        .where({ id: jobId })
        .select("automation_status_detail")
        .first();
      if (updatedJob?.automation_status_detail) {
        automationStatus =
          typeof updatedJob.automation_status_detail === "string"
            ? JSON.parse(updatedJob.automation_status_detail)
            : updatedJob.automation_status_detail;
      }
    }

    return res.json({
      success: true,
      data: {
        jobId: job.id,
        domain: job.domain,
        jobStatus: job.status,
        isAdminApproved: job.is_approved === 1 || job.is_approved === true,
        isClientApproved:
          job.is_client_approved === 1 || job.is_client_approved === true,
        timestamp: job.timestamp,
        automationStatus: automationStatus,
      },
    });
  } catch (error: any) {
    console.error(
      "❌ Error in /pms/jobs/:id/automation-status:",
      error?.message || error
    );
    return res.status(500).json({
      success: false,
      error: `Failed to fetch automation status: ${error.message}`,
    });
  }
});

/**
 * GET /pms/automation/active
 * Get all active (non-completed) PMS automation jobs for dashboard
 */
pmsRoutes.get("/automation/active", async (req, res) => {
  try {
    const { domain } = req.query;

    let query = db("pms_jobs")
      .whereNotNull("automation_status_detail")
      .whereRaw(
        "automation_status_detail::jsonb->>'status' IN ('pending', 'processing', 'awaiting_approval')"
      )
      .select(
        "id",
        "domain",
        "status",
        "is_approved",
        "is_client_approved",
        "automation_status_detail",
        "timestamp"
      )
      .orderBy("timestamp", "desc");

    if (domain && typeof domain === "string") {
      query = query.where("domain", domain);
    }

    const jobs = await query;

    const formattedJobs = jobs.map((job) => {
      let automationStatus: AutomationStatusDetail | null = null;
      if (job.automation_status_detail) {
        automationStatus =
          typeof job.automation_status_detail === "string"
            ? JSON.parse(job.automation_status_detail)
            : job.automation_status_detail;
      }

      return {
        jobId: job.id,
        domain: job.domain,
        jobStatus: job.status,
        isAdminApproved: job.is_approved === 1 || job.is_approved === true,
        isClientApproved:
          job.is_client_approved === 1 || job.is_client_approved === true,
        timestamp: job.timestamp,
        automationStatus: automationStatus,
      };
    });

    return res.json({
      success: true,
      data: {
        jobs: formattedJobs,
        count: formattedJobs.length,
      },
    });
  } catch (error: any) {
    console.error(
      "❌ Error in /pms/automation/active:",
      error?.message || error
    );
    return res.status(500).json({
      success: false,
      error: `Failed to fetch active automation jobs: ${error.message}`,
    });
  }
});

/**
 * POST /pms/jobs/:id/retry
 * Retry a failed automation step (pms_parser or monthly_agents)
 */
pmsRoutes.post("/jobs/:id/retry", async (req, res) => {
  try {
    const jobId = Number(req.params.id);

    if (Number.isNaN(jobId) || jobId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid job id provided",
      });
    }

    const { stepToRetry } = req.body;

    if (
      !stepToRetry ||
      !["pms_parser", "monthly_agents"].includes(stepToRetry)
    ) {
      return res.status(400).json({
        success: false,
        error: "stepToRetry must be 'pms_parser' or 'monthly_agents'",
      });
    }

    // Get the job with all relevant data
    const job = await db("pms_jobs")
      .where({ id: jobId })
      .select(
        "id",
        "domain",
        "status",
        "raw_input_data",
        "response_log",
        "automation_status_detail",
        "is_approved",
        "is_client_approved"
      )
      .first();

    if (!job) {
      return res.status(404).json({
        success: false,
        error: "PMS job not found",
      });
    }

    // Parse automation status to check if the step actually failed
    let automationStatus: AutomationStatusDetail | null = null;
    if (job.automation_status_detail) {
      automationStatus =
        typeof job.automation_status_detail === "string"
          ? JSON.parse(job.automation_status_detail)
          : job.automation_status_detail;
    }

    // Retry PMS Parser
    if (stepToRetry === "pms_parser") {
      // Check if we have raw input data to retry with
      if (!job.raw_input_data) {
        return res.status(400).json({
          success: false,
          error:
            "Cannot retry PMS parser - no raw input data saved. Please re-upload the file.",
        });
      }

      // Parse the raw input data
      let rawData;
      try {
        rawData =
          typeof job.raw_input_data === "string"
            ? JSON.parse(job.raw_input_data)
            : job.raw_input_data;
      } catch (e) {
        return res.status(400).json({
          success: false,
          error: "Invalid raw input data format",
        });
      }

      // Reset automation status to pms_parser step
      await resetToStep(jobId, "pms_parser");

      // Update job status back to pending
      await db("pms_jobs").where({ id: jobId }).update({
        status: "pending",
        response_log: null,
        is_approved: 0,
        is_client_approved: 0,
      });

      // Update automation status to processing
      await updateAutomationStatus(jobId, {
        status: "processing",
        step: "pms_parser",
        stepStatus: "processing",
        customMessage: "Retrying PMS parser agent...",
      });

      // Resend to n8n webhook
      try {
        await axios.post(
          "https://n8napp.getalloro.com/webhook/parse-csv",
          {
            report_data: rawData,
            jobId,
          },
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        console.log(
          `[PMS] Successfully triggered PMS parser retry for job ${jobId}`
        );

        return res.json({
          success: true,
          message: "PMS parser retry initiated successfully",
          data: {
            jobId,
            stepRetried: "pms_parser",
          },
        });
      } catch (webhookError: any) {
        console.error(
          `[PMS] Failed to trigger PMS parser retry: ${webhookError.message}`
        );

        // Mark as failed again
        await updateAutomationStatus(jobId, {
          status: "failed",
          step: "pms_parser",
          stepStatus: "failed",
          error: `Retry failed: ${webhookError.message}`,
          customMessage: `Retry failed: ${webhookError.message}`,
        });

        return res.status(500).json({
          success: false,
          error: `Failed to retry PMS parser: ${webhookError.message}`,
        });
      }
    }

    // Retry Monthly Agents
    if (stepToRetry === "monthly_agents") {
      // Monthly agents need: domain, google account, and parsed PMS data (response_log)
      if (!job.domain) {
        return res.status(400).json({
          success: false,
          error:
            "Cannot retry monthly agents - no domain associated with this job",
        });
      }

      // Check if response_log exists (PMS data must be parsed first)
      if (!job.response_log) {
        return res.status(400).json({
          success: false,
          error:
            "Cannot retry monthly agents - PMS data has not been parsed yet",
        });
      }

      // Get google account for this domain
      const account = await db("google_accounts")
        .where({ domain_name: job.domain })
        .first();

      if (!account) {
        return res.status(400).json({
          success: false,
          error: `Cannot retry monthly agents - no Google account found for domain ${job.domain}`,
        });
      }

      // Reset automation status to monthly_agents step
      await resetToStep(jobId, "monthly_agents");

      // Update automation status to processing
      await updateAutomationStatus(jobId, {
        status: "processing",
        step: "monthly_agents",
        stepStatus: "processing",
        subStep: "data_fetch",
        customMessage: "Retrying monthly agents - fetching data...",
      });

      // Trigger monthly agents
      try {
        axios
          .post(
            `http://localhost:${
              process.env.PORT || 3000
            }/api/agents/monthly-agents-run`,
            {
              googleAccountId: account.id,
              domain: job.domain,
              force: true,
              pmsJobId: jobId,
            }
          )
          .then(() => {
            console.log(
              `[PMS] Monthly agents retry triggered successfully for ${job.domain}`
            );
          })
          .catch((error) => {
            console.error(
              `[PMS] Failed to trigger monthly agents retry: ${error.message}`
            );
          });

        return res.json({
          success: true,
          message: "Monthly agents retry initiated successfully",
          data: {
            jobId,
            stepRetried: "monthly_agents",
            domain: job.domain,
          },
        });
      } catch (triggerError: any) {
        console.error(
          `[PMS] Error triggering monthly agents retry: ${triggerError.message}`
        );

        return res.status(500).json({
          success: false,
          error: `Failed to retry monthly agents: ${triggerError.message}`,
        });
      }
    }

    return res.status(400).json({
      success: false,
      error: "Invalid retry step",
    });
  } catch (error: any) {
    console.error(
      "❌ Error in POST /pms/jobs/:id/retry:",
      error?.message || error
    );
    return res.status(500).json({
      success: false,
      error: `Failed to retry step: ${error.message}`,
    });
  }
});

export default pmsRoutes;
