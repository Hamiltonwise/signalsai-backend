/**
 * Agent Identity System -- The Okta for AI Agents
 *
 * Every agent on the dream team gets:
 * 1. A unique ID (UUID) that follows it across every action
 * 2. Scoped permissions (what tables it can read/write, what actions it can take)
 * 3. Group membership (intelligence, operations, client-facing, governance)
 * 4. Trust level (green/yellow/red) that can be downgraded on violations
 * 5. Audit trail: every action is signed with the agent's identity
 * 6. Quarantine: automatic pause on scope violations
 *
 * The roommate analogy: instead of everyone having the master key,
 * each agent has a keycard that only opens the doors it needs.
 * If it tries a door it shouldn't, security is notified.
 *
 * "I do not believe this is malicious. I feel we are in a time where
 * everyone is learning how to live in harmony together." -- Corey
 *
 * This system sets agents up for success by making the boundaries
 * clear, the expectations explicit, and the consequences automatic.
 */

import { db } from "../../database/connection";
import crypto from "crypto";

// =====================================================================
// TYPES
// =====================================================================

export type AgentGroup =
  | "intelligence"   // Market data, ranking analysis, findings
  | "content"        // Content strategy, messaging, publishing
  | "operations"     // System health, bug triage, orphan detection
  | "client"         // Client communication, CS, health scoring
  | "growth"         // Conversion, learning, content performance
  | "financial"      // Revenue projections, cost analysis
  | "governance"     // System Conductor, CLO, safety gates
  | "personal";      // Personal team agents (Corey, Jo, Dave)

export type TrustLevel = "green" | "yellow" | "red" | "quarantined";

export type DataScope =
  | "behavioral_events:read"
  | "behavioral_events:write"
  | "agent_results:read"
  | "agent_results:write"
  | "organizations:read"
  | "organizations:write"
  | "practice_rankings:read"
  | "practice_rankings:write"
  | "pms_jobs:read"
  | "tasks:read"
  | "tasks:write"
  | "dream_team_tasks:read"
  | "dream_team_tasks:write"
  | "email:send"
  | "external_api:google_places"
  | "external_api:anthropic"
  | "external_api:mailgun"
  | "client_facing:output"    // Can produce content customers see
  | "billing:read"
  | "billing:write"           // Red: requires governance approval
  | "users:read"
  | "users:write";            // Red: requires governance approval

export interface AgentIdentity {
  id: string;               // UUID
  slug: string;             // e.g. "intelligence_agent"
  displayName: string;      // e.g. "Intelligence Agent"
  group: AgentGroup;
  trustLevel: TrustLevel;
  scopes: DataScope[];
  maxTokenBudget: number;   // Per-run token limit
  schedule: string | null;  // Cron expression or null for on-demand
  description: string;
  createdAt: Date;
  lastRunAt: Date | null;
  totalRuns: number;
  totalViolations: number;
  quarantinedAt: Date | null;
  quarantineReason: string | null;
}

export interface AgentAction {
  agentId: string;
  runId: string;
  action: string;
  scope: DataScope;
  target: string;           // Table or API name
  orgId: number | null;
  allowed: boolean;
  timestamp: Date;
  detail: string | null;
}

// =====================================================================
// GROUP PERMISSION TEMPLATES
// =====================================================================

const GROUP_BASE_SCOPES: Record<AgentGroup, DataScope[]> = {
  intelligence: [
    "behavioral_events:read", "behavioral_events:write",
    "agent_results:read", "agent_results:write",
    "organizations:read", "practice_rankings:read",
    "pms_jobs:read", "external_api:google_places",
    "external_api:anthropic",
  ],
  content: [
    "behavioral_events:read", "behavioral_events:write",
    "agent_results:read", "agent_results:write",
    "organizations:read", "external_api:anthropic",
    "client_facing:output",
  ],
  operations: [
    "behavioral_events:read", "behavioral_events:write",
    "agent_results:read", "organizations:read",
    "dream_team_tasks:read", "dream_team_tasks:write",
    "tasks:read",
  ],
  client: [
    "behavioral_events:read", "behavioral_events:write",
    "agent_results:read", "agent_results:write",
    "organizations:read", "tasks:read", "tasks:write",
    "external_api:anthropic", "client_facing:output",
  ],
  growth: [
    "behavioral_events:read", "behavioral_events:write",
    "agent_results:read", "agent_results:write",
    "organizations:read", "practice_rankings:read",
    "external_api:anthropic",
  ],
  financial: [
    "behavioral_events:read", "behavioral_events:write",
    "organizations:read", "billing:read",
    "external_api:anthropic",
  ],
  governance: [
    "behavioral_events:read", "behavioral_events:write",
    "agent_results:read", "agent_results:write",
    "organizations:read", "organizations:write",
    "dream_team_tasks:read", "dream_team_tasks:write",
    "tasks:read", "tasks:write",
    "external_api:anthropic",
  ],
  personal: [
    "behavioral_events:read", "behavioral_events:write",
    "agent_results:read", "organizations:read",
    "dream_team_tasks:read",
    "external_api:anthropic",
  ],
};

