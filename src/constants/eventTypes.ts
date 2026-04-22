/**
 * Event Type Registry -- Single Source of Truth for the Signal Bus
 *
 * Every behavioral_events.event_type string is defined here ONCE.
 * Producers import from here. Consumers import from here.
 * TypeScript catches naming drift at compile time.
 *
 * If you need a new event type, add it here first. If it's not
 * in this file, it doesn't exist in the signal bus.
 *
 * "Work clean, stay clean, clean as I go." -- Hiro
 *
 * Organized by domain (matches agent group boundaries from agentIdentity.ts):
 * - CHECKUP: user-facing checkup funnel
 * - CLIENT: client health, CS interventions
 * - COMPETITOR: competitive intelligence
 * - CONTENT: content creation, publishing, performance
 * - FINANCIAL: CFO, billing, revenue
 * - FOUNDATION: Heroes & Founders operations
 * - GROWTH: conversion, expansion, vertical readiness
 * - INTELLIGENCE: findings, briefings, signals
 * - MARKETING: page views, CTAs, checkup starts
 * - MILESTONE: achievements, streaks, first wins
 * - OPS: orphan detection, bug triage, infrastructure
 * - PERSONAL: team-specific agent outputs
 * - REVIEW: review requests, responses, velocity
 * - SECURITY: rate limits, auth events, agent quarantine
 * - SYSTEM: orchestrator, conductor, kill switch, loops
 */

// ── CHECKUP ─────────────────────────────────────────────────────────

/** Checkup scan initiated (before Google Places call) */
export const CHECKUP_SCAN_STARTED = "checkup.scan_started";
/** Checkup scan completed (results computed) */
export const CHECKUP_SCAN_COMPLETED = "checkup.scan_completed";
/** Email captured during checkup gate */
export const CHECKUP_EMAIL_CAPTURED = "checkup.email_captured";
/** Account created from checkup conversion */
export const CHECKUP_ACCOUNT_CREATED = "checkup.account_created";
/** Checkup gate viewed (landing page) */
export const CHECKUP_GATE_VIEWED = "checkup.gate_viewed";
/** Checkup started (marketing tracker) */
export const CHECKUP_STARTED = "checkup.started";

// ── CLIENT ──────────────────────────────────────────────────────────

/** Client health scored by Client Monitor (GREEN/AMBER/RED) */
export const CLIENT_HEALTH_SCORED = "client_health.scored";
/** Amber client nudge sent */
export const CLIENT_MONITOR_AMBER_NUDGE = "client_monitor.amber_nudge";
/** CS proactive intervention triggered */
export const CS_PROACTIVE_INTERVENTION = "cs.proactive_intervention";
/** CS Coach pattern update */
export const CS_COACH_PATTERN_UPDATE = "cs_coach.pattern_update";

// ── COMPETITOR ──────────────────────────────────────────────────────

/** Competitor review count surged (significant increase detected) */
export const COMPETITOR_REVIEW_SURGE = "competitor.review_surge";
/** Competitor ranking movement detected */
export const COMPETITOR_MOVEMENT = "competitor.movement";

// ── CONTENT ─────────────────────────────────────────────────────────

/** CMO weekly content brief generated */
export const CMO_CONTENT_BRIEF = "cmo.content_brief";
/** CMO weekly content calendar */
export const CMO_WEEKLY_CALENDAR = "cmo.weekly_calendar";
/** Trend detected by Trend Scout */
export const CONTENT_TREND_DETECTED = "content.trend_detected";
/** Trend Scout weekly summary */
export const CONTENT_TREND_SCOUT_SUMMARY = "content.trend_scout_summary";
/** Ghost Writer content extracted */
export const CONTENT_GHOST_WRITER_EXTRACT = "content.ghost_writer_extract";
/** Content performance brief */
export const CONTENT_PERFORMANCE_BRIEF = "content.performance_brief";
/** Podcast opportunity identified */
export const CONTENT_PODCAST_OPPORTUNITY = "content.podcast_opportunity";
/** Podcast Scout summary */
export const CONTENT_PODCAST_SCOUT_SUMMARY = "content.podcast_scout_summary";

