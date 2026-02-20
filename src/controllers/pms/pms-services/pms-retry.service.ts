import axios from "axios";
import db from "../../../database/connection";
import { GoogleAccountModel } from "../../../models/GoogleAccountModel";
import {
  resetToStep,
  updateAutomationStatus,
  AutomationStatusDetail,
} from "../../../utils/pms/pmsAutomationStatus";

/**
 * Retry a failed automation step.
 * Routes to the appropriate retry handler.
 */
export async function retryFailedStep(
  jobId: number,
  stepToRetry: string
) {
  if (!stepToRetry || !["pms_parser", "monthly_agents"].includes(stepToRetry)) {
    throw Object.assign(
      new Error("stepToRetry must be 'pms_parser' or 'monthly_agents'"),
      { statusCode: 400 }
    );
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
    throw Object.assign(new Error("PMS job not found"), { statusCode: 404 });
  }

  if (stepToRetry === "pms_parser") {
    return retryPmsParser(jobId, job);
  }

  if (stepToRetry === "monthly_agents") {
    return retryMonthlyAgents(jobId, job);
  }

  throw Object.assign(new Error("Invalid retry step"), { statusCode: 400 });
}

/**
 * Retry the PMS parser step.
 * Resets automation, clears approvals, resends to n8n webhook.
 */
async function retryPmsParser(jobId: number, job: any) {
  // Check if we have raw input data to retry with
  if (!job.raw_input_data) {
    throw Object.assign(
      new Error(
        "Cannot retry PMS parser - no raw input data saved. Please re-upload the file."
      ),
      { statusCode: 400 }
    );
  }

  // Parse the raw input data
  let rawData;
  try {
    rawData =
      typeof job.raw_input_data === "string"
        ? JSON.parse(job.raw_input_data)
        : job.raw_input_data;
  } catch (e) {
    throw Object.assign(new Error("Invalid raw input data format"), {
      statusCode: 400,
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
    const PMS_PARSER_WEBHOOK = process.env.PMS_PARSER_WEBHOOK;
    if (!PMS_PARSER_WEBHOOK) {
      throw new Error("PMS_PARSER_WEBHOOK not configured in environment");
    }

    await axios.post(
      PMS_PARSER_WEBHOOK,
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

    return {
      jobId,
      stepRetried: "pms_parser",
    };
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

    throw Object.assign(
      new Error(`Failed to retry PMS parser: ${webhookError.message}`),
      { statusCode: 500 }
    );
  }
}

/**
 * Retry the monthly agents step.
 * Resets automation, triggers monthly agents via internal API.
 */
async function retryMonthlyAgents(jobId: number, job: any) {
  // Monthly agents need: domain, google account, and parsed PMS data (response_log)
  if (!job.domain) {
    throw Object.assign(
      new Error(
        "Cannot retry monthly agents - no domain associated with this job"
      ),
      { statusCode: 400 }
    );
  }

  // Check if response_log exists (PMS data must be parsed first)
  if (!job.response_log) {
    throw Object.assign(
      new Error(
        "Cannot retry monthly agents - PMS data has not been parsed yet"
      ),
      { statusCode: 400 }
    );
  }

  // Get google account for this domain
  const account = await GoogleAccountModel.findByDomain(job.domain);

  if (!account) {
    throw Object.assign(
      new Error(
        `Cannot retry monthly agents - no Google account found for domain ${job.domain}`
      ),
      { statusCode: 400 }
    );
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

    return {
      jobId,
      stepRetried: "monthly_agents",
      domain: job.domain,
    };
  } catch (triggerError: any) {
    console.error(
      `[PMS] Error triggering monthly agents retry: ${triggerError.message}`
    );

    throw Object.assign(
      new Error(
        `Failed to retry monthly agents: ${triggerError.message}`
      ),
      { statusCode: 500 }
    );
  }
}
