/**
 * Agent Auditor -- The Agent That Watches the Agents
 *
 * Runs daily after all other agents. Answers three questions:
 *   1. Who's broken? Event type mismatches, orphan events, dead consumers
 *   2. Who's drifting? Output volume drops, quality degradation, Canon expiry
 *   3. Who's missing? Schedule with no handler, identity with no schedule,
 *      dream team node with no code
 *
 * Writes agent_auditor.finding events to behavioral_events.
 * Morning Briefing picks them up. The system watches itself.
 *
 * This is the Google Maps course correction. It tells you when
 * you're drifting before you notice. Not after a client complains.
 */

import { db } from "../../database/connection";
import { getRegisteredAgents } from "../agentRegistry";
import { AGENT_DEFINITIONS } from "./agentIdentity";
import { EVENT_TYPES, EVENT_CONSUMERS, DYNAMIC_EVENT_PREFIXES } from "./eventSchema";
import {
  prepareAgentContext,
  recordAgentAction,
  closeLoop,
} from "./agentRuntime";

// ── Types ───────────────────────────────────────────────────────────

type Severity = "critical" | "warning" | "info";

interface AuditFinding {
  check: string;
  severity: Severity;
  title: string;
  detail: string;
  fix: string;
  affectedAgent?: string;
}

interface AuditSummary {
  findings: AuditFinding[];
  critical: number;
  warning: number;
  info: number;
  checkedAt: string;
}

// ═══════════════════════════════════════════════════════════════════
// CHECK 1: Who's Broken?
// ═══════════════════════════════════════════════════════════════════

async function checkBroken(): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];

  // 1a. Event types written in last 7 days that no consumer is registered for
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentEventTypes = await db("behavioral_events")
      .where("created_at", ">=", sevenDaysAgo)
      .distinct("event_type")
      .pluck("event_type");

    const knownEventTypes = new Set(Object.values(EVENT_TYPES));
    const consumedEventTypes = new Set(Object.keys(EVENT_CONSUMERS));

    for (const eventType of recentEventTypes) {
      // Skip internal/system events
      if (eventType.startsWith("go_no_go.") || eventType.startsWith("conductor.")) continue;
      if (eventType.startsWith("canon.") || eventType.startsWith("circuit_breaker.")) continue;
      if (eventType.startsWith("kill_switch.") || eventType.startsWith("security.")) continue;

      // Also skip dynamic event types (template-literal families like ttfv.yes, trial.email_day_1_sent)
      const isDynamic = DYNAMIC_EVENT_PREFIXES.some(prefix => eventType.startsWith(prefix));
      if (isDynamic) continue;

      if (!knownEventTypes.has(eventType)) {
        findings.push({
          check: "broken.unknown_event_type",
          severity: "warning",
          title: `Unknown event type: ${eventType}`,
          detail: `Event type "${eventType}" was written to behavioral_events in the last 7 days but is not registered in the event schema registry.`,
          fix: `Add "${eventType}" to EVENT_TYPES in src/services/agents/eventSchema.ts and register its consumers in EVENT_CONSUMERS.`,
          affectedAgent: eventType.split(".")[0],
        });
      }
    }

    // 1b. Registered consumers for event types that haven't been written in 7 days
    for (const [eventType, consumers] of Object.entries(EVENT_CONSUMERS)) {
      if (!recentEventTypes.includes(eventType)) {
        findings.push({
          check: "broken.silent_producer",
          severity: "warning",
          title: `No ${eventType} events in 7 days`,
          detail: `${consumers.join(", ")} consume "${eventType}" events, but none were written in the last 7 days.`,
          fix: `Check if the producing agent has a schedule row and is running. Verify the event_type string matches between producer and eventSchema.ts. Run the agent manually from the Canon tab simulation.`,
        });
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    findings.push({
      check: "broken.event_check_failed",
      severity: "info",
      title: "Event type check failed",
      detail: `Could not check event types: ${message}`,
      fix: `Verify the behavioral_events table exists and is accessible. This may indicate a database connection issue.`,
    });
  }

  // 1c. Agents with circuit breaker OPEN
  try {
    const { getAllCircuitStates } = await import("./circuitBreaker");
    const states = getAllCircuitStates();
    for (const state of states) {
      if (state.state === "open") {
        findings.push({
          check: "broken.circuit_open",
          severity: "critical",
          title: `Circuit breaker OPEN: ${state.agentName}`,
          detail: `${state.agentName} has ${state.consecutiveFailures} consecutive failures. Agent is blocked until the 5-minute cooldown triggers a half-open retry.`,
          fix: `Check the agent's error logs. If the root cause is fixed, the circuit auto-recovers after a 5-minute cooldown and successful retry. To force-reset: POST /api/admin/kill-switch/deactivate or wait for auto-recovery.`,
          affectedAgent: state.agentName,
        });
      }
    }
  } catch {
    // Circuit breaker module may not be available
  }

  // 1d. Agents quarantined in agent_identities
  try {
    const hasTable = await db.schema.hasTable("agent_identities");
    if (hasTable) {
      const quarantined = await db("agent_identities")
        .where({ trust_level: "quarantined" })
        .select("slug", "display_name", "quarantine_reason", "quarantined_at");

      for (const agent of quarantined) {
        findings.push({
          check: "broken.quarantined",
          severity: "critical",
          title: `Agent quarantined: ${agent.display_name}`,
          detail: `${agent.display_name} (${agent.slug}) quarantined at ${agent.quarantined_at}. Reason: ${agent.quarantine_reason}.`,
          fix: `Review the quarantine reason. If the issue is resolved, un-quarantine from the Agent Identity panel: POST /api/admin/agent-identity/${agent.slug}/unquarantine. Agent will restart at yellow trust level.`,
          affectedAgent: agent.slug,
        });
      }
    }
  } catch {
    // Table may not exist
  }

  return findings;
}