// ── FINANCIAL ───────────────────────────────────────────────────────

/** CFO monthly financial report */
export const CFO_MONTHLY_REPORT = "cfo.monthly_report";

// ── FOUNDATION ──────────────────────────────────────────────────────

/** Foundation operations weekly report */
export const FOUNDATION_OPS_REPORT = "foundation.ops_report";

// ── GROWTH ──────────────────────────────────────────────────────────

/** Conversion funnel analysis completed */
export const CONVERSION_FUNNEL_ANALYSIS = "conversion.funnel_analysis";
/** Expansion opportunity detected by CS Expander */
export const EXPANSION_OPPORTUNITY_DETECTED = "expansion.opportunity_detected";
/** Vertical readiness assessment */
export const GROWTH_VERTICAL_READINESS = "growth.vertical_readiness";

// ── INTELLIGENCE ────────────────────────────────────────────────────

/** Intelligence finding (with biological-economic lens) */
export const INTELLIGENCE_FINDING = "intelligence.finding";
/** AEO search presence data */
export const AEO_SEARCH_PRESENCE = "aeo.search_presence";
/** AEO weekly summary */
export const AEO_WEEKLY_SUMMARY = "aeo.weekly_summary";
/** Market signal detected */
export const MARKET_SIGNAL_DETECTED = "market.signal_detected";
/** Market Signal Scout summary */
export const MARKET_SCOUT_SUMMARY = "market.scout_summary";
/** Technology horizon signal */
export const TECH_HORIZON_SIGNAL = "tech.horizon_signal";
/** Technology Horizon summary */
export const TECH_HORIZON_SUMMARY = "tech.horizon_summary";
/** Strategic Intelligence landscape update */
export const STRATEGY_LANDSCAPE_UPDATE = "strategy.landscape_update";

// ── MARKETING ───────────────────────────────────────────────────────

/** Page view tracked */
export const MARKETING_PAGE_VIEW = "marketing.page_view";
/** CTA click tracked */
export const MARKETING_CTA_CLICK = "marketing.cta_click";
/** Checkup start from marketing */
export const MARKETING_CHECKUP_START = "marketing.checkup_start";

// ── MILESTONE ───────────────────────────────────────────────────────

/** Milestone achieved (detected by milestoneDetector) */
export const MILESTONE_ACHIEVED = "milestone.achieved";
/** First win achieved (referral recovered, ranking improved, etc.) */
export const FIRST_WIN_ACHIEVED = "first_win.achieved";
/** One Action Card completed by user */
export const ONE_ACTION_COMPLETED = "one_action.completed";

// ── OPS ─────────────────────────────────────────────────────────────

/** Orphan document detected by Nothing Gets Lost */
export const OPS_ORPHAN_DETECTED = "ops.orphan_detected";
/** Hiring signal detected */
export const OPS_HIRING_SIGNAL = "ops.hiring_signal";

// ── PERSONAL ────────────────────────────────────────────────────────

/** Personal financial brief (for Corey) */
export const PERSONAL_FINANCIAL_BRIEF = "personal.financial_brief";
/** Personal tax brief */
export const PERSONAL_TAX_BRIEF = "personal.tax_brief";
/** Personal property scan */
export const PERSONAL_PROPERTY_SCAN = "personal.property_scan";
/** Personal price check */
export const PERSONAL_PRICE_CHECK = "personal.price_check";

// ── REVIEW ──────────────────────────────────────────────────────────

/** Review request sent to patient */
export const REVIEW_REQUEST_SENT = "review_request.sent";

// ── SECURITY ────────────────────────────────────────────────────────

/** Rate limit hit on public endpoint */
export const SECURITY_RATE_LIMIT_HIT = "security.rate_limit_hit";
/** Agent quarantined by identity system */
export const SECURITY_AGENT_QUARANTINED = "security.agent_quarantined";

// ── SYSTEM ──────────────────────────────────────────────────────────

