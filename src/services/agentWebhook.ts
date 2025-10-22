/**
 * Agent Webhook Service
 *
 * Handles calls to Proofline AI agent webhooks with retry logic.
 * Sends compiled data to agent endpoints and handles responses.
 */

import axios from "axios";

// =====================================================================
// TYPES
// =====================================================================

export interface AgentWebhookData {
  weekStart: string;
  weekEnd: string;
  domain: string;
  serviceData: {
    ga4Data: any | null;
    gscData: any | null;
    gbpData: any | null;
    clarityData: any | null;
    pmsData: any | null;
  };
}

export interface AgentResponse {
  webhookUrl: string;
  success: boolean;
  data?: any;
  error?: string;
  attempts: number;
}

// =====================================================================
// CONFIGURATION
// =====================================================================

const AGENT_WEBHOOKS = [
  process.env.PROOFLINE_AGENT_WEBHOOK ||
    "https://n8napp.getalloro.com/webhook/proofline-agent",
  process.env.SUMMARY_AGENT_WEBHOOK ||
    "https://n8napp.getalloro.com/webhook/summary-agent",
  process.env.OPPORTUNITY_AGENT_WEBHOOK ||
    "https://n8napp.getalloro.com/webhook/opportunity-agent",
];

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const TIMEOUT = 300000; // 5 minutes

// =====================================================================
// RETRY LOGIC WITH EXPONENTIAL BACKOFF
// =====================================================================

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 * First retry: 1s, Second: 2s, Third: 4s
 */
function calculateBackoffDelay(attempt: number): number {
  return INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
}

/**
 * Call a single webhook with retry logic
 */
async function callWebhookWithRetry(
  webhookUrl: string,
  data: AgentWebhookData,
  logCallback?: (message: string) => void
): Promise<AgentResponse> {
  let lastError: any = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const log = (msg: string) => {
        if (logCallback) logCallback(msg);
        console.log(msg);
      };

      log(
        `[Agent Webhook] Attempt ${attempt}/${MAX_RETRIES} for ${webhookUrl}`
      );

      const response = await axios.post(webhookUrl, data, {
        timeout: TIMEOUT,
        headers: {
          "Content-Type": "application/json",
        },
      });

      log(`[Agent Webhook] ✓ Success on attempt ${attempt} for ${webhookUrl}`);

      return {
        webhookUrl,
        success: true,
        data: response.data,
        attempts: attempt,
      };
    } catch (error: any) {
      lastError = error;
      const errorMsg =
        error.response?.data?.message || error.message || "Unknown error";

      if (logCallback) {
        logCallback(
          `[Agent Webhook] ✗ Attempt ${attempt}/${MAX_RETRIES} failed for ${webhookUrl}: ${errorMsg}`
        );
      }

      console.error(
        `[Agent Webhook] Attempt ${attempt}/${MAX_RETRIES} failed for ${webhookUrl}:`,
        errorMsg
      );

      // Don't retry if it's the last attempt
      if (attempt < MAX_RETRIES) {
        const delay = calculateBackoffDelay(attempt);
        if (logCallback) {
          logCallback(`[Agent Webhook] Retrying in ${delay}ms...`);
        }
        console.log(`[Agent Webhook] Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  // All retries failed
  const finalError =
    lastError?.response?.data?.message ||
    lastError?.message ||
    "All retry attempts failed";

  return {
    webhookUrl,
    success: false,
    error: finalError,
    attempts: MAX_RETRIES,
  };
}

// =====================================================================
// MAIN WEBHOOK CALLER
// =====================================================================

/**
 * Call all agent webhooks in parallel
 * Returns results for all webhooks, including failures
 */
export async function callAgentWebhooks(
  data: AgentWebhookData,
  logCallback?: (message: string) => void
): Promise<AgentResponse[]> {
  const log = (msg: string) => {
    if (logCallback) logCallback(msg);
    console.log(msg);
  };

  log(
    `[Agent Webhooks] Starting parallel webhook calls to ${AGENT_WEBHOOKS.length} endpoints`
  );

  // Call all webhooks in parallel
  const results = await Promise.all(
    AGENT_WEBHOOKS.map((url) => callWebhookWithRetry(url, data, logCallback))
  );

  // Summary
  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success).length;

  log(
    `[Agent Webhooks] Complete: ${successCount} succeeded, ${failureCount} failed`
  );

  return results;
}

/**
 * Compile service data into a format suitable for agent processing
 */
export function compileDataForAgent(
  weekStart: string,
  weekEnd: string,
  domain: string,
  serviceData: any
): AgentWebhookData {
  return {
    weekStart,
    weekEnd,
    domain,
    serviceData: {
      ga4Data: serviceData.ga4Data,
      gscData: serviceData.gscData,
      gbpData: serviceData.gbpData,
      clarityData: serviceData.clarityData,
      pmsData: serviceData.pmsData,
    },
  };
}