// ═══════════════════════════════════════════════════════════════════
// CHECK 2: Who's Drifting?
// ═══════════════════════════════════════════════════════════════════

async function checkDrifting(): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];

  // 2a. Agents whose Canon gate is expiring within 14 days
  try {
    const hasTable = await db.schema.hasTable("agent_identities");
    if (hasTable) {
      const fourteenDaysFromNow = new Date();
      fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14);

      const expiring = await db("agent_identities")
        .where({ gate_verdict: "PASS" })
        .whereNotNull("gate_expires")
        .where("gate_expires", "<=", fourteenDaysFromNow)
        .select("slug", "display_name", "gate_expires");

      for (const agent of expiring) {
        const daysLeft = Math.ceil(
          (new Date(agent.gate_expires).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        );
        findings.push({
          check: "drifting.canon_expiring",
          severity: daysLeft <= 3 ? "critical" : "warning",
          title: `Canon expiring: ${agent.display_name} (${daysLeft}d left)`,
          detail: `${agent.display_name}'s PASS verdict expires in ${daysLeft} days. After expiry, the agent drops to observe mode.`,
          fix: `Open Dream Team > Canon tab > ${agent.display_name}. Click "Run Simulation," review gold question results, mark pass/fail, then set verdict to PASS to renew for 90 days.`,
          affectedAgent: agent.slug,
        });
      }
    }
  } catch {
    // Table may not exist
  }

  // 2b. Agents that haven't run in 48+ hours despite having a schedule
  try {
    const hasSchedules = await db.schema.hasTable("schedules");
    if (hasSchedules) {
      const fortyEightHoursAgo = new Date();
      fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);

      const stale = await db("schedules")
        .where({ enabled: true })
        .where(function () {
          this.where("last_run_at", "<", fortyEightHoursAgo).orWhereNull("last_run_at");
        })
        .select("agent_key", "display_name", "last_run_at", "cron_expression");

      for (const schedule of stale) {
        findings.push({
          check: "drifting.stale_schedule",
          severity: "warning",
          title: `Stale: ${schedule.display_name} hasn't run in 48h+`,
          detail: `${schedule.display_name} (${schedule.agent_key}) has cron "${schedule.cron_expression}" but last ran at ${schedule.last_run_at || "never"}.`,
          fix: `Check: (1) Is the BullMQ scheduler worker running? (2) Is the Canon gate blocking this agent (FAIL verdict)? (3) Is the circuit breaker open? Run manually from Canon tab > Simulate to test.`,
          affectedAgent: schedule.agent_key,
        });
      }
    }
  } catch {
    // Table may not exist
  }

  // 2c. System Conductor HOLD rate in last 7 days
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const gateChecks = await db("behavioral_events")
      .where({ event_type: "conductor.gate_check" })
      .where("created_at", ">=", sevenDaysAgo)
      .select("properties");

    let holdCount = 0;
    let passCount = 0;
    const holdsByAgent: Record<string, number> = {};

    for (const event of gateChecks) {
      const props = typeof event.properties === "string"
        ? JSON.parse(event.properties)
        : event.properties || {};
      if (props.result === "hold") {
        holdCount++;
        const agent = props.agent || "unknown";
        holdsByAgent[agent] = (holdsByAgent[agent] || 0) + 1;
      } else {
        passCount++;
      }
    }

    const total = holdCount + passCount;
    if (total > 0 && holdCount / total > 0.3) {
      findings.push({
        check: "drifting.high_hold_rate",
        severity: "warning",
        title: `System Conductor holding ${Math.round((holdCount / total) * 100)}% of outputs`,
        detail: `${holdCount} of ${total} gate checks resulted in HOLD in the last 7 days. Top held agents: ${Object.entries(holdsByAgent).sort(([, a], [, b]) => b - a).slice(0, 3).map(([a, c]) => `${a} (${c})`).join(", ")}.`,
        fix: `Check conductor.gate_check events in behavioral_events for the specific gate that's holding (voice, accuracy, timing, etc). The most common fix is adding humanNeed and economicConsequence to agent output, or removing em-dashes and "practice" from text.`,
      });
    }
  } catch {
    // Table may not exist
  }

  return findings;
}