// =====================================================================
// AGENT REGISTRY (all 55 agents with identity)
// =====================================================================

export const AGENT_DEFINITIONS: Omit<AgentIdentity, "id" | "createdAt" | "lastRunAt" | "totalRuns" | "totalViolations" | "quarantinedAt" | "quarantineReason">[] = [
  // ── Intelligence Group ──
  { slug: "intelligence_agent", displayName: "Intelligence Agent", group: "intelligence", trustLevel: "green", scopes: [...GROUP_BASE_SCOPES.intelligence], maxTokenBudget: 50000, schedule: "0 5 * * *", description: "Produces 3 findings per org with biological-economic lens" },
  { slug: "competitive_scout", displayName: "Competitive Scout", group: "intelligence", trustLevel: "green", scopes: [...GROUP_BASE_SCOPES.intelligence], maxTokenBudget: 15000, schedule: "0 6 * * 2", description: "Scans competitor GBP changes weekly" },
  { slug: "aeo_monitor", displayName: "AEO Monitor", group: "intelligence", trustLevel: "green", scopes: [...GROUP_BASE_SCOPES.intelligence], maxTokenBudget: 30000, schedule: "0 5 * * 1", description: "Monitors AI search presence across ChatGPT, Grok, Claude" },
  { slug: "market_signal_scout", displayName: "Market Signal Scout", group: "intelligence", trustLevel: "green", scopes: [...GROUP_BASE_SCOPES.intelligence], maxTokenBudget: 30000, schedule: "0 6 * * *", description: "Detects market shifts and new entrants" },
  { slug: "proofline_agent", displayName: "Proofline Agent", group: "intelligence", trustLevel: "green", scopes: [...GROUP_BASE_SCOPES.intelligence], maxTokenBudget: 30000, schedule: "0 6 * * *", description: "Generates verified proof points from GBP data" },

  // ── Content Group ──
  { slug: "cmo_agent", displayName: "CMO Agent", group: "content", trustLevel: "green", scopes: [...GROUP_BASE_SCOPES.content], maxTokenBudget: 80000, schedule: "0 6 * * 1", description: "Weekly content briefs and topic recommendations" },
  { slug: "content_performance", displayName: "Content Performance", group: "content", trustLevel: "green", scopes: [...GROUP_BASE_SCOPES.content], maxTokenBudget: 30000, schedule: "0 18 * * 0", description: "Measures content ROI and platform metrics" },
  { slug: "ghost_writer", displayName: "Ghost Writer", group: "content", trustLevel: "yellow", scopes: [...GROUP_BASE_SCOPES.content, "email:send"], maxTokenBudget: 50000, schedule: null, description: "Drafts content (human approval required before publish)" },
  { slug: "programmatic_seo", displayName: "Programmatic SEO Agent", group: "content", trustLevel: "green", scopes: [...GROUP_BASE_SCOPES.content], maxTokenBudget: 30000, schedule: "0 4 * * 1", description: "Generates location-specific SEO pages" },

  // ── Operations Group ──
  { slug: "nothing_gets_lost", displayName: "Nothing Gets Lost", group: "operations", trustLevel: "green", scopes: [...GROUP_BASE_SCOPES.operations], maxTokenBudget: 30000, schedule: "0 7 * * *", description: "Daily orphan scans for unreferenced documents" },
  { slug: "bug_triage", displayName: "Bug Triage", group: "operations", trustLevel: "green", scopes: [...GROUP_BASE_SCOPES.operations], maxTokenBudget: 30000, schedule: "0 * * * *", description: "Hourly error log analysis and task creation" },
  { slug: "technology_horizon", displayName: "Technology Horizon", group: "operations", trustLevel: "green", scopes: [...GROUP_BASE_SCOPES.operations], maxTokenBudget: 30000, schedule: "5 6 * * *", description: "Scans tech landscape for relevant capabilities" },

  // ── Client Group ──
  { slug: "client_monitor", displayName: "Client Monitor", group: "client", trustLevel: "green", scopes: [...GROUP_BASE_SCOPES.client], maxTokenBudget: 30000, schedule: "0 6 * * *", description: "Daily client health scoring (GREEN/AMBER/RED)" },
  { slug: "cs_agent", displayName: "CS Agent", group: "client", trustLevel: "yellow", scopes: [...GROUP_BASE_SCOPES.client, "email:send"], maxTokenBudget: 30000, schedule: "30 7 * * *", description: "Proactive client interventions (human approval for outbound)" },
  { slug: "cs_coach", displayName: "CS Coach", group: "client", trustLevel: "green", scopes: [...GROUP_BASE_SCOPES.client], maxTokenBudget: 30000, schedule: "0 20 * * 0", description: "Weekly CS pattern analysis and training" },
  { slug: "dreamweaver", displayName: "Dreamweaver", group: "client", trustLevel: "yellow", scopes: [...GROUP_BASE_SCOPES.client], maxTokenBudget: 30000, schedule: "15 7 * * *", description: "Hospitality moments for healthy accounts" },
  { slug: "monday_email", displayName: "Monday Email", group: "client", trustLevel: "yellow", scopes: [...GROUP_BASE_SCOPES.client, "email:send"], maxTokenBudget: 20000, schedule: "0 7 * * 1", description: "Weekly intelligence brief delivery" },

  // ── Growth Group ──
  { slug: "conversion_optimizer", displayName: "Conversion Optimizer", group: "growth", trustLevel: "green", scopes: [...GROUP_BASE_SCOPES.growth], maxTokenBudget: 30000, schedule: "0 6 * * 1", description: "Weekly funnel analysis and A/B test proposals" },
  { slug: "learning_agent", displayName: "Learning Agent", group: "growth", trustLevel: "green", scopes: [...GROUP_BASE_SCOPES.growth], maxTokenBudget: 30000, schedule: "0 21 * * 0", description: "Weekly heuristic calibration from outcome data" },

  // ── Financial Group ──
  { slug: "cfo_agent", displayName: "CFO Agent", group: "financial", trustLevel: "yellow", scopes: [...GROUP_BASE_SCOPES.financial], maxTokenBudget: 30000, schedule: "0 8 1 * *", description: "Monthly financial projections and cost analysis" },

  // ── Governance Group ──
  { slug: "system_conductor", displayName: "System Conductor", group: "governance", trustLevel: "green", scopes: [...GROUP_BASE_SCOPES.governance, "client_facing:output"], maxTokenBudget: 30000, schedule: null, description: "Gates all client-facing output (PASS/HOLD/ESCALATE)" },
  { slug: "clo_agent", displayName: "CLO Agent", group: "governance", trustLevel: "green", scopes: [...GROUP_BASE_SCOPES.governance], maxTokenBudget: 30000, schedule: "0 9 * * 1", description: "Legal/IP monitoring and compliance flags" },
  { slug: "morning_briefing", displayName: "Morning Briefing", group: "governance", trustLevel: "green", scopes: [...GROUP_BASE_SCOPES.governance], maxTokenBudget: 25000, schedule: "30 6 * * *", description: "Daily synthesis of overnight signals for Corey" },

  // ── Personal Group ──
  { slug: "corey_agent", displayName: "Corey's Personal Agent", group: "personal", trustLevel: "green", scopes: [...GROUP_BASE_SCOPES.personal], maxTokenBudget: 30000, schedule: "0 6 * * *", description: "Daily brief for Corey: revenue, decisions, priorities" },
  { slug: "jo_agent", displayName: "Jo's Personal Agent", group: "personal", trustLevel: "green", scopes: [...GROUP_BASE_SCOPES.personal], maxTokenBudget: 30000, schedule: "0 6 * * *", description: "Daily brief for Jo: client health, ops tasks, flags" },
  { slug: "dave_agent", displayName: "Dave's Personal Agent", group: "personal", trustLevel: "green", scopes: [...GROUP_BASE_SCOPES.personal], maxTokenBudget: 30000, schedule: "0 6 * * *", description: "Daily brief for Dave: deploy status, errors, task queue" },
];

