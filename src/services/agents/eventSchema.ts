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
 *
 * NOTE: src/constants/eventTypes.ts is the SECOND registry. Both must stay in sync.
 * Long-term: deprecate constants/eventTypes.ts and import everything from here.
 * For now: any new event type goes in BOTH files until the migration is complete.
 */

// =====================================================================
// Event Type Registry -- every event_type string in the system
// =====================================================================

export const EVENT_TYPES = {
  // -- Billing --
  BILLING_SUBSCRIPTION_CREATED: "billing.subscription_created",
  BILLING_PAYMENT_SUCCEEDED: "billing.payment_succeeded",
  BILLING_PAYMENT_FAILED: "billing.payment_failed",
  BILLING_SUBSCRIPTION_CANCELLED: "billing.subscription_cancelled",
  BILLING_SUBSCRIPTION_PAUSED: "billing.subscription_paused",
  BILLING_CANCEL_REASON: "billing.cancel_reason",
  BILLING_ACCOUNT_SUSPENDED: "billing.account_suspended",

  // -- Checkup --
  CHECKUP_SCAN_STARTED: "checkup.scan_started",
  CHECKUP_SCAN_COMPLETED: "checkup.scan_completed",
  CHECKUP_EMAIL_CAPTURED: "checkup.email_captured",
  CHECKUP_ACCOUNT_CREATED: "checkup.account_created",
  CHECKUP_GATE_VIEWED: "checkup.gate_viewed",
  CHECKUP_STARTED: "checkup.started",

  // -- Champion / Referral --
  CHAMPION_OPTED_IN: "champion.opted_in",
  REFERRAL_CONVERTED: "referral.converted",
  REFERRAL_SUBMITTED: "referral.submitted",
  REFERRAL_SIGNUP_TRACKED: "referral.signup_tracked",
  REFERRAL_REWARD_APPLIED: "referral.reward_applied",
  REFERRAL_THANK_YOU_SENT: "referral.thank_you_sent",

  // -- Churn / Recovery --
  CHURN_RECOVERY_SENT: "churn.recovery_sent",

  // -- Clarity Metrics --
  CLARITY_METRICS_DAILY_SNAPSHOT: "clarity_metrics.daily_snapshot",

  // -- Client Monitor --
  CLIENT_HEALTH_SCORED: "client_health.scored",
  CLIENT_MONITOR_AMBER_NUDGE: "client_monitor.amber_nudge",

  // -- Collective Intelligence --
  COLLECTIVE_INTELLIGENCE_RUN: "collective_intelligence.run",

  // -- Competitor --
  COMPETITOR_MOVEMENT: "competitor.movement",
  COMPETITOR_REVIEW_SURGE: "competitor.review_surge",
  COMPETITOR_DISRUPTION_DETECTED: "competitor.disruption_detected",
  COMPETITOR_MATERIAL_MOVE: "competitor.material_move",

  // -- Concierge --
  CONCIERGE_BUG_ROUTED: "concierge.bug_routed",
  CONCIERGE_FEATURE_REQUESTED: "concierge.feature_requested",
  CONCIERGE_CLIENT_CONCERN: "concierge.client_concern",
  CONCIERGE_RED_ESCALATED: "concierge.red_escalated",

  // -- Content --
  CONTENT_DRAFT_CREATED: "content.draft_created",
  CONTENT_DRAFT_GENERATED: "content.draft_generated",
  CONTENT_SCRIPT_PRODUCED: "content.script_produced",
  CONTENT_GUEST_BRIEF_PRODUCED: "content.guest_brief_produced",
  CONTENT_VIDEO_QUEUED: "content.video_queued",
  CONTENT_VIDEO_COMPLETED: "content.video_completed",
  CONTENT_PRODUCTION_QUEUE: "content.production_queue",
  CONTENT_PERFORMANCE_REPORT: "content_performance.report",

  // -- CS Agent --
  CS_PROACTIVE_INTERVENTION: "cs.proactive_intervention",
  CS_COACH_PATTERN_UPDATE: "cs_coach.pattern_update",
  CS_PULSE_DAILY_BRIEF: "cs_pulse.daily_brief",

  // -- Dashboard Activity --
  DASHBOARD_VIEWED: "dashboard.viewed",

  // -- Data Export --
  DATA_EXPORT_ALL: "data.export_all",

  // -- Dreamweaver --
  DREAMWEAVER_MOMENT: "dreamweaver.moment_created",
  DREAMWEAVER_LEGEND_QUEUED: "dreamweaver.legend_queued",

  // -- Feedback --
  FEEDBACK_MONDAY_EMAIL_REQUESTED: "feedback.monday_email_requested",
  FEEDBACK_PATIENTPATH_PREVIEW: "feedback.patientpath_preview",
  FEEDBACK_NPS_REQUESTED: "feedback.nps_requested",
  FEEDBACK_NPS: "feedback.nps",

  // -- GBP --
  GBP_TOKEN_REVOKED: "gbp.token_revoked",

  // -- Growth --
  EXPANSION_NPS_PROMOTER: "expansion.nps_promoter",
  GROWTH_CONFERENCE_INTEL: "growth.conference_intel",
  GROWTH_PARTNERSHIP_OPPORTUNITY: "growth.partnership_opportunity",

  // -- Intelligence Agent --
  INTELLIGENCE_FINDING: "intelligence.finding",

  // -- Lob (Physical Mail) --
  LOB_CARD_QUEUED: "lob.card_queued",
  LOB_CARD_SENT: "lob.card_sent",

  // -- Milestones --
  MILESTONE_ACHIEVED: "milestone.achieved",

  // -- Monday Email --
  MONDAY_EMAIL_REPLIED: "monday_email.replied",
  MONDAY_CHAIN_COMPLETE: "monday_chain.complete",

  // -- Ops --
  OPS_BUG_DETECTED: "ops.bug_detected",

  // -- Patient Attribution --
  PATIENT_ATTRIBUTED: "patient.attributed",

  // -- PatientPath --
  PATIENTPATH_RESEARCH_COMPLETED: "patientpath.research_completed",
  PATIENTPATH_COPY_PRODUCED: "patientpath.copy_produced",

  // -- Personal Agents --
  PERSONAL_AGENT_HANDOFF: "personal_agent.handoff",

  // -- PR --
  PR_PITCH_GENERATED: "pr.pitch_generated",

  // -- Product Evolution --
  PRODUCT_EVOLUTION_PROPOSAL: "product_evolution.proposal",

  // -- Proofline --
  PROOFLINE_FINDING: "proofline.finding",

  // -- Quality --
  QUALITY_ICP_SIMULATION: "quality.icp_simulation",

  // -- Rankings --
  // NOTE: These lack dot-namespace (legacy). Do not rename without migrating existing DB rows.
  RANKING_IMPROVEMENT: "ranking_improvement",
  REVIEW_GROWTH: "review_growth",

  // -- Review System --
  REVIEW_RECEIVED: "review.received",
  REVIEW_REQUEST_CLICKED: "review_request.clicked",

  // -- SEO --
  SEO_PAGE_VIEWED: "seo_page.viewed",
  SEO_PAGE_CHECKUP_STARTED: "seo_page.checkup_started",
  SEO_PAGE_ANALYSIS: "seo.page_analysis",
  SEO_WEEKLY_SUMMARY: "seo.weekly_summary",

  // -- System: Abort Handler --
  ABORT_HANDLER_TRIGGERED: "abort_handler.triggered",

  // -- System: Admin --
  ADMIN_QUICK_CREATE: "admin.quick_create",

  // -- System: Agent Runtime --
  AGENT_ACTION: "agent.action",
  AGENT_FINDING: "agent.finding",
  AGENT_COST: "agent.cost",
  LOOP_CLOSED: "loop.closed",
  LEARNING_REVIEW_NEEDED: "learning.review_needed",
  LEARNING_SUGGESTED: "learning.suggested",
  LEARNING_CALIBRATION: "learning.calibration",

  // -- System: Canon Governance --
  CANON_GATE_PASS: "canon.gate_pass",
  CANON_GATE_FAIL: "canon.gate_fail",
  CANON_SIMULATION_RUN: "canon.simulation_run",

  // -- System: Circuit Breaker --
  CIRCUIT_BREAKER_STATE_CHANGE: "circuit_breaker.state_change",

  // -- System: Conductor --
  CONDUCTOR_GATE_CHECK: "conductor.gate_check",

  // -- System: Go/No-Go --
  GO_NO_GO_HELD: "go_no_go.held",
  GO_NO_GO_CLEARED: "go_no_go.cleared",

  // -- System: Kill Switch --
  KILL_SWITCH_ACTIVATED: "kill_switch.activated",
  KILL_SWITCH_DEACTIVATED: "kill_switch.deactivated",

  // -- System: Morning Briefing --
  MORNING_BRIEFING_DELIVERED: "morning_briefing.delivered",

  // -- System: Security --
  AGENT_QUARANTINED: "security.agent_quarantined",

  // -- System: Agent Auditor --
  AGENT_AUDITOR_FINDING: "agent_auditor.finding",

  // -- Trial --
  TRIAL_SETUP_INTENT_CREATED: "trial.setup_intent_created",
  TRIAL_CARD_ON_FILE: "trial.card_on_file",
  TRIAL_AUTO_CONVERTED: "trial.auto_converted",
  TRIAL_EMAIL_SENT: "trial_email.sent",

  // -- Week 1 --
  WEEK1_WIN_GENERATED: "week1_win.generated",

  // -- Weekly Digest --
  WEEKLY_DIGEST_POSTED: "weekly_digest.posted",

  // -- Welcome Intelligence --
  WELCOME_INTELLIGENCE_SENT: "welcome_intelligence.sent",
} as const;

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];