// ═══════════════════════════════════════════════════════════════════
// CHECK 3: Who's Missing?
// ═══════════════════════════════════════════════════════════════════

async function checkMissing(): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];

  const registeredKeys = new Set(getRegisteredAgents().map((a) => a.key));
  const identitySlugs = new Set(AGENT_DEFINITIONS.map((d) => d.slug));

  // 3a. Identity definitions with no registry handler
  for (const def of AGENT_DEFINITIONS) {
    // Map slug to likely registry key (remove _agent suffix for some)
    const possibleKeys = [def.slug, def.slug.replace(/_agent$/, "")];
    const hasHandler = possibleKeys.some((k) => registeredKeys.has(k));
    if (!hasHandler && def.schedule) {
      findings.push({
        check: "missing.no_handler",
        severity: "warning",
        title: `No handler: ${def.displayName}`,
        detail: `${def.displayName} (${def.slug}) has a schedule defined in AGENT_DEFINITIONS ("${def.schedule}") but no handler registered in agentRegistry.`,
        fix: `Either add a handler to src/services/agentRegistry.ts (import the service function and register it), or remove the schedule from AGENT_DEFINITIONS if this agent is not ready for production.`,
        affectedAgent: def.slug,
      });
    }
  }

  // 3b. Schedule rows with no registry handler
  try {
    const hasSchedules = await db.schema.hasTable("schedules");
    if (hasSchedules) {
      const schedules = await db("schedules")
        .where({ enabled: true })
        .select("agent_key", "display_name");

      for (const schedule of schedules) {
        if (!registeredKeys.has(schedule.agent_key)) {
          findings.push({
            check: "missing.schedule_no_handler",
            severity: "critical",
            title: `Scheduled but no handler: ${schedule.display_name}`,
            detail: `Schedule row exists for "${schedule.agent_key}" but no handler is registered in agentRegistry. The scheduler logs an error every tick for this agent.`,
            fix: `Add a handler to src/services/agentRegistry.ts for key "${schedule.agent_key}", or disable the schedule row in the schedules table (set enabled=false).`,
            affectedAgent: schedule.agent_key,
          });
        }
      }
    }
  } catch {
    // Table may not exist
  }

  // 3c. Dream team nodes with agent_key but no matching registry handler
  try {
    const hasNodes = await db.schema.hasTable("dream_team_nodes");
    if (hasNodes) {
      const agentNodes = await db("dream_team_nodes")
        .where({ node_type: "agent" })
        .whereNotNull("agent_key")
        .select("role_title", "agent_key");

      for (const node of agentNodes) {
        if (!registeredKeys.has(node.agent_key)) {
          findings.push({
            check: "missing.dream_team_no_handler",
            severity: "info",
            title: `Org chart placeholder: ${node.role_title}`,
            detail: `Dream team node "${node.role_title}" has agent_key "${node.agent_key}" but no handler in agentRegistry. Appears on org chart but cannot run.`,
            fix: `Either build the service file and register the handler, or remove this node from dream_team_nodes if it's aspirational and not yet ready. Gray dots on the board signal unfinished work.`,
            affectedAgent: node.agent_key,
          });
        }
      }

      // 3d. Dream team agent nodes with NO agent_key at all
      const noKeyNodes = await db("dream_team_nodes")
        .where({ node_type: "agent" })
        .whereNull("agent_key")
        .select("role_title");

      if (noKeyNodes.length > 0) {
        findings.push({
          check: "missing.dream_team_no_key",
          severity: "info",
          title: `${noKeyNodes.length} org chart nodes with no agent_key`,
          detail: `These agents show as gray dots: ${noKeyNodes.map((n: any) => n.role_title).join(", ")}.`,
          fix: `Set agent_key on each node in dream_team_nodes to match the registry key. Or remove placeholder nodes that represent future agents not yet built.`,
        });
      }
    }
  } catch {
    // Table may not exist
  }

  // 3e. Agents with no Canon governance (no gold questions)
  try {
    const hasIdentities = await db.schema.hasTable("agent_identities");
    if (hasIdentities) {
      const ungoverned = await db("agent_identities")
        .where("gate_verdict", "PENDING")
        .whereRaw("(gold_questions = '[]' OR gold_questions = '[]'::jsonb)")
        .select("slug", "display_name");

      if (ungoverned.length > 0) {
        findings.push({
          check: "missing.no_canon",
          severity: "warning",
          title: `${ungoverned.length} agents with no Canon governance`,
          detail: `Running ungoverned: ${ungoverned.slice(0, 10).map((a: any) => a.display_name).join(", ")}${ungoverned.length > 10 ? ` and ${ungoverned.length - 10} more` : ""}.`,
          fix: `Open Dream Team > Canon tab > expand each agent. Add a spec (purpose, expected behavior, constraints, owner) and at least 20 gold questions covering BUG, DATA, and CANON categories. Run a simulation to populate answers.`,
        });
      }
    }
  } catch {
    // Table may not exist or columns may not exist yet
  }

  return findings;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════