/** Agent generic action (recorded by agentRuntime) */
export const AGENT_ACTION = "agent.action";
/** Orchestrator decision logged */
export const ORCHESTRATOR_DECISION = "orchestrator.decision";
/** Morning Briefing assembled */
export const MORNING_BRIEFING_ASSEMBLED = "morning_briefing.assembled";
/** Monday email opened by recipient */
export const MONDAY_EMAIL_OPENED = "monday_email.opened";
/** Monday email sent */
export const MONDAY_EMAIL_SENT = "monday_email.sent";
/** Result email sent (checkup results) */
export const RESULT_EMAIL_SENT = "result_email.sent";
/** Weekly digest assembled */
export const DIGEST_WEEKLY_SUMMARY = "digest.weekly_summary";
/** Learning Agent weekly calibration */
export const LEARNING_WEEKLY_CALIBRATION = "learning.weekly_calibration";
/** Learning suggestion proposed */
export const LEARNING_SUGGESTED = "learning.suggested";
/** Feedback loop closed (agentRuntime) */
export const LOOP_CLOSED = "loop.closed";
/** ClearPath website build triggered */
export const CLEARPATH_BUILD_TRIGGERED = "clearpath.build_triggered";
/** Dreamweaver hospitality moment created */
export const DREAMWEAVER_MOMENT_CREATED = "dreamweaver.moment_created";
/** Concierge routed a bug report */
export const CONCIERGE_BUG_ROUTED = "concierge.bug_routed";
/** Go/No-Go poll held delivery */
export const GO_NO_GO_HELD = "go_no_go.held";
/** Go/No-Go poll cleared delivery */
export const GO_NO_GO_CLEARED = "go_no_go.cleared";
/** Legal trademark scan completed */
export const LEGAL_TRADEMARK_SCAN = "legal.trademark_scan";
/** Audit test event */
export const AUDIT_TEST = "audit.test";

// ── DATA GAP RESOLVER ───────────────────────────────────────────────

/** Data Gap Resolver started for an org */
export const DATA_GAP_RESOLVER_STARTED = "data_gap_resolver.started";
/** Data Gap Resolver completed for an org */
export const DATA_GAP_RESOLVER_COMPLETED = "data_gap_resolver.completed";
/** Data Gap Resolver resolved a single field from a public source */
export const DATA_GAP_RESOLVER_FIELD_RESOLVED = "data_gap_resolver.field_resolved";

// ── WATCHER ─────────────────────────────────────────────────────────

/** Watcher Agent hourly per-practice scan started */
export const WATCHER_HOURLY_SCAN_STARTED = "watcher.hourly_scan_started";
/** Watcher Agent hourly per-practice scan completed */
export const WATCHER_HOURLY_SCAN_COMPLETED = "watcher.hourly_scan_completed";
/** Watcher Agent daily cross-practice scan started */
export const WATCHER_DAILY_SCAN_STARTED = "watcher.daily_scan_started";
/** Watcher Agent daily cross-practice scan completed */
export const WATCHER_DAILY_SCAN_COMPLETED = "watcher.daily_scan_completed";
/** Watcher Agent detected a signal (review velocity, ranking, competitor, etc.) */
export const WATCHER_SIGNAL_DETECTED = "watcher.signal_detected";

// ── GP/REFERRAL ─────────────────────────────────────────────────────

/** GP referral source went dark (no referrals in 60+ days) */
export const GP_GONE_DARK = "gp.gone_dark";
/** GP referral drift detected (declining trend) */
export const GP_DRIFT_DETECTED = "gp.drift_detected";

// ── CONVENIENCE GROUPS ──────────────────────────────────────────────
// Used by Morning Briefing and other aggregators

export const SIGNUP_EVENTS: string[] = [
  CHECKUP_ACCOUNT_CREATED,
  CHECKUP_EMAIL_CAPTURED,
];

export const COMPETITOR_EVENTS: string[] = [
  COMPETITOR_REVIEW_SURGE,
  COMPETITOR_MOVEMENT,
];

export const REVIEW_EVENTS: string[] = [
  REVIEW_REQUEST_SENT,
];

export const HEALTH_EVENTS: string[] = [
  CLIENT_HEALTH_SCORED,
];

export const MILESTONE_EVENTS: string[] = [
  MILESTONE_ACHIEVED,
  FIRST_WIN_ACHIEVED,
];
