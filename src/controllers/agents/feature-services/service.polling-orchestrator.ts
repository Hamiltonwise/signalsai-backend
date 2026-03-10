/**
 * Polling Orchestrator Service
 *
 * Fire-and-forget webhook calls to n8n, then poll agent_results table
 * for the result. n8n writes directly to agent_results using the run_id
 * as a correlation key.
 */

import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../../database/connection";
import { log } from "../feature-utils/agentLogger";

// =====================================================================
// TYPES
// =====================================================================

export interface PollConfig {
  maxWaitMs?: number;    // Default: 600_000 (10 min)
  intervalMs?: number;   // Default: 5_000 (5 sec)
  signal?: AbortSignal;  // For external cancellation
}

export interface FireAndPollResult {
  runId: string;
  agentOutput: any;
  agentResultId: number;
}

// =====================================================================
// CORE: FIRE WEBHOOK + POLL FOR RESULT
// =====================================================================

/**
 * Fire a webhook to n8n (fire-and-forget) and poll agent_results for the result.
 *
 * @param webhookUrl - The n8n webhook URL
 * @param payload - The agent payload (will be extended with _meta)
 * @param agentName - Human-readable agent name for logging
 * @param meta - Metadata n8n needs to write the agent_results row
 * @param pollConfig - Polling configuration
 * @returns The agent output from the DB row
 */
export async function fireWebhookAndPoll(
  webhookUrl: string,
  payload: any,
  agentName: string,
  meta: {
    organizationId: number;
    locationId: number | null;
    agentType: string;
    dateStart: string;
    dateEnd: string;
    pmsJobId?: number | null;
  },
  pollConfig: PollConfig = {},
): Promise<FireAndPollResult> {
  const {
    maxWaitMs = 600_000,
    intervalMs = 5_000,
    signal,
  } = pollConfig;

  const runId = uuidv4();

  if (!webhookUrl) {
    throw new Error(`No webhook URL configured for ${agentName}`);
  }

  // Build the enriched payload with _meta for n8n
  const enrichedPayload = {
    ...payload,
    _meta: {
      run_id: runId,
      organization_id: meta.organizationId,
      location_id: meta.locationId,
      agent_type: meta.agentType,
      date_start: meta.dateStart,
      date_end: meta.dateEnd,
      pms_job_id: meta.pmsJobId || null,
    },
  };

  // Fire webhook (fire-and-forget, short timeout just to confirm receipt)
  log(`  → Firing ${agentName} webhook (run_id: ${runId}): ${webhookUrl}`);

  try {
    await axios.post(webhookUrl, enrichedPayload, {
      timeout: 30_000, // 30s just to confirm n8n received it
      headers: { "Content-Type": "application/json" },
    });
    log(`  [${runId}] ${agentName} webhook acknowledged`);
  } catch (error: any) {
    // If n8n can't even receive the webhook, fail immediately
    log(`  [${runId}] ${agentName} webhook fire failed: ${error?.message}`);
    throw new Error(`${agentName} webhook unreachable: ${error?.message}`);
  }

  // Poll agent_results for the result
  log(`  ⏳ Polling for ${agentName} result (run_id: ${runId}, interval: ${intervalMs}ms, max: ${maxWaitMs}ms)`);
  const startTime = Date.now();

  const result = await poll(runId, agentName, startTime, maxWaitMs, intervalMs, signal);
  return result;
}

// =====================================================================
// POLLING LOGIC
// =====================================================================

async function poll(
  runId: string,
  agentName: string,
  startTime: number,
  maxWaitMs: number,
  intervalMs: number,
  signal?: AbortSignal,
): Promise<FireAndPollResult> {
  // Check abort signal
  if (signal?.aborted) {
    log(`  [${runId}] ${agentName} polling aborted`);
    throw new DOMException("Polling aborted", "AbortError");
  }

  // Check timeout
  const elapsed = Date.now() - startTime;
  if (elapsed > maxWaitMs) {
    log(`  [${runId}] ${agentName} polling timed out after ${Math.round(elapsed / 1000)}s`);
    throw new Error(`${agentName} timed out waiting for result after ${Math.round(maxWaitMs / 1000)}s`);
  }

  // Query for result
  const pollCount = Math.floor(elapsed / intervalMs) + 1;
  log(`  [${runId}] ${agentName} poll #${pollCount} (${Math.round(elapsed / 1000)}s elapsed)`);

  const row = await db("agent_results")
    .where({ run_id: runId })
    .whereIn("status", ["success", "error"])
    .first();

  if (row) {
    if (row.status === "error") {
      log(`  [${runId}] ${agentName} completed with error: ${row.error_message}`);
      throw new Error(`${agentName} failed: ${row.error_message}`);
    }

    const agentOutput = typeof row.agent_output === "string"
      ? JSON.parse(row.agent_output)
      : row.agent_output;

    log(`  [${runId}] ${agentName} result found (ID: ${row.id}, elapsed: ${Math.round(elapsed / 1000)}s)`);

    return {
      runId,
      agentOutput,
      agentResultId: row.id,
    };
  }

  // Wait and recurse
  await delay(intervalMs);
  return poll(runId, agentName, startTime, maxWaitMs, intervalMs, signal);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =====================================================================
// HELPER: Generate run_id
// =====================================================================

export function generateRunId(): string {
  return uuidv4();
}
