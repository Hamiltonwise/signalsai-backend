import axios from "axios";
import { PmsJobModel } from "../../../models/PmsJobModel";
import { PmsColumnMappingModel } from "../../../models/PmsColumnMappingModel";
import { GoogleConnectionModel } from "../../../models/GoogleConnectionModel";
import { convertFileToJson } from "../pms-utils/file-converter.util";
import {
  initializeAutomationStatus,
  updateAutomationStatus,
  completeStep,
  setAwaitingApproval,
} from "../../../utils/pms/pmsAutomationStatus";
import { resolveLocationId } from "../../../utils/locationResolver";
import { OrganizationModel } from "../../../models/OrganizationModel";
import { resolveMapping } from "../../../utils/pms/resolveColumnMapping";
import { applyMapping } from "../../../utils/pms/applyColumnMapping";
import { signHeaders } from "../../../utils/pms/headerSignature";

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
  if (!organizationId) {
    const org = await OrganizationModel.findByDomain(domain);
    organizationId = org?.id ?? null;
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
 * Process a file upload (CSV, XLS, XLSX, TXT).
 *
 * Pipeline (post-mapping-system):
 *   1. Convert file → JSON rows (records keyed by header).
 *   2. Resolve a column mapping via the resolver chain
 *      (org-cache → global-library → AI inference).
 *   3. Apply the mapping inline to produce `monthly_rollup`.
 *   4. Persist the mapping into the org's cache (clone-on-confirm) so
 *      subsequent uploads of the same signature are silent.
 *   5. Create a `pms_jobs` row with raw rows + parsed rollup pre-attached.
 *   6. Advance the automation status straight to `admin_approval` —
 *      `pms_parser` ran inline; we don't wait on n8n.
 *
 * NOTE: n8n PMS parsing webhook removed — parsing now handled inline via
 * resolveMapping + applyMapping. See plan
 * 04272026-no-ticket-pms-column-mapping-ai-inference.
 *
 * @param authOrganizationId - Organization ID from JWT/RBAC (authoritative).
 *   Falls back to domain lookup if null.
 */
export async function processFileUpload(
  file: Express.Multer.File,
  domain: string,
  authOrganizationId?: number | null,
  passedLocationId?: number | null
) {
  const jsonData = await convertFileToJson(file);
  const recordsProcessed = jsonData.length;

  // Use authenticated org ID if available, fall back to domain lookup for backward compat
  let organizationId = authOrganizationId ?? null;
  if (!organizationId) {
    const org = await OrganizationModel.findByDomain(domain);
    organizationId = org?.id ?? null;
  }
  // Use passed locationId if available, otherwise resolve from org
  const locationId =
    passedLocationId ?? (await resolveLocationId(organizationId));

  if (!Array.isArray(jsonData) || jsonData.length === 0) {
    throw Object.assign(new Error("Uploaded file produced no rows"), {
      statusCode: 400,
    });
  }

  const headers = Object.keys(jsonData[0] ?? {});
  if (headers.length === 0) {
    throw Object.assign(new Error("Uploaded file has no columns"), {
      statusCode: 400,
    });
  }

  const signature = signHeaders(headers);

  // -----------------------------------------------------------------
  // Resolve mapping (org-cache → global-library → AI inference).
  // Resolver expects a numeric orgId; if we couldn't determine one we
  // pass a sentinel that misses every org-cache and proceeds to library + AI.
  // -----------------------------------------------------------------
  const effectiveOrgId = organizationId ?? -1;
  const resolved = await resolveMapping(
    effectiveOrgId,
    headers,
    jsonData.slice(0, 10) as Record<string, unknown>[]
  );

  // Apply mapping inline → monthly_rollup.
  let monthlyRollup;
  try {
    monthlyRollup = applyMapping(
      jsonData as Record<string, unknown>[],
      resolved.mapping
    );
  } catch (err) {
    // Invalid mapping (both/neither of source/referring_practice mapped).
    // Surface a 400 so the UI can prompt the user to fix the mapping via
    // /pms/jobs/:id/reprocess (after they've confirmed the upload) — but
    // since we haven't created a job yet, we just bail here.
    throw Object.assign(
      new Error(
        err instanceof Error
          ? err.message
          : "Could not apply column mapping to uploaded file."
      ),
      { statusCode: 400 }
    );
  }

  // Clone-on-confirm: upsert mapping into the org's cache so subsequent
  // uploads of the same signature from this org are silent. Only run when
  // we have a real org context.
  let columnMappingId: number | null = null;
  if (organizationId) {
    try {
      const upserted = await PmsColumnMappingModel.upsertOrgMapping(
        organizationId,
        signature,
        resolved.mapping
      );
      columnMappingId = upserted.id;
    } catch (err) {
      console.warn(
        `[PMS] Failed to upsert org mapping for org=${organizationId} signature=${signature}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  // Create the job record with parsed rollup already attached.
  const job = await PmsJobModel.create({
    time_elapsed: 0,
    status: "completed",
    response_log: {
      monthly_rollup: monthlyRollup,
      mapping_source: resolved.source,
      header_signature: signature,
    },
    raw_input_data: {
      rows: jsonData,
      headers,
      signature,
    } as Record<string, unknown>,
    organization_id: organizationId,
    location_id: locationId,
    column_mapping_id: columnMappingId,
  } as any);

  const jobId = job.id;

  if (!jobId) {
    throw new Error("Failed to create PMS job record");
  }

  // Initialize automation status tracking
  await initializeAutomationStatus(jobId);

  // Mark file_upload as completed (file received and converted).
  await completeStep(jobId, "file_upload", "pms_parser");

  // Mark pms_parser as completed inline — we already produced the rollup.
  // Then advance to admin_approval awaiting state so the existing
  // status-tracking automation downstream of `getJobAutomationStatus`
  // doesn't get stuck waiting on n8n.
  await completeStep(jobId, "pms_parser", "admin_approval");
  await setAwaitingApproval(jobId, "admin_approval");

  return {
    recordsProcessed,
    recordsStored: recordsProcessed,
    entryType: "csv" as const,
    jobId,
    originalName: file.originalname,
  };
}
