import axios from "axios";
import { PmsJobModel } from "../../../models/PmsJobModel";
import { GoogleConnectionModel } from "../../../models/GoogleConnectionModel";
import { convertFileToJson } from "../pms-utils/file-converter.util";
import {
  initializeAutomationStatus,
  updateAutomationStatus,
  completeStep,
} from "../../../utils/pms/pmsAutomationStatus";
import { resolveLocationId } from "../../../utils/locationResolver";
import { OrganizationModel } from "../../../models/OrganizationModel";
import { detectSelfSufficientOperator } from "../../../services/operatorDetection";
import { preprocessPmsData, type PreprocessResult } from "./pms-preprocessor.service";
import { needsVisionParsing, parseWithVision } from "./pms-vision-parser.service";
import { syncReferralSourcesFromPmsJob } from "../../../services/referralSourceSync";

/**
 * Process a manual PMS data entry.
 * Skips parsing and approvals, auto-triggers monthly agents.
 * @param authOrganizationId - Organization ID from JWT/RBAC (authoritative). Falls back to domain lookup if null.
 */
export async function processManualEntry(
  domain: string,
  parsedManualData: any[],
  authOrganizationId?: number | null,
  passedLocationId?: number | null
) {
  // Use authenticated org ID if available, fall back to domain lookup for backward compat
  let organizationId = authOrganizationId ?? null;
  if (!organizationId && domain) {
    const numericId = parseInt(domain, 10);
    if (!isNaN(numericId) && String(numericId) === domain.trim()) {
      const org = await OrganizationModel.findById(numericId);
      organizationId = org?.id ?? null;
    } else {
      const org = await OrganizationModel.findByDomain(domain);
      organizationId = org?.id ?? null;
    }
  }

  if (!organizationId) {
    throw new Error("Could not determine your organization. Please complete onboarding or contact support.");
  }

  console.log(
    `[PMS] Manual entry received for domain: ${domain}, orgId: ${organizationId}, months: ${parsedManualData.length}`
  );

  // Use passed locationId if available, otherwise resolve from org
  const locationId = passedLocationId ?? await resolveLocationId(organizationId);

  // Create job record with manual entry data
  const job = await PmsJobModel.create({
    time_elapsed: 0,
    status: "approved",
    response_log: {
      monthly_rollup: parsedManualData,
      entry_type: "manual",
    },
    organization_id: organizationId,
    location_id: locationId,
    is_approved: true,
    is_client_approved: true,
  } as any);

  const jobId = job.id;

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
    const account = organizationId
      ? await GoogleConnectionModel.findOneByOrganization(organizationId)
      : undefined;

    if (account) {
      console.log(
        `[PMS] Manual entry: Triggering monthly agents for ${domain}`
      );

      // Fire async request to start monthly agents (don't wait)
      const agentBaseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      axios
        .post(
          `${agentBaseUrl}/api/agents/monthly-agents-run`,
          {
            googleAccountId: account.id,
            domain: domain,
            force: true,
            pmsJobId: jobId,
            locationId: locationId,
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

  return {
    recordsProcessed: parsedManualData.length,
    recordsStored: parsedManualData.length,
    entryType: "manual" as const,
    jobId,
  };
}

/**
 * Extract an instant finding from raw PMS data for immediate display.
 * Runs in-memory on already-parsed JSON, no I/O.
 */
function extractInstantFinding(jsonData: any[]): {
  totalRecords: number;
  topSource?: string;
  topSourceCount?: number;
} {
  const totalRecords = jsonData.length;
  if (totalRecords === 0) return { totalRecords };

  const headers = Object.keys(jsonData[0] || {});
  const sourceColumn = headers.find((h) => {
    const lower = h.toLowerCase();
    return (
      lower.includes("refer") ||
      lower.includes("source") ||
      lower.includes("doctor") ||
      lower.includes("provider") ||
      lower.includes("found us") ||
      lower.includes("how") ||
      lower.includes("lead") ||
      lower.includes("channel") ||
      lower.includes("origin") ||
      lower.includes("acquired") ||
      lower.includes("came from")
    );
  });

  if (!sourceColumn) {
    // Check if the data looks like freeform text (single column, narrative content)
    const isFreeform = headers.length === 1 && jsonData.some((row) => {
      const val = String(Object.values(row)[0] || "");
      return val.length > 30 || val.includes(" - ") || val.includes("=");
    });

    return {
      totalRecords,
      topSource: isFreeform
        ? undefined  // Signal that manual entry might work better
        : undefined,
    };
  }

  const counts: Record<string, number> = {};
  for (const row of jsonData) {
    const val = String(row[sourceColumn] || "").trim();
    if (val && val.toLowerCase() !== "self" && val.toLowerCase() !== "self referral") {
      counts[val] = (counts[val] || 0) + 1;
    }
  }

  const entries = Object.entries(counts);
  if (entries.length === 0) return { totalRecords };

  entries.sort((a, b) => b[1] - a[1]);
  return {
    totalRecords,
    topSource: entries[0][0],
    topSourceCount: entries[0][1],
  };
}

/**
 * Process a file upload (CSV, XLS, XLSX, TXT).
 * Converts to JSON, creates job, sends to n8n parser webhook.
 * @param authOrganizationId - Organization ID from JWT/RBAC (authoritative). Falls back to domain lookup if null.
 */
export async function processFileUpload(
  file: Express.Multer.File,
  domain: string,
  authOrganizationId?: number | null,
  passedLocationId?: number | null
) {
  // Route to vision parser for images/PDFs, CSV converter for everything else
  let jsonData: Record<string, unknown>[];
  let visionConfidence: string | null = null;
  let visionDescription: string | null = null;

  if (needsVisionParsing(file)) {
    console.log(`[PMS] Image/PDF detected: ${file.originalname}. Using vision parser.`);
    const visionResult = await parseWithVision(file);

    if (!visionResult.success || visionResult.rows.length === 0) {
      // Vision parsing failed, but don't block. Return what we have.
      return {
        recordsProcessed: 0,
        recordsStored: 0,
        entryType: "csv" as const,
        jobId: undefined,
        originalName: file.originalname,
        instantFinding: { totalRecords: 0 },
        parserFailed: true,
        parserMessage: visionResult.error ||
          "We couldn't read the data from this image clearly enough. Try a photo with better lighting, or use the manual entry option to type your numbers in directly.",
      };
    }

    jsonData = visionResult.rows;
    visionConfidence = visionResult.confidence;
    visionDescription = visionResult.description;
    console.log(`[PMS] Vision extracted ${jsonData.length} rows (confidence: ${visionConfidence})`);
  } else {
    jsonData = await convertFileToJson(file);
  }

  const recordsProcessed = jsonData.length;

  // HIPAA scrub + patient deduplication + referral aggregation
  // Runs BEFORE data goes to n8n or gets stored
  let preprocessResult: PreprocessResult | null = null;
  try {
    preprocessResult = preprocessPmsData(jsonData);
    if (preprocessResult.hipaaReport.scrubbed) {
      console.log(
        `[PMS] HIPAA scrub: removed ${preprocessResult.hipaaReport.patientNamesFound} patient names ` +
        `and ${preprocessResult.hipaaReport.patientIdsFound} patient IDs from ${preprocessResult.hipaaReport.fieldsScrubbedFrom.join(", ")}`
      );
    }
    if (preprocessResult.stats.deduplicationRatio > 1.5) {
      console.log(
        `[PMS] Deduplication: ${preprocessResult.stats.totalRows} rows -> ${preprocessResult.stats.uniquePatients} unique patients ` +
        `(${preprocessResult.stats.deduplicationRatio}x ratio). ${preprocessResult.stats.uniqueSources} referral sources.`
      );
    }
  } catch (preprocessError: any) {
    console.warn(`[PMS] Preprocessor warning (non-blocking): ${preprocessError.message}`);
    // Non-blocking: if preprocessor fails, fall through to original flow
  }

  // Use scrubbed data for n8n (HIPAA safe) if available
  const dataForParser = preprocessResult?.scrubbedData ?? jsonData;

  // Use authenticated org ID if available, fall back to domain lookup for backward compat
  let organizationId = authOrganizationId ?? null;
  if (!organizationId && domain) {
    const numericId = parseInt(domain, 10);
    if (!isNaN(numericId) && String(numericId) === domain.trim()) {
      const org = await OrganizationModel.findById(numericId);
      organizationId = org?.id ?? null;
    } else {
      const org = await OrganizationModel.findByDomain(domain);
      organizationId = org?.id ?? null;
    }
  }

  if (!organizationId) {
    throw new Error("Could not determine your organization. Please complete onboarding or contact support.");
  }

  // Use passed locationId if available, otherwise resolve from org
  const locationId = passedLocationId ?? await resolveLocationId(organizationId);

  // Run self-sufficient operator detection (fire-and-forget)
  if (organizationId && jsonData.length > 0) {
    const headers = Object.keys(jsonData[0] || {});
    detectSelfSufficientOperator(organizationId, headers, jsonData as Record<string, string>[]).catch(() => {});
  }

  // Create the job record
  const job = await PmsJobModel.create({
    time_elapsed: 0,
    status: "pending",
    response_log: null,
    organization_id: organizationId,
    location_id: locationId,
  } as any);

  const jobId = job.id;

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

  // Save the raw input data for retry (scrubbed version if available)
  await PmsJobModel.updateById(jobId, {
    raw_input_data: dataForParser,
  } as any);

  // Complete file_upload step and start pms_parser step
  await completeStep(jobId, "file_upload", "pms_parser");

  // Update status: sending to parser
  await updateAutomationStatus(jobId, {
    step: "pms_parser",
    stepStatus: "processing",
    customMessage: "Sending to PMS parser agent...",
  });

  const PMS_PARSER_WEBHOOK = process.env.PMS_PARSER_WEBHOOK;
  if (!PMS_PARSER_WEBHOOK) {
    throw new Error("PMS_PARSER_WEBHOOK not configured in environment");
  }

  try {
    const response = await axios.post(
      PMS_PARSER_WEBHOOK,
      {
        report_data: dataForParser, // HIPAA-scrubbed data
        jobId,
        preprocessed: preprocessResult ? {
          uniquePatients: preprocessResult.stats.uniquePatients,
          uniqueSources: preprocessResult.stats.uniqueSources,
          referralSummary: preprocessResult.referralSummary,
        } : undefined,
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 120_000, // 2 minute timeout
      }
    );

    console.log(`[PMS] Parser webhook responded for job ${jobId}:`, response.status);

    // Sync referral sources to referral_sources table (powers Monday email, GP discovery, drift detection)
    if (organizationId && jsonData.length > 0) {
      syncReferralSourcesFromPmsJob(organizationId, jsonData as Record<string, string>[]).catch((err) => {
        console.error(`[PMS] Referral source sync failed for job ${jobId} (non-blocking):`, err instanceof Error ? err.message : err);
      });
    }
  } catch (webhookError: any) {
    console.error(`[PMS] Parser webhook failed for job ${jobId}:`, webhookError.message);

    // Store preprocessor results directly so the client gets immediate value
    // even when the n8n webhook is unavailable. The preprocessor already did
    // deduplication, referral source aggregation, and HIPAA scrubbing locally.
    if (preprocessResult?.referralSummary?.length && organizationId) {
      try {
        await PmsJobModel.updateById(jobId, {
          response_log: JSON.stringify({
            source: "local_preprocessor",
            referralSummary: preprocessResult.referralSummary,
            stats: preprocessResult.stats,
            note: "Processed locally. Full n8n analysis pending retry.",
          }),
          status: "pending_retry",
        } as any);

        await updateAutomationStatus(jobId, {
          step: "pms_parser",
          stepStatus: "processing",
          customMessage: "Your referral data was analyzed locally. Full analysis will complete when our processing system reconnects.",
        });

        console.log(`[PMS] Job ${jobId}: stored local preprocessor results (${preprocessResult.stats.uniqueSources} sources, ${preprocessResult.stats.uniquePatients} patients)`);
      } catch (storeErr: any) {
        console.error(`[PMS] Failed to store preprocessor results for job ${jobId}:`, storeErr.message);
      }
    } else {
      await updateAutomationStatus(jobId, {
        step: "pms_parser",
        stepStatus: "failed",
        customMessage: webhookError.code === "ECONNABORTED"
          ? "Parser timed out after 2 minutes. Try again or use manual entry."
          : `Parser unavailable: ${webhookError.message}. Try again or use manual entry.`,
      });
    }

    console.warn(`[PMS] Job ${jobId} marked for retry. Customer sees preprocessor results immediately.`);

    // Sync referral sources even on webhook failure (the data is local, pipe it through)
    if (organizationId && jsonData.length > 0) {
      syncReferralSourcesFromPmsJob(organizationId, jsonData as Record<string, string>[]).catch(() => {});
    }

    // Use preprocessor results for instant finding when available (more accurate than raw extraction)
    const instantFinding = preprocessResult?.referralSummary?.length
      ? {
          totalRecords: preprocessResult.stats.uniquePatients,
          topSource: preprocessResult.referralSummary[0]?.name !== "Self / Direct"
            ? preprocessResult.referralSummary[0]?.name
            : preprocessResult.referralSummary[1]?.name || preprocessResult.referralSummary[0]?.name,
          topSourceCount: preprocessResult.referralSummary[0]?.name !== "Self / Direct"
            ? preprocessResult.referralSummary[0]?.uniquePatients
            : preprocessResult.referralSummary[1]?.uniquePatients || preprocessResult.referralSummary[0]?.uniquePatients,
        }
      : extractInstantFinding(jsonData);

    return {
      recordsProcessed,
      recordsStored: recordsProcessed,
      entryType: "csv" as const,
      jobId,
      originalName: file.originalname,
      instantFinding,
      parserFailed: true,
      parserMessage: instantFinding?.topSource
        ? `Your referral data was analyzed. Top source: ${instantFinding.topSource} (${instantFinding.topSourceCount} cases). Full analysis completing shortly.`
        : "Your data was received. Our full processing system is temporarily unavailable, but we'll process it shortly.",
    };
  }

  // Use preprocessor results for instant finding if available (more accurate)
  const instantFinding = preprocessResult?.referralSummary?.length
    ? {
        totalRecords: preprocessResult.stats.uniquePatients,
        topSource: preprocessResult.referralSummary[0]?.name !== "Self / Direct"
          ? preprocessResult.referralSummary[0]?.name
          : preprocessResult.referralSummary[1]?.name,
        topSourceCount: preprocessResult.referralSummary[0]?.name !== "Self / Direct"
          ? preprocessResult.referralSummary[0]?.uniquePatients
          : preprocessResult.referralSummary[1]?.uniquePatients,
      }
    : extractInstantFinding(jsonData);

  return {
    recordsProcessed,
    recordsStored: recordsProcessed,
    entryType: "csv" as const,
    jobId,
    originalName: file.originalname,
    instantFinding,
    parserFailed: false,
    hipaaReport: preprocessResult?.hipaaReport ?? null,
    referralSummary: preprocessResult?.referralSummary ?? null,
    stats: preprocessResult?.stats ?? null,
  };
}