// =====================================================================
// CORE FUNCTIONS
// =====================================================================

/**
 * Get or create an agent identity. Idempotent by slug.
 */
export async function getAgentIdentity(slug: string): Promise<AgentIdentity | null> {
  const existing = await db("agent_identities").where({ slug }).first();
  if (existing) return existing;

  const def = AGENT_DEFINITIONS.find((d) => d.slug === slug);
  if (!def) return null;

  const identity: AgentIdentity = {
    id: crypto.randomUUID(),
    ...def,
    createdAt: new Date(),
    lastRunAt: null,
    totalRuns: 0,
    totalViolations: 0,
    quarantinedAt: null,
    quarantineReason: null,
  };

  await db("agent_identities").insert({
    id: identity.id,
    slug: identity.slug,
    display_name: identity.displayName,
    agent_group: identity.group,
    trust_level: identity.trustLevel,
    scopes: JSON.stringify(identity.scopes),
    max_token_budget: identity.maxTokenBudget,
    schedule: identity.schedule,
    description: identity.description,
    created_at: identity.createdAt,
  }).catch(() => {
    // Race condition: another process created it
  });

  return identity;
}

/**
 * Check if an agent has permission to perform an action.
 * Returns true if allowed, false if denied.
 * Logs the attempt either way.
 */
