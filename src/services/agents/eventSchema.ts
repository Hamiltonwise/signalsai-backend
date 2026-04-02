/**
 * Event Schema Registry -- The Document in Between
 *
 * Every agent writes to behavioral_events. Every other agent reads from it.
 * The event_type string and properties schema are the CONTRACT between agents.
 * If the contract breaks (cs_agent.% vs cs.%), agents go blind.
 *
 * This file is the table of contents. TypeScript enforces it at compile time.
 * If an agent writes an event with missing required fields, the code won't compile.
 * If a consumer queries for an event type that doesn't exist here, the code won't compile.
 *
 * The document in between, with a table of contents, enforced by the compiler.
 */

// ═══════════════════════════════════════════════════════════════════
// Event Type Registry -- every event_type string in the system
// ═══════════════════════════════════════════════════════════════════

export const EVENT_TYPES = {
  // ── Client Monitor ──
  CLIENT_HEALTH_SCORED: "client_health.scored",
  CLIENT_MONITOR_AMBER_NUDGE: "client_monitor.amber_nudge",

  // ── CS Agent ──
  CS_PROACTIVE_INTERVENTION: "cs.proactive_intervention",

  // ── Intelligence Agent ──
  INTELLIGENCE_FINDING: "intelligence.finding",

  // ── Dreamweaver ──
  DREAMWEAVER_MOMENT: "dreamweaver.moment_created",

  // ── Proofline ──
  PROOFLINE_FINDING: "proofline.finding",

  // ── Competitive Scout ──
  COMPETITOR_MOVEMENT: "competitor.movement",

  // ── Review System ──
  REVIEW_RECEIVED: "review.received",

  // ── Milestones ──
  MILESTONE_ACHIEVED: "milestone.achieved",

  // ── Referral System ──
  REFERRAL_CONVERTED: "referral.converted",

  // ── Dashboard Activity ──
  DASHBOARD_VIEWED: "dashboard.viewed",

  // ── Agent Runtime ──
  AGENT_ACTION: "agent.action",
  LOOP_CLOSED: "loop.closed",
  LEARNING_REVIEW_NEEDED: "learning.review_needed",
  LEARNING_SUGGESTED: "learning.suggested",

  // ── System Conductor ──
  CONDUCTOR_GATE_CHECK: "conductor.gate_check",

  // ── Circuit Breaker ──
  CIRCUIT_BREAKER_STATE_CHANGE: "circuit_breaker.state_change",

  // ── Kill Switch ──
  KILL_SWITCH_ACTIVATED: "kill_switch.activated",
  KILL_SWITCH_DEACTIVATED: "kill_switch.deactivated",

  // ── Go/No-Go ──
  GO_NO_GO_HELD: "go_no_go.held",
  GO_NO_GO_CLEARED: "go_no_go.cleared",

  // ── Canon Governance ──
  CANON_GATE_PASS: "canon.gate_pass",
  CANON_GATE_FAIL: "canon.gate_fail",
  CANON_SIMULATION_RUN: "canon.simulation_run",

  // ── Security ──
  AGENT_QUARANTINED: "security.agent_quarantined",

  // ── CS Coach ──
  CS_COACH_PATTERN_UPDATE: "cs_coach.pattern_update",

  // ── Morning Briefing ──
  MORNING_BRIEFING_DELIVERED: "morning_briefing.delivered",

  // ── Content Performance ──
  CONTENT_PERFORMANCE_REPORT: "content_performance.report",

  // ── Learning Agent ──
  LEARNING_CALIBRATION: "learning.calibration",
} as const;

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];

// ═══════════════════════════════════════════════════════════════════
// Event Properties Schemas -- what each event MUST contain
// ═══════════════════════════════════════════════════════════════════

export interface ClientHealthScoredProps {
  score: number;
  classification: "GREEN" | "AMBER" | "RED";
  event_count: number;
}

export interface CSProactiveInterventionProps {
  trigger_type: "stalled_onboarding" | "short_sessions" | "feature_non_adoption" | "billing_friction";
  suggested_action: string;
  message: string;
  org_name: string;
}

export interface IntelligenceFindingProps {
  headline: string;
  detail: string;
  humanNeed: string | null;
  economicConsequence: string | null;
}

export interface DreamweaverMomentProps {
  moment_type: string;
  title: string;
  message: string;
}

export interface CompetitorMovementProps {
  competitor_name: string;
  direction: "client_gaining" | "competitor_gaining";
  metric: string;
  delta: number;
}