/**
 * Dynamic event type families -- these use template literals at write time.
 * The Auditor should treat any event matching these prefixes as known.
 */
export const DYNAMIC_EVENT_PREFIXES = [
  "ttfv.",           // ttfv.yes, ttfv.not_yet, etc.
  "help.",           // help.bug, help.question, etc.
  "frustration.",    // frustration.repeated_help, etc.
  "task.",           // task.completed, task.in_progress, etc.
  "trial.email_day_", // trial.email_day_1_sent, etc.
  "winback.day_",    // winback.day_7_sent, etc.
] as const;

// =====================================================================
// Event Properties Schemas -- what each event MUST contain
// =====================================================================

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

export interface BillingEventProps {
  stripe_subscription_id?: string;
  stripe_customer_id?: string;
  amount?: number;
  reason?: string;
}

export interface LobCardProps {
  recipient_name: string;
  card_type: string;
  trigger: string;
}

export interface TrialEventProps {
  stripe_setup_intent_id?: string;
  trial_days_remaining?: number;
}

// =====================================================================
// Event Type -> Properties mapping (compile-time enforcement)
// =====================================================================

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
  [EVENT_TYPES.BILLING_SUBSCRIPTION_CREATED]: BillingEventProps;
  [EVENT_TYPES.BILLING_PAYMENT_SUCCEEDED]: BillingEventProps;
  [EVENT_TYPES.BILLING_PAYMENT_FAILED]: BillingEventProps;
  [EVENT_TYPES.LOB_CARD_QUEUED]: LobCardProps;
  [EVENT_TYPES.LOB_CARD_SENT]: LobCardProps;
  [EVENT_TYPES.TRIAL_SETUP_INTENT_CREATED]: TrialEventProps;
  [EVENT_TYPES.TRIAL_CARD_ON_FILE]: TrialEventProps;
  [EVENT_TYPES.TRIAL_AUTO_CONVERTED]: TrialEventProps;
}