export async function checkScope(
  agentId: string,
  runId: string,
  scope: DataScope,
  target: string,
  orgId: number | null = null,
): Promise<boolean> {
  const identity = await db("agent_identities").where({ id: agentId }).first();

  if (!identity) {
    await logAction(agentId, runId, "scope_check", scope, target, orgId, false, "Agent identity not found");
    return false;
  }

  // Quarantined agents cannot do anything
  if (identity.trust_level === "quarantined") {
    await logAction(agentId, runId, "scope_check", scope, target, orgId, false, "Agent is quarantined");
    return false;
  }

  // PENDING agents can observe but not act
  if (identity.gate_verdict === "PENDING" && ACTION_SCOPES.includes(scope)) {
    await logAction(agentId, runId, "scope_check", scope, target, orgId, false, `Agent ${identity.slug} is PENDING (observe only), action scope ${scope} denied`);
    return false;
  }

  // FAIL agents cannot do anything
  if (identity.gate_verdict === "FAIL") {
    await logAction(agentId, runId, "scope_check", scope, target, orgId, false, `Agent ${identity.slug} has FAIL verdict, all scopes denied`);
    return false;
  }

  const scopes: DataScope[] = typeof identity.scopes === "string"
    ? JSON.parse(identity.scopes)
    : identity.scopes;

  const allowed = scopes.includes(scope);

  if (!allowed) {
    // Log violation and increment counter
    await logAction(agentId, runId, "scope_violation", scope, target, orgId, false, `Agent ${identity.slug} attempted ${scope} but does not have permission`);
    await db("agent_identities").where({ id: agentId }).increment("total_violations", 1);

    // Auto-quarantine after 3 violations
    const updated = await db("agent_identities").where({ id: agentId }).first();
    if (updated && updated.total_violations >= 3) {
      await quarantineAgent(agentId, `Auto-quarantined after ${updated.total_violations} scope violations`);
    }

    return false;
  }

  await logAction(agentId, runId, "scope_check", scope, target, orgId, true, null);
  return allowed;
}

/**
 * Record the start of an agent run. Returns a unique run ID.
 */
export async function startRun(slug: string): Promise<{ agentId: string; runId: string } | null> {
  const identity = await getAgentIdentity(slug);
  if (!identity) return null;

  if (identity.trustLevel === "quarantined") {
    console.log(`[AgentIdentity] ${slug} is quarantined, run blocked`);
    return null;
  }

  const runId = crypto.randomUUID();

  await db("agent_identities").where({ id: identity.id }).update({
    last_run_at: new Date(),
    total_runs: db.raw("total_runs + 1"),
  });

  await logAction(identity.id, runId, "run_start", "behavioral_events:write" as DataScope, "agent_run", null, true, `${identity.displayName} started run ${runId}`);

  return { agentId: identity.id, runId };
}

/**
 * Record the end of an agent run.
 */
