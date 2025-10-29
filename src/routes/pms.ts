import express from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import csv from "csvtojson";
import axios from "axios";
import db from "../database/connection";

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
 * Converts files to CSV format then to JSON using csvtojson library
 */
pmsRoutes.post("/upload", upload.single("csvFile"), async (req, res) => {
  try {
    const { clientId, pmsType } = req.body;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: "Missing clientId",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No data file provided",
      });
    }

    const fileName = req.file.originalname.toLowerCase();
    let csvData: string;

    const [result] = await db("pms_jobs")
      .insert({
        time_elapsed: 0,
        status: "pending",
        response_log: null,
        domain: "artfulorthodontics.com",
      })
      .returning("id");

    const jobId = result?.id;

    if (!jobId) {
      throw new Error("Failed to create PMS job record");
    }

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

    // return res.json(jsonData);

    if (!jsonData)
      return res.status(500).json({
        success: false,
        error: "Failed to convert file data to JSON",
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

    return res.json({
      success: true,
      data: {
        recordsProcessed,
        recordsStored: recordsProcessed, // For now, same as processed
        jsonData,
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

    const jobsRaw = await db("pms_jobs")
      .select(
        "id",
        "timestamp",
        "response_log",
        "is_approved",
        "is_client_approved"
      )
      .modify((queryBuilder) => {
        queryBuilder.orderBy("timestamp", "asc");

        if (domain) {
          queryBuilder.where("domain", domain);
        }
      });

    const latestJob = await db("pms_jobs")
      .select(
        "id",
        "timestamp",
        "status",
        "is_approved",
        "is_client_approved",
        "response_log"
      )
      .modify((queryBuilder) => {
        if (domain) {
          queryBuilder.where("domain", domain);
        }
      })
      .orderBy("timestamp", "desc")
      .first();

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

    // Track month data with timestamps to keep only the latest
    const monthMap = new Map<
      string,
      {
        month: string;
        selfReferrals: number;
        doctorReferrals: number;
        totalReferrals: number;
        productionTotal: number;
        timestamp: string;
        sources: RawPmsSource[];
      }
    >();

    // Process jobs to build month map (keeping only latest data per month)
    for (const job of approvedJobs) {
      const entries = extractMonthEntriesFromResponse(job.response_log);

      if (!entries.length) {
        continue;
      }

      const jobTimestamp = job.timestamp;

      for (const entry of entries) {
        const monthKey = entry?.month?.trim();

        if (!monthKey) {
          continue;
        }

        const selfReferrals = toNumber(entry.self_referrals);
        const doctorReferrals = toNumber(entry.doctor_referrals);
        const entryTotalReferrals =
          entry.total_referrals !== undefined
            ? toNumber(entry.total_referrals)
            : selfReferrals + doctorReferrals;
        const entryProductionTotal = toNumber(entry.production_total);

        const existingMonth = monthMap.get(monthKey);

        // Only update if this job is newer or month doesn't exist
        if (
          !existingMonth ||
          new Date(jobTimestamp) > new Date(existingMonth.timestamp)
        ) {
          monthMap.set(monthKey, {
            month: monthKey,
            selfReferrals,
            doctorReferrals,
            totalReferrals: entryTotalReferrals,
            productionTotal: entryProductionTotal,
            timestamp: jobTimestamp,
            sources: ensureArray<RawPmsSource>(entry.sources),
          });
        }
      }
    }

    // Now aggregate sources from the final month map
    const sourceMap = new Map<
      string,
      { name: string; referrals: number; production: number }
    >();

    let totalReferrals = 0;
    let totalProduction = 0;

    for (const monthData of monthMap.values()) {
      totalReferrals += monthData.totalReferrals;
      totalProduction += monthData.productionTotal;

      for (const source of monthData.sources) {
        const name = source?.name?.trim();
        if (!name) {
          continue;
        }

        const existing = sourceMap.get(name) ?? {
          name,
          referrals: 0,
          production: 0,
        };

        existing.referrals += toNumber(source.referrals);
        existing.production += toNumber(source.production);

        sourceMap.set(name, existing);
      }
    }

    const months = Array.from(monthMap.values()).sort((a, b) =>
      a.month.localeCompare(b.month)
    );

    const sources = Array.from(sourceMap.values())
      .sort((a, b) => b.production - a.production)
      .map((source, index) => {
        const percentage =
          totalProduction > 0
            ? Number(((source.production / totalProduction) * 100).toFixed(2))
            : 0;

        return {
          rank: index + 1,
          name: source.name,
          referrals: Number(source.referrals.toFixed(2)),
          production: Number(source.production.toFixed(2)),
          percentage,
        };
      });

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
        totals: {
          totalReferrals: Number(totalReferrals.toFixed(2)),
          totalProduction: Number(totalProduction.toFixed(2)),
        },
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

    const baseQuery = db("pms_jobs").modify((queryBuilder) => {
      if (statuses.length > 0) {
        queryBuilder.whereIn("status", statuses);
      }

      if (approvedFilter !== undefined) {
        queryBuilder.where("is_approved", approvedFilter ? 1 : 0);
      }

      if (domainFilter) {
        queryBuilder.where("domain", domainFilter);
      }
    });

    const totalResult = await baseQuery.clone().count({ total: "*" });
    const total = Number(totalResult?.[0]?.total ?? 0);

    const jobsRaw = await baseQuery
      .clone()
      .orderBy("timestamp", "desc")
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);

    const jobs = jobsRaw.map((job: any) => ({
      id: job.id,
      time_elapsed: job.time_elapsed,
      status: job.status,
      response_log: parseResponseLog(job.response_log),
      timestamp: job.timestamp,
      is_approved: job.is_approved === 1 || job.is_approved === true,
      is_client_approved:
        job.is_client_approved === 1 || job.is_client_approved === true,
      domain: job.domain ?? null,
    }));

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
        "is_approved"
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
      message: `PMS job client approval ${
        clientApproval ? "confirmed" : "reset"
      } successfully`,
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
      .update({ response_log: responseValue, is_client_approved: 1 });

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

export default pmsRoutes;