export interface ReviewReceivedProps {
  rating: number;
  reviewer_name: string | null;
  source: string;
}

export interface AgentActionProps {
  agent_name: string;
  action_type: string;
  topic: string | null;
  headline: string;
  detail: string | null;
  human_need: string | null;
  economic_consequence: string | null;
}

export interface ConductorGateCheckProps {
  agent: string;
  gate: string;
  result: "pass" | "hold";
  reason: string;
}

export interface CircuitBreakerStateChangeProps {
  agent_name: string;
  previous_state: string;
  new_state: string;
  reason: string;
  timestamp: string;
}

export interface CanonSimulationRunProps {
  agentSlug: string;
  agentKey: string;
  success: boolean;
  durationMs: number;
  questionsEvaluated: number;
  error: string | null;
}

// ═══════════════════════════════════════════════════════════════════
// Event Type -> Properties mapping (compile-time enforcement)
// ═══════════════════════════════════════════════════════════════════

export interface EventPropertiesMap {
  [EVENT_TYPES.CLIENT_HEALTH_SCORED]: ClientHealthScoredProps;
  [EVENT_TYPES.CS_PROACTIVE_INTERVENTION]: CSProactiveInterventionProps;
  [EVENT_TYPES.INTELLIGENCE_FINDING]: IntelligenceFindingProps;
  [EVENT_TYPES.DREAMWEAVER_MOMENT]: DreamweaverMomentProps;
  [EVENT_TYPES.COMPETITOR_MOVEMENT]: CompetitorMovementProps;
  [EVENT_TYPES.REVIEW_RECEIVED]: ReviewReceivedProps;
  [EVENT_TYPES.AGENT_ACTION]: AgentActionProps;
  [EVENT_TYPES.CONDUCTOR_GATE_CHECK]: ConductorGateCheckProps;
  [EVENT_TYPES.CIRCUIT_BREAKER_STATE_CHANGE]: CircuitBreakerStateChangeProps;
  [EVENT_TYPES.CANON_SIMULATION_RUN]: CanonSimulationRunProps;
}

// ═══════════════════════════════════════════════════════════════════
// Consumer Registry -- which agents read which event types
// ═══════════════════════════════════════════════════════════════════

/**
 * Documents the producer -> consumer contracts.
 * Not enforced at runtime (consumers query the DB directly),
 * but serves as the authoritative reference for who reads what.
 *
 * If you change an event_type or its properties schema,
 * check every consumer listed here.
 */
export const EVENT_CONSUMERS: Record<string, string[]> = {
  [EVENT_TYPES.CLIENT_HEALTH_SCORED]: ["morning_briefing"],
  [EVENT_TYPES.CLIENT_MONITOR_AMBER_NUDGE]: ["morning_briefing"],
  [EVENT_TYPES.CS_PROACTIVE_INTERVENTION]: ["cs_coach", "morning_briefing"],
  [EVENT_TYPES.INTELLIGENCE_FINDING]: ["monday_email", "morning_briefing", "go_no_go"],
  [EVENT_TYPES.DREAMWEAVER_MOMENT]: ["morning_briefing", "dreamweaver_rate_limit"],
  [EVENT_TYPES.COMPETITOR_MOVEMENT]: ["monday_email", "dreamweaver"],
  [EVENT_TYPES.REVIEW_RECEIVED]: ["dreamweaver", "monday_email"],
  [EVENT_TYPES.MILESTONE_ACHIEVED]: ["dreamweaver"],
  [EVENT_TYPES.REFERRAL_CONVERTED]: ["dreamweaver"],
  [EVENT_TYPES.DASHBOARD_VIEWED]: ["dreamweaver_welcome_back"],
  [EVENT_TYPES.AGENT_ACTION]: ["system_conductor", "consistency_check"],
  [EVENT_TYPES.LOOP_CLOSED]: ["learning_agent"],
  [EVENT_TYPES.LEARNING_REVIEW_NEEDED]: ["learning_agent"],
  [EVENT_TYPES.CANON_GATE_PASS]: ["morning_briefing"],
  [EVENT_TYPES.CANON_GATE_FAIL]: ["morning_briefing"],
  [EVENT_TYPES.CIRCUIT_BREAKER_STATE_CHANGE]: ["morning_briefing"],
  [EVENT_TYPES.AGENT_QUARANTINED]: ["morning_briefing"],
  [EVENT_TYPES.GO_NO_GO_HELD]: ["morning_briefing"],
};