export async function endRun(
  agentId: string,
  runId: string,
  success: boolean,
  detail: string | null = null,
): Promise<void> {
  await logAction(agentId, runId, "run_end", "behavioral_events:write" as DataScope, "agent_run", null, success, detail);
}

/**
 * Quarantine an agent. It cannot run until manually un-quarantined.
 */
export async function quarantineAgent(agentId: string, reason: string): Promise<void> {
  await db("agent_identities").where({ id: agentId }).update({
    trust_level: "quarantined",
    quarantined_at: new Date(),
    quarantine_reason: reason,
  });

  // Write a behavioral event so Morning Briefing picks it up
  await db("behavioral_events").insert({
    id: db.raw("gen_random_uuid()"),
    event_type: "security.agent_quarantined",
    org_id: null,
    properties: JSON.stringify({ agentId, reason }),
    created_at: new Date(),
  });

  console.log(`[AgentIdentity] QUARANTINED: ${agentId} -- ${reason}`);
}

/**
 * Un-quarantine an agent (manual action by Corey/superadmin).
 */
export async function unquarantineAgent(agentId: string): Promise<void> {
  await db("agent_identities").where({ id: agentId }).update({
    trust_level: "yellow",  // Downgraded to yellow, not green, after quarantine
    quarantined_at: null,
    quarantine_reason: null,
    total_violations: 0,
  });

  console.log(`[AgentIdentity] Un-quarantined: ${agentId} (trust level set to yellow)`);
}

// =====================================================================
// AUDIT LOG
// =====================================================================

async function logAction(
  agentId: string,
  runId: string,
  action: string,
  scope: DataScope,
  target: string,
  orgId: number | null,
  allowed: boolean,
  detail: string | null,
): Promise<void> {
  try {
    await db("agent_audit_log").insert({
      id: db.raw("gen_random_uuid()"),
      agent_id: agentId,
      run_id: runId,
      action,
      scope,
      target,
      org_id: orgId,
      allowed,
      detail,
      created_at: new Date(),
    });
  } catch (err) {
    // Audit logging should never break the agent
    console.error("[AgentIdentity] Audit log write failed:", err instanceof Error ? err.message : err);
  }
}

// =====================================================================
// CANON GOVERNANCE
// =====================================================================

export interface CanonSpec {
  purpose: string;
  expectedBehavior: string;
  constraints: string[];
  owner: string;
}

export type GoldQuestionCategory = "BUG" | "DATA" | "CANON";

export interface GoldQuestion {
  id: string;
  question: string;
  expectedAnswer: string;
  actualAnswer: string | null;
  passed: boolean | null;
  testedAt: string | null;
  category?: GoldQuestionCategory;
}

/**
 * Scopes that represent actions (send emails, create tasks, modify data).
 * PENDING agents can observe (read/write findings) but cannot act.
 */
const ACTION_SCOPES: DataScope[] = [
  "email:send",
  "tasks:write",
  "dream_team_tasks:write",
  "organizations:write",
  "users:write",
  "billing:write",
  "client_facing:output",
];

export type GateMode = "pass" | "observe" | "blocked";

/**
 * Check if an agent is allowed to run based on Canon gate status.
 *
 * Three levels:
 *   PASS    -> allowed=true,  mode="pass"    (full autonomy)
 *   PENDING -> allowed=true,  mode="observe" (read + write findings, no actions)
 *   FAIL    -> allowed=false, mode="blocked" (fully stopped)
 *
 * Backward compatible: agents without Canon records get mode="pass".
 */
export async function checkGateStatus(agentKey: string): Promise<{ allowed: boolean; mode: GateMode; reason: string }> {
  // Look up by agent_key first, then by slug
  let identity = await db("agent_identities").where({ agent_key: agentKey }).first();
  if (!identity) {
    identity = await db("agent_identities").where({ slug: agentKey }).first();
  }

  // No identity row = ungoverned, backward compatible
  if (!identity) {
    return { allowed: true, mode: "pass", reason: "No Canon record found, ungoverned agent" };
  }

  // Check if gate has expired
  if (identity.gate_verdict === "PASS" && identity.gate_expires && new Date(identity.gate_expires) < new Date()) {
    await db("agent_identities").where({ id: identity.id }).update({
      gate_verdict: "PENDING",
    });
    return { allowed: true, mode: "observe", reason: "Canon gate expired, demoted to observe mode" };
  }

  if (identity.gate_verdict === "FAIL") {
    return { allowed: false, mode: "blocked", reason: "Canon gate verdict is FAIL, agent fully stopped" };
  }

  if (identity.gate_verdict === "PENDING") {
    return { allowed: true, mode: "observe", reason: "Canon gate PENDING, agent running in observe mode (no actions)" };
  }

  return { allowed: true, mode: "pass", reason: "Canon gate PASS" };
}

