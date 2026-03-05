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
 * Converts to JSON, creates job, sends to n8n parser webhook.
 * @param authOrganizationId - Organization ID from JWT/RBAC (authoritative). Falls back to domain lookup if null.
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
  const locationId = passedLocationId ?? await resolveLocationId(organizationId);

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

  // Save the raw input data for potential retry
  await PmsJobModel.updateById(jobId, {
    raw_input_data: jsonData,
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

  const response = await axios.post(
    PMS_PARSER_WEBHOOK,
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

  return {
    recordsProcessed,
    recordsStored: recordsProcessed,
    entryType: "csv" as const,
    jobId,
    originalName: file.originalname,
  };
}
