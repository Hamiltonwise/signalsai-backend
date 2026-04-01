/**
 * Abort Handler -- Agent Orchestration Infrastructure
 *
 * When an agent fails mid-chain, the abort handler decides what
 * happens next. Four possible actions:
 *
 * - retry: try the agent again (circuit breaker permitting)
 * - fallback: use cached/previous data and continue the chain
 * - skip: omit this agent's contribution and continue
 * - escalate: halt everything and notify Corey
 *
 * Per-agent fallback logic ensures the Monday email chain
 * degrades gracefully instead of failing entirely.
 */

import { db } from "../../database/connection";

// ── Types ───────────────────────────────────────────────────────────

export interface AbortResult {
  action: "retry" | "fallback" | "skip" | "escalate";
  fallbackData?: Record<string, unknown>;
  message: string;
}

// ── Logging ─────────────────────────────────────────────────────────

async function logAbort(
  agentName: string,
  orgId: number,
  error: string,
  action: string,
): Promise<void> {
  try {
    await db("behavioral_events").insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "abort_handler.triggered",
      org_id: orgId,
      properties: JSON.stringify({
        agent_name: agentName,
        error,
        action,
        timestamp: new Date().toISOString(),
      }),
      created_at: new Date(),
    });
  } catch (logErr: unknown) {
    const message = logErr instanceof Error ? logErr.message : String(logErr);
    console.error(
      `[AbortHandler] Failed to log abort for ${agentName}:`,
      message,
    );
  }
}

// ── Per-agent fallback logic ────────────────────────────────────────

async function handleScoreRecalcFailure(
  orgId: number,
  error: string,
): Promise<AbortResult> {
  // Fallback: use the previous score, note "score updating"
  try {
    const org = await db("organizations")
      .where({ id: orgId })
      .select("current_clarity_score", "checkup_score", "previous_clarity_score")
      .first();

    const previousScore =
      org?.current_clarity_score ?? org?.checkup_score ?? null;

    await logAbort("score_recalc", orgId, error, "fallback");

    return {
      action: "fallback",
      fallbackData: {
        score: previousScore,
        scoreNote: "score updating",
        stale: true,
      },
      message: `Score recalc failed (${error}). Using previous score: ${previousScore ?? "none"}.`,
    };
  } catch {
    await logAbort("score_recalc", orgId, error, "fallback");
    return {
      action: "fallback",
      fallbackData: { score: null, scoreNote: "score updating", stale: true },
      message: `Score recalc failed and fallback query failed. Continuing without score.`,
    };
  }
}

async function handleCompetitiveScoutFailure(
  orgId: number,
  error: string,
): Promise<AbortResult> {
  // Skip: competitor note is optional in the Monday email
  await logAbort("competitive_scout", orgId, error, "skip");

  return {
    action: "skip",
    message: `Competitive Scout failed (${error}). Skipping competitor note in email.`,
  };
}

async function handleIntelligenceAgentFailure(
  orgId: number,
  error: string,
): Promise<AbortResult> {
  // Fallback: use checkup-based findings instead of live intelligence
  try {
    const org = await db("organizations")
      .where({ id: orgId })
      .select("checkup_data")
      .first();

    const checkupData = org?.checkup_data
      ? typeof org.checkup_data === "string"
        ? JSON.parse(org.checkup_data)
        : org.checkup_data
      : null;

    const findings = checkupData?.findings ?? [];

    await logAbort("intelligence_agent", orgId, error, "fallback");

    return {
      action: "fallback",
      fallbackData: {
        findings,
        source: "checkup_data",
        stale: true,
      },
      message: `Intelligence Agent failed (${error}). Falling back to ${findings.length} checkup-based finding(s).`,
    };
  } catch {
    await logAbort("intelligence_agent", orgId, error, "fallback");
    return {
      action: "fallback",
      fallbackData: { findings: [], source: "none", stale: true },
      message: `Intelligence Agent failed and fallback query failed. Continuing with no findings.`,
    };
  }
}

async function handleSystemConductorFailure(
  orgId: number,
  error: string,
): Promise<AbortResult> {
  // Escalate: conductor failure means we cannot verify output quality.
  // HOLD all output, create task for Corey.
  try {
    await db("dream_team_tasks").insert({
      title: "System Conductor failure: all output held",
      description:
        `The System Conductor failed during the Monday chain for org ${orgId}. ` +
        `Error: ${error}. All output for this org is held until the Conductor is restored.`,
      assigned_to: "corey",
      status: "open",
      priority: "high",
      org_id: orgId,
      metadata: JSON.stringify({
        source: "abort_handler",
        agent: "system_conductor",
        error,
        timestamp: new Date().toISOString(),
      }),
      created_at: new Date(),
      updated_at: new Date(),
    });
  } catch {
    // Even if task creation fails, still escalate
  }

  await logAbort("system_conductor", orgId, error, "escalate");

  return {
    action: "escalate",
    message: `System Conductor failed (${error}). ALL output held. Escalated to Corey.`,
  };
}

async function handleMondayEmailFailure(
  orgId: number,
  error: string,
): Promise<AbortResult> {
  // Log and create task for Dave (infrastructure issue)
  try {
    await db("dream_team_tasks").insert({
      title: `Monday Email send failure for org ${orgId}`,
      description:
        `The Monday email failed to send for org ${orgId}. ` +
        `Error: ${error}. Check email service credentials and n8n webhook.`,
      assigned_to: "dave",
      status: "open",
      priority: "medium",
      org_id: orgId,
      metadata: JSON.stringify({
        source: "abort_handler",
        agent: "monday_email",
        error,
        timestamp: new Date().toISOString(),
      }),
      created_at: new Date(),
      updated_at: new Date(),
    });
  } catch {
    // Best effort task creation
  }

  await logAbort("monday_email", orgId, error, "skip");

  return {
    action: "skip",
    message: `Monday Email failed (${error}). Task created for Dave.`,
  };
}

// ── Main export ─────────────────────────────────────────────────────

/**
 * Handle an agent failure within the orchestration chain.
 *
 * Returns the appropriate recovery action and any fallback data
 * that the chain can use to continue.
 */
export async function handleAgentFailure(
  agentName: string,
  orgId: number,
  error: string,
): Promise<AbortResult> {
  console.log(
    `[AbortHandler] Handling failure for "${agentName}" on org ${orgId}: ${error}`,
  );

  switch (agentName) {
    case "score_recalc":
    case "weeklyScoreRecalc":
      return handleScoreRecalcFailure(orgId, error);

    case "competitive_scout":
    case "competitiveScout":
      return handleCompetitiveScoutFailure(orgId, error);

    case "intelligence_agent":
    case "intelligenceAgent":
      return handleIntelligenceAgentFailure(orgId, error);

    case "system_conductor":
    case "systemConductor":
      return handleSystemConductorFailure(orgId, error);

    case "monday_email":
    case "mondayEmail":
      return handleMondayEmailFailure(orgId, error);

    default: {
      // Unknown agent: log and skip
      await logAbort(agentName, orgId, error, "skip");
      return {
        action: "skip",
        message: `Unknown agent "${agentName}" failed (${error}). Skipping.`,
      };
    }
  }
}