/**
 * Run the full agent audit. Writes findings to behavioral_events.
 */
export async function runAgentAudit(): Promise<AuditSummary> {
  const agentCtx = { agentName: "agent_auditor", topic: "daily_audit" };

  // Runtime integration
  const runtime = await prepareAgentContext(agentCtx);
  if (!runtime.orchestratorApproval.allowed) {
    console.log(`[AgentAuditor] Orchestrator blocked: ${runtime.orchestratorApproval.reason}`);
    return { findings: [], critical: 0, warning: 0, info: 0, checkedAt: new Date().toISOString() };
  }

  // Run all three checks in parallel
  const [broken, drifting, missing] = await Promise.all([
    checkBroken(),
    checkDrifting(),
    checkMissing(),
  ]);

  const allFindings = [...broken, ...drifting, ...missing];
  const critical = allFindings.filter((f) => f.severity === "critical").length;
  const warning = allFindings.filter((f) => f.severity === "warning").length;
  const info = allFindings.filter((f) => f.severity === "info").length;

  // Write each finding to behavioral_events
  for (const finding of allFindings) {
    try {
      await db("behavioral_events").insert({
        id: db.raw("gen_random_uuid()"),
        event_type: "agent_auditor.finding",
        org_id: null,
        properties: JSON.stringify({
          check: finding.check,
          severity: finding.severity,
          title: finding.title,
          detail: finding.detail,
          fix: finding.fix,
          affected_agent: finding.affectedAgent || null,
        }),
        created_at: new Date(),
      });
    } catch {
      // Non-critical: audit logging should not break the auditor
    }
  }

  // Record through runtime for dashboard visibility
  await recordAgentAction(agentCtx, {
    type: "notification",
    headline: `Agent Audit: ${critical} critical, ${warning} warnings, ${info} info`,
    detail: allFindings
      .filter((f) => f.severity === "critical")
      .map((f) => f.title)
      .join("; ") || "No critical issues",
    humanNeed: critical > 0 ? "safety" : undefined,
    economicConsequence: critical > 0
      ? "Critical agent issues may impact client delivery within 24 hours"
      : undefined,
  });

  // Close the loop
  await closeLoop(agentCtx, {
    expected: "Audit all agents for broken, drifting, and missing conditions",
    actual: `Found ${allFindings.length} issues: ${critical} critical, ${warning} warning, ${info} info`,
    success: true,
    learning: critical > 0
      ? `Critical issues found: ${allFindings.filter((f) => f.severity === "critical").map((f) => f.title).join(", ")}`
      : undefined,
  });

  const summary: AuditSummary = {
    findings: allFindings,
    critical,
    warning,
    info,
    checkedAt: new Date().toISOString(),
  };

  console.log(
    `[AgentAuditor] Audit complete: ${critical} critical, ${warning} warning, ${info} info (${allFindings.length} total findings)`,
  );

  return summary;
}