// =====================================================================
// Consumer Registry -- which agents read which event types
// =====================================================================

/**
 * Documents the producer -> consumer contracts.
 * Not enforced at runtime (consumers query the DB directly),
 * but serves as the authoritative reference for who reads what.
 *
 * If you change an event_type or its properties schema,
 * check every consumer listed here.
 */
export const EVENT_CONSUMERS: Record<string, string[]> = {
  // Billing
  [EVENT_TYPES.BILLING_SUBSCRIPTION_CREATED]: ["morning_briefing", "cfo_agent"],
  [EVENT_TYPES.BILLING_PAYMENT_SUCCEEDED]: ["morning_briefing", "cfo_agent", "dreamweaver"],
  [EVENT_TYPES.BILLING_PAYMENT_FAILED]: ["morning_briefing", "cs_agent", "cfo_agent"],
  [EVENT_TYPES.BILLING_SUBSCRIPTION_CANCELLED]: ["morning_briefing", "cs_agent", "cfo_agent"],
  [EVENT_TYPES.BILLING_SUBSCRIPTION_PAUSED]: ["cs_agent", "morning_briefing"],
  [EVENT_TYPES.BILLING_CANCEL_REASON]: ["learning_agent", "cs_coach"],
  [EVENT_TYPES.BILLING_ACCOUNT_SUSPENDED]: ["morning_briefing", "cs_agent"],

  // Checkup
  [EVENT_TYPES.CHECKUP_SCAN_COMPLETED]: ["welcome_intelligence", "monday_email"],
  [EVENT_TYPES.CHECKUP_ACCOUNT_CREATED]: ["morning_briefing", "trial_emails", "welcome_intelligence"],

  // Champion / Referral
  [EVENT_TYPES.CHAMPION_OPTED_IN]: ["dreamweaver"],
  [EVENT_TYPES.REFERRAL_CONVERTED]: ["dreamweaver", "morning_briefing"],
  [EVENT_TYPES.REFERRAL_SUBMITTED]: ["morning_briefing"],

  // Churn
  [EVENT_TYPES.CHURN_RECOVERY_SENT]: ["cs_agent", "morning_briefing"],

  // Client Monitor
  [EVENT_TYPES.CLIENT_HEALTH_SCORED]: ["morning_briefing"],
  [EVENT_TYPES.CLIENT_MONITOR_AMBER_NUDGE]: ["morning_briefing"],

  // Competitor
  [EVENT_TYPES.COMPETITOR_MOVEMENT]: ["monday_email", "dreamweaver"],
  [EVENT_TYPES.COMPETITOR_DISRUPTION_DETECTED]: ["monday_email", "morning_briefing"],
  [EVENT_TYPES.COMPETITOR_MATERIAL_MOVE]: ["morning_briefing", "competitive_scout"],

  // Concierge
  [EVENT_TYPES.CONCIERGE_BUG_ROUTED]: ["morning_briefing"],
  [EVENT_TYPES.CONCIERGE_RED_ESCALATED]: ["morning_briefing", "system_conductor"],

  // Content
  [EVENT_TYPES.CONTENT_DRAFT_CREATED]: ["system_conductor"],
  [EVENT_TYPES.CONTENT_VIDEO_COMPLETED]: ["morning_briefing"],

  // CS
  [EVENT_TYPES.CS_PROACTIVE_INTERVENTION]: ["cs_coach", "morning_briefing"],
  [EVENT_TYPES.CS_PULSE_DAILY_BRIEF]: ["morning_briefing"],

  // Dashboard
  [EVENT_TYPES.DASHBOARD_VIEWED]: ["dreamweaver", "client_monitor"],

  // Dreamweaver
  [EVENT_TYPES.DREAMWEAVER_MOMENT]: ["morning_briefing"],
  [EVENT_TYPES.DREAMWEAVER_LEGEND_QUEUED]: ["morning_briefing"],

  // Feedback
  [EVENT_TYPES.FEEDBACK_NPS]: ["learning_agent", "cs_coach"],
  [EVENT_TYPES.EXPANSION_NPS_PROMOTER]: ["cs_expander", "dreamweaver"],

  // Intelligence
  [EVENT_TYPES.INTELLIGENCE_FINDING]: ["monday_email", "morning_briefing", "go_no_go"],

  // Lob
  [EVENT_TYPES.LOB_CARD_QUEUED]: ["morning_briefing"],
  [EVENT_TYPES.LOB_CARD_SENT]: ["morning_briefing"],

  // Milestones
  [EVENT_TYPES.MILESTONE_ACHIEVED]: ["dreamweaver"],

  // Monday Email
  [EVENT_TYPES.MONDAY_EMAIL_REPLIED]: ["cs_agent", "morning_briefing"],
  [EVENT_TYPES.MONDAY_CHAIN_COMPLETE]: ["morning_briefing"],

  // Patient
  [EVENT_TYPES.PATIENT_ATTRIBUTED]: ["monday_email", "dreamweaver"],

  // Rankings
  [EVENT_TYPES.RANKING_IMPROVEMENT]: ["monday_email", "dreamweaver"],
  [EVENT_TYPES.REVIEW_GROWTH]: ["monday_email"],

  // Review
  [EVENT_TYPES.REVIEW_RECEIVED]: ["dreamweaver", "monday_email"],

  // SEO
  [EVENT_TYPES.SEO_PAGE_CHECKUP_STARTED]: ["morning_briefing"],

  // Agent Runtime
  [EVENT_TYPES.AGENT_ACTION]: ["system_conductor", "consistency_check"],
  [EVENT_TYPES.LOOP_CLOSED]: ["learning_agent"],
  [EVENT_TYPES.LEARNING_REVIEW_NEEDED]: ["learning_agent"],

  // Canon
  [EVENT_TYPES.CANON_GATE_PASS]: ["morning_briefing"],
  [EVENT_TYPES.CANON_GATE_FAIL]: ["morning_briefing"],

  // Circuit Breaker / Security
  [EVENT_TYPES.CIRCUIT_BREAKER_STATE_CHANGE]: ["morning_briefing"],
  [EVENT_TYPES.AGENT_QUARANTINED]: ["morning_briefing"],
  [EVENT_TYPES.GO_NO_GO_HELD]: ["morning_briefing"],

  // Auditor
  [EVENT_TYPES.AGENT_AUDITOR_FINDING]: ["morning_briefing"],

  // Trial
  [EVENT_TYPES.TRIAL_AUTO_CONVERTED]: ["morning_briefing", "cfo_agent", "dreamweaver"],
  [EVENT_TYPES.TRIAL_EMAIL_SENT]: ["morning_briefing"],

  // Week 1 / Welcome
  [EVENT_TYPES.WEEK1_WIN_GENERATED]: ["morning_briefing", "dreamweaver"],
  [EVENT_TYPES.WELCOME_INTELLIGENCE_SENT]: ["morning_briefing"],
};
