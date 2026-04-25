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
import {
  applyMapping,
  computeHeadersFingerprint,
  getStoredMapping,
  suggestColumnMapping,
  storeMapping,
  type ColumnMapping,
  type MappingSuggestion,
  type StoredMapping,
} from "../../../services/referralColumnMapping";

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

  // Sync referral sources from manual entry data -- this powers the intelligence
  // page regardless of whether Google connection or monthly agents exist
  if (organizationId && parsedManualData.length > 0) {
    syncReferralSourcesFromPmsJob(organizationId, parsedManualData as Record<string, string>[]).catch((err) => {
      console.error(`[PMS] Referral source sync failed for manual entry job ${jobId}:`, err instanceof Error ? err.message : err);
    });
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
 * Resolve organizationId from auth context or domain.
 */
async function resolveOrgId(domain: string, authOrganizationId?: number | null): Promise<number | null> {
  if (authOrganizationId) return authOrganizationId;
  if (!domain) return null;
  const numericId = parseInt(domain, 10);
  if (!isNaN(numericId) && String(numericId) === domain.trim()) {
    const org = await OrganizationModel.findById(numericId);
    return org?.id ?? null;
  }
  const org = await OrganizationModel.findByDomain(domain);
  return org?.id ?? null;
}

/**
 * Build the plain-English confirmation summary that users see after a successful
 * mapped ingestion. "We found X referrals from Y sources covering [date range]."
 */
function buildPlainEnglishSummary(jsonData: Record<string, unknown>[], preprocessResult: PreprocessResult | null): string {
  if (!preprocessResult) {
    return `We received ${jsonData.length} rows. Analysis in progress.`;
  }
  const sources = preprocessResult.referralSummary.filter((s) => s.name !== "Self / Direct" && s.name !== "Unknown");
  const referralCount = sources.reduce((sum, s) => sum + s.uniquePatients, 0);
  const sourceCount = sources.length;

  const allDates = preprocessResult.referralSummary
    .flatMap((s) => s.details.map((d) => d.date))
    .filter((d): d is string => typeof d === "string" && d.length > 0)
    .sort();

  let dateRange = "";
  if (allDates.length > 0) {
    const first = allDates[0];
    const last = allDates[allDates.length - 1];
    if (first === last) {
      dateRange = ` in ${first}`;
    } else {
      dateRange = ` covering ${first} through ${last}`;
    }
  }

  if (referralCount === 0 || sourceCount === 0) {
    return `We received your file but couldn't find referral sources we recognize. Confirm or adjust the column mapping above and try again.`;
  }
  return `We found ${referralCount} referrals from ${sourceCount} ${sourceCount === 1 ? "source" : "sources"}${dateRange}. Does this look right?`;
}

interface IngestionPipelineOptions {
  jsonData: Record<string, unknown>[];
  organizationId: number;
  locationId: number | null;
  originalName: string;
  /** When set, reuse this draft job instead of creating a new one. */
  existingJobId?: number;
}

/**
 * Run the post-mapping ingestion pipeline. Called by both processFileUpload
 * (when no confirmation is needed) and processConfirmedMapping (when the
 * user has confirmed the mapping for a draft job).
 *
 * Does: HIPAA scrub, dedup, create-or-update pms_job, POST to n8n parser,
 * fall back to local preprocessor if n8n fails, run referralSourceSync.
 */
async function runIngestionPipeline(opts: IngestionPipelineOptions) {
  const { jsonData, organizationId, locationId, originalName, existingJobId } = opts;
  const recordsProcessed = jsonData.length;

  // HIPAA scrub + patient deduplication + referral aggregation
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
  }

  const dataForParser = preprocessResult?.scrubbedData ?? jsonData;

  // Track sync result for customer feedback on unrecognized formats
  let syncResult: { synced: number; skipped: number; zeroSourcesDetected?: boolean; headersSeen?: string[] } | null = null;

  // Self-sufficient operator detection (fire-and-forget)
  if (jsonData.length > 0) {
    const headers = Object.keys(jsonData[0] || {});
    detectSelfSufficientOperator(organizationId, headers, jsonData as Record<string, string>[]).catch(() => {});
  }

  // Create or reuse the job record
  let jobId: number;
  if (existingJobId) {
    jobId = existingJobId;
    await PmsJobModel.updateById(jobId, {
      status: "pending",
      response_log: null,
      raw_input_data: dataForParser,
    } as any);
  } else {
    const job = await PmsJobModel.create({
      time_elapsed: 0,
      status: "pending",
      response_log: null,
      organization_id: organizationId,
      location_id: locationId,
    } as any);
    if (!job.id) throw new Error("Failed to create PMS job record");
    jobId = job.id;
  }

  await initializeAutomationStatus(jobId);
  await updateAutomationStatus(jobId, {
    step: "file_upload",
    stepStatus: "processing",
    customMessage: "Processing uploaded file...",
  });
  if (!existingJobId) {
    await PmsJobModel.updateById(jobId, { raw_input_data: dataForParser } as any);
  }
  await completeStep(jobId, "file_upload", "pms_parser");
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
        report_data: dataForParser,
        jobId,
        preprocessed: preprocessResult ? {
          uniquePatients: preprocessResult.stats.uniquePatients,
          uniqueSources: preprocessResult.stats.uniqueSources,
          referralSummary: preprocessResult.referralSummary,
        } : undefined,
      },
      { headers: { "Content-Type": "application/json" }, timeout: 120_000 }
    );
    console.log(`[PMS] Parser webhook responded for job ${jobId}:`, response.status);
    try {
      await PmsJobModel.updateById(jobId, { is_approved: true, status: "approved" } as any);
    } catch (approveErr: any) {
      console.error(`[PMS] Job ${jobId}: auto-approve failed (non-blocking):`, approveErr.message);
    }
    if (jsonData.length > 0) {
      try {
        syncResult = await syncReferralSourcesFromPmsJob(organizationId, jsonData as Record<string, string>[]);
      } catch (err) {
        console.error(`[PMS] Referral source sync failed for job ${jobId} (non-blocking):`, err instanceof Error ? err.message : err);
      }
    }
  } catch (webhookError: any) {
    console.error(`[PMS] Parser webhook failed for job ${jobId}:`, webhookError.message);
    if (preprocessResult?.referralSummary?.length) {
      try {
        await PmsJobModel.updateById(jobId, {
          response_log: JSON.stringify({
            source: "local_preprocessor",
            referralSummary: preprocessResult.referralSummary,
            stats: preprocessResult.stats,
            note: "Processed locally. Full n8n analysis pending retry.",
          }),
          status: "pending_retry",
          is_approved: true,
        } as any);
        await updateAutomationStatus(jobId, {
          step: "pms_parser",
          stepStatus: "processing",
          customMessage: "Your referral data was analyzed locally. Full analysis will complete when our processing system reconnects.",
        });
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
    if (jsonData.length > 0) {
      syncReferralSourcesFromPmsJob(organizationId, jsonData as Record<string, string>[]).catch((err) => {
        console.error(`[PMS] Referral source sync failed for job ${jobId} (n8n fallback, non-blocking):`, err instanceof Error ? err.message : err);
      });
    }
    try {
      await PmsJobModel.updateById(jobId, { is_approved: true } as any);
    } catch {
      // non-blocking
    }
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
      originalName,
      instantFinding,
      parserFailed: true,
      parserMessage: instantFinding?.topSource
        ? `Your referral data was analyzed. Top source: ${instantFinding.topSource} (${instantFinding.topSourceCount} cases). Full analysis completing shortly.`
        : "Your data was received. Our full processing system is temporarily unavailable, but we'll process it shortly.",
      plainEnglishSummary: buildPlainEnglishSummary(jsonData, preprocessResult),
    };
  }

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
    originalName,
    instantFinding,
    parserFailed: false,
    hipaaReport: preprocessResult?.hipaaReport ?? null,
    referralSummary: preprocessResult?.referralSummary ?? null,
    stats: preprocessResult?.stats ?? null,
    referralSyncResult: syncResult ?? undefined,
    plainEnglishSummary: buildPlainEnglishSummary(jsonData, preprocessResult),
  };
}