/**
 * Update the Canon spec for an agent. Resets gate to PENDING.
 */
export async function updateCanonSpec(agentId: string, spec: CanonSpec): Promise<void> {
  await db("agent_identities").where({ id: agentId }).update({
    canon_spec: JSON.stringify(spec),
    gate_verdict: "PENDING",
  });
}

/**
 * Set gold questions for an agent. Resets gate to PENDING.
 */
export async function setGoldQuestions(agentId: string, questions: GoldQuestion[]): Promise<void> {
  await db("agent_identities").where({ id: agentId }).update({
    gold_questions: JSON.stringify(questions),
    gate_verdict: "PENDING",
  });
}

/**
 * Record a single gold question result.
 */
export async function recordGoldQuestionResult(
  agentId: string,
  questionId: string,
  actualAnswer: string,
  passed: boolean,
): Promise<void> {
  const identity = await db("agent_identities").where({ id: agentId }).first();
  if (!identity) throw new Error("Agent not found");

  const questions: GoldQuestion[] = typeof identity.gold_questions === "string"
    ? JSON.parse(identity.gold_questions)
    : identity.gold_questions || [];

  const idx = questions.findIndex((q) => q.id === questionId);
  if (idx === -1) throw new Error(`Gold question ${questionId} not found`);

  questions[idx].actualAnswer = actualAnswer;
  questions[idx].passed = passed;
  questions[idx].testedAt = new Date().toISOString();

  await db("agent_identities").where({ id: agentId }).update({
    gold_questions: JSON.stringify(questions),
  });
}

/**
 * Set the gate verdict. PASS only allowed if ALL gold questions passed.
 */
export async function setGateVerdict(agentId: string, verdict: "PASS" | "FAIL"): Promise<void> {
  if (verdict === "PASS") {
    const identity = await db("agent_identities").where({ id: agentId }).first();
    if (!identity) throw new Error("Agent not found");

    const questions: GoldQuestion[] = typeof identity.gold_questions === "string"
      ? JSON.parse(identity.gold_questions)
      : identity.gold_questions || [];

    if (questions.length === 0) {
      throw new Error("Cannot PASS with no gold questions defined");
    }

    const allPassed = questions.every((q) => q.passed === true);
    if (!allPassed) {
      throw new Error("Cannot PASS: not all gold questions have passed");
    }
  }

  const now = new Date();
  const expires = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  await db("agent_identities").where({ id: agentId }).update({
    gate_verdict: verdict,
    gate_date: now,
    gate_expires: expires,
  });

  // Log behavioral event for Morning Briefing
  try {
    await db("behavioral_events").insert({
      id: db.raw("gen_random_uuid()"),
      event_type: `canon.gate_${verdict.toLowerCase()}`,
      org_id: null,
      properties: JSON.stringify({ agentId, verdict }),
      created_at: now,
    });
  } catch (err) {
    console.error("[AgentIdentity] Failed to log gate verdict event:", err instanceof Error ? err.message : err);
  }
}

// =====================================================================
// QUERY HELPERS
// =====================================================================

/**
 * List all agents with their current status.
 */
export async function listAgents(): Promise<AgentIdentity[]> {
  return db("agent_identities").select("*").orderBy("agent_group").orderBy("slug");
}

/**
 * Get agents that are quarantined (for Morning Briefing).
 */
export async function getQuarantinedAgents(): Promise<AgentIdentity[]> {
  return db("agent_identities").where({ trust_level: "quarantined" }).select("*");
}

/**
 * Get recent audit log for an agent.
 */
export async function getAgentAuditLog(agentId: string, limit: number = 50): Promise<AgentAction[]> {
  return db("agent_audit_log").where({ agent_id: agentId }).orderBy("created_at", "desc").limit(limit);
}

/**
 * Get all scope violations across all agents (for security dashboard).
 */
export async function getRecentViolations(hours: number = 24): Promise<AgentAction[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return db("agent_audit_log")
    .where("action", "scope_violation")
    .where("created_at", ">=", since)
    .orderBy("created_at", "desc");
}