export interface MappingPreviewResponse {
  requiresMapping: true;
  reason: "first_upload" | "structure_changed";
  jobId: number;
  headers: string[];
  sampleRows: Record<string, unknown>[];
  suggestion: MappingSuggestion;
  fingerprint: string;
  previousMapping?: StoredMapping | null;
}

/**
 * Process a file upload (CSV, XLS, XLSX, TXT).
 *
 * If the org has a stored mapping with a matching headers fingerprint, the
 * mapping is auto-applied and ingestion runs to completion. If the headers
 * have changed, or this is a first upload and the caller opted into the
 * mapping flow (useMappingFlow=true), the function returns a preview
 * response with a Haiku-suggested mapping and a draft job. The caller then
 * POSTs to /pms/upload/confirm-mapping with the confirmed mapping.
 *
 * @param authOrganizationId - Organization ID from JWT/RBAC (authoritative).
 */
export async function processFileUpload(
  file: Express.Multer.File,
  domain: string,
  authOrganizationId?: number | null,
  passedLocationId?: number | null,
  options?: { useMappingFlow?: boolean }
) {
  // Route to vision parser for images/PDFs, CSV converter for everything else
  let jsonData: Record<string, unknown>[];

  if (needsVisionParsing(file)) {
    console.log(`[PMS] Image/PDF detected: ${file.originalname}. Using vision parser.`);
    const visionResult = await parseWithVision(file);

    if (!visionResult.success || visionResult.rows.length === 0) {
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
    console.log(`[PMS] Vision extracted ${jsonData.length} rows (confidence: ${visionResult.confidence})`);
  } else {
    jsonData = await convertFileToJson(file);
  }

  const organizationId = await resolveOrgId(domain, authOrganizationId);
  if (!organizationId) {
    throw new Error("Could not determine your organization. Please complete onboarding or contact support.");
  }
  const locationId = passedLocationId ?? await resolveLocationId(organizationId);

  // ============================================================
  // Mapping preflight
  // ============================================================
  const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
  const fingerprint = computeHeadersFingerprint(headers);
  const stored = jsonData.length > 0 ? await getStoredMapping(organizationId) : null;

  if (stored && stored.headersFingerprint === fingerprint) {
    // Stored mapping matches current upload structure. Auto-apply, ingest.
    const mapped = applyMapping(jsonData, stored);
    return runIngestionPipeline({
      jsonData: mapped,
      organizationId,
      locationId,
      originalName: file.originalname,
    });
  }

  const headersChanged = !!stored && stored.headersFingerprint !== fingerprint;
  const firstUploadNeedsMapping = !stored && options?.useMappingFlow === true;

  if (jsonData.length > 0 && (headersChanged || firstUploadNeedsMapping)) {
    // Save raw data to a draft job, ask Haiku for a mapping suggestion, return preview.
    const draftJob = await PmsJobModel.create({
      time_elapsed: 0,
      status: "pending_mapping",
      response_log: null,
      organization_id: organizationId,
      location_id: locationId,
    } as any);
    if (!draftJob.id) throw new Error("Failed to create draft PMS job for mapping review");

    await PmsJobModel.updateById(draftJob.id, { raw_input_data: jsonData } as any);

    let suggestion: MappingSuggestion;
    try {
      suggestion = await suggestColumnMapping(headers, jsonData.slice(0, 10));
    } catch (err) {
      console.error(`[PMS] Mapping suggestion failed for job ${draftJob.id}:`, err instanceof Error ? err.message : err);
      suggestion = {
        mapping: { source: null, date: null, amount: null, count: null, patient: null, procedure: null, provider: null },
        confidence: {},
        rationale: {},
        warnings: ["Mapping suggestion service unavailable. Please pick the columns manually."],
      };
    }

    const response: MappingPreviewResponse = {
      requiresMapping: true,
      reason: headersChanged ? "structure_changed" : "first_upload",
      jobId: draftJob.id,
      headers,
      sampleRows: jsonData.slice(0, 10),
      suggestion,
      fingerprint,
      previousMapping: stored,
    };
    return response;
  }

  // Legacy path: no stored mapping, useMappingFlow not opted in. Run heuristics
  // as before -- existing surfaces keep working until they migrate.
  return runIngestionPipeline({
    jsonData,
    organizationId,
    locationId,
    originalName: file.originalname,
  });
}

/**
 * Apply a confirmed mapping to a draft pms_job's raw_input_data and run
 * the full ingestion pipeline. Stores the mapping on the organization so
 * future uploads with the same fingerprint apply it automatically.
 */
export async function processConfirmedMapping(
  jobId: number,
  confirmedMapping: ColumnMapping,
  authOrganizationId: number,
): Promise<ReturnType<typeof runIngestionPipeline>> {
  const job = await PmsJobModel.findById(jobId);
  if (!job) throw new Error(`PMS job ${jobId} not found`);
  if (job.organization_id !== authOrganizationId) {
    throw new Error("This job does not belong to your organization");
  }
  if (!job.raw_input_data) throw new Error(`PMS job ${jobId} has no raw input data to remap`);

  const rawData = job.raw_input_data as unknown as Record<string, unknown>[];
  if (!Array.isArray(rawData) || rawData.length === 0) {
    throw new Error(`PMS job ${jobId} raw input data is empty or malformed`);
  }

  const headers = Object.keys(rawData[0]);
  const fingerprint = computeHeadersFingerprint(headers);

  // Persist mapping for future auto-application
  await storeMapping(authOrganizationId, confirmedMapping, fingerprint, "user");

  const mapped = applyMapping(rawData, confirmedMapping);

  return runIngestionPipeline({
    jsonData: mapped,
    organizationId: authOrganizationId,
    locationId: job.location_id ?? null,
    originalName: `job-${jobId}-mapped`,
    existingJobId: jobId,
  });
}
