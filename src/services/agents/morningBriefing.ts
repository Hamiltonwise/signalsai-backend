/**
 * Morning Briefing Agent -- Execution Service
 *
 * Runs daily at 6:30 AM ET (after Client Monitor at 6 AM).
 * Assembles overnight signals from behavioral_events into a
 * structured summary for the admin dashboard.
 *
 * Groups by: new signups, competitor movements, review activity,
 * client health changes, milestone achievements.
 *
 * Stores the briefing in the morning_briefings table and exposes
 * via GET /api/admin/morning-briefing/latest.
 */

import { db } from "../../database/connection";

// ── Types ───────────────────────────────────────────────────────────

interface AgentActivitySection {
  eventType: string;
  label: string;
  count: number;
  details: Array<{ orgId: number | null; summary: string; timestamp: string }>;
}

interface MorningBriefingSummary {
  date: string;
  newSignups: number;
  competitorMoves: number;
  reviewsReceived: number;
  clientHealth: {
    green: number;
    amber: number;
    red: number;
  };
  milestones: number;
  topEvent: string | null;
  intelligenceFindings: number;
  dreamweaverMoments: number;
  csInterventions: number;
  funnelAnalyses: number;
  marketSignals: number;
  techHorizonSignals: number;
  bugsDetected: number;
  orphansDetected: number;
  contentBriefs: number;
  performanceBriefs: number;
  trendsDetected: number;
  csCoachUpdates: number;
  learningCalibrations: number;
  seoAnalyses: number;
  aeoPresence: number;
  ghostWriterExtracts: number;
  agentActivity: AgentActivitySection[];
}

// ── Event type mappings ─────────────────────────────────────────────

const SIGNUP_EVENTS = ["account.created", "checkup.submitted"];
const COMPETITOR_EVENTS = [
  "competitor.reviews_surge",
  "competitor.rating_changed",
  "competitor.new_entrant",
  "competitive_scout.movement",
];
const REVIEW_EVENTS = [
  "review_request.sent",
  "review.received",
  "review_sync.completed",
];
const HEALTH_EVENTS = ["client_health.scored"];
const MILESTONE_EVENTS = [
  "milestone.achieved",
  "milestone.detected",
  "week1_win.generated",
];

// Agent activity event types (16 additional coverage areas)
const AGENT_EVENT_TYPES: Array<{
  eventType: string;
  label: string;
  key: string;
}> = [
  { eventType: "intelligence.finding", label: "Intelligence Findings", key: "intelligenceFindings" },
  { eventType: "dreamweaver.moment_created", label: "Dreamweaver Moments", key: "dreamweaverMoments" },
  { eventType: "cs.proactive_intervention", label: "CS Interventions", key: "csInterventions" },
  { eventType: "conversion.funnel_analysis", label: "Funnel Analyses", key: "funnelAnalyses" },
  { eventType: "market.signal_detected", label: "Market Signals", key: "marketSignals" },
  { eventType: "tech.horizon_signal", label: "Tech Horizon Signals", key: "techHorizonSignals" },
  { eventType: "ops.bug_detected", label: "Bugs Detected", key: "bugsDetected" },
  { eventType: "ops.orphan_detected", label: "Orphans Detected", key: "orphansDetected" },
  { eventType: "cmo.content_brief", label: "Content Briefs", key: "contentBriefs" },
  { eventType: "content.performance_brief", label: "Performance Briefs", key: "performanceBriefs" },
  { eventType: "content.trend_detected", label: "Trends Detected", key: "trendsDetected" },
  { eventType: "cs_coach.pattern_update", label: "CS Coach Updates", key: "csCoachUpdates" },
  { eventType: "learning.weekly_calibration", label: "Learning Calibrations", key: "learningCalibrations" },
  { eventType: "seo.page_analysis", label: "SEO Analyses", key: "seoAnalyses" },
  { eventType: "aeo.search_presence", label: "AEO Presence", key: "aeoPresence" },
  { eventType: "content.ghost_writer_extract", label: "Ghost Writer Extracts", key: "ghostWriterExtracts" },
];

// ── Core ────────────────────────────────────────────────────────────

/**
 * Assemble the morning briefing from the last 24 hours of events.
 * Stores the result in morning_briefings and returns the summary.
 */
export async function runMorningBriefing(): Promise<MorningBriefingSummary> {
  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

  // Fetch all events from the last 24 hours
  const events = await db("behavioral_events")
    .where("created_at", ">=", twentyFourHoursAgo)
    .select("event_type", "org_id", "properties", "created_at");

  // Group and count
  const newSignups = events.filter((e) =>
    SIGNUP_EVENTS.includes(e.event_type),
  ).length;

  const competitorMoves = events.filter((e) =>
    COMPETITOR_EVENTS.includes(e.event_type),
  ).length;

  const reviewsReceived = events.filter((e) =>
    REVIEW_EVENTS.includes(e.event_type),
  ).length;

  const milestones = events.filter((e) =>
    MILESTONE_EVENTS.includes(e.event_type),
  ).length;

  // Extract client health from the latest scored events
  const healthEvents = events.filter((e) =>
    HEALTH_EVENTS.includes(e.event_type),
  );
  const clientHealth = { green: 0, amber: 0, red: 0 };
  for (const he of healthEvents) {
    const props =
      typeof he.properties === "string"
        ? JSON.parse(he.properties)
        : he.properties || {};
    const classification = props.classification as
      | "green"
      | "amber"
      | "red"
      | undefined;
    if (classification && classification in clientHealth) {
      clientHealth[classification]++;
    }
  }

  // Aggregate all 16 agent activity event types
  const agentActivity: AgentActivitySection[] = [];
  const agentCounts: Record<string, number> = {};

  for (const mapping of AGENT_EVENT_TYPES) {
    const matched = events.filter((e) => e.event_type === mapping.eventType);
    agentCounts[mapping.key] = matched.length;

    if (matched.length > 0) {
      agentActivity.push({
        eventType: mapping.eventType,
        label: mapping.label,
        count: matched.length,
        details: matched.map((e) => {
          const props =
            typeof e.properties === "string"
              ? JSON.parse(e.properties)
              : e.properties || {};
          return {
            orgId: e.org_id,
            summary: props.summary ?? props.message ?? props.title ?? mapping.label,
            timestamp: e.created_at?.toISOString?.() ?? String(e.created_at),
          };
        }),
      });
    }
  }

  // Determine the top event (most impactful signal)
  const topEvent = determineTopEvent(events);

  const today = new Date().toISOString().split("T")[0];

  const summary: MorningBriefingSummary = {
    date: today,
    newSignups,
    competitorMoves,
    reviewsReceived,
    clientHealth,
    milestones,
    topEvent,
    intelligenceFindings: agentCounts["intelligenceFindings"] ?? 0,
    dreamweaverMoments: agentCounts["dreamweaverMoments"] ?? 0,
    csInterventions: agentCounts["csInterventions"] ?? 0,
    funnelAnalyses: agentCounts["funnelAnalyses"] ?? 0,
    marketSignals: agentCounts["marketSignals"] ?? 0,
    techHorizonSignals: agentCounts["techHorizonSignals"] ?? 0,
    bugsDetected: agentCounts["bugsDetected"] ?? 0,
    orphansDetected: agentCounts["orphansDetected"] ?? 0,
    contentBriefs: agentCounts["contentBriefs"] ?? 0,
    performanceBriefs: agentCounts["performanceBriefs"] ?? 0,
    trendsDetected: agentCounts["trendsDetected"] ?? 0,
    csCoachUpdates: agentCounts["csCoachUpdates"] ?? 0,
    learningCalibrations: agentCounts["learningCalibrations"] ?? 0,
    seoAnalyses: agentCounts["seoAnalyses"] ?? 0,
    aeoPresence: agentCounts["aeoPresence"] ?? 0,
    ghostWriterExtracts: agentCounts["ghostWriterExtracts"] ?? 0,
    agentActivity,
  };

  // Store in morning_briefings table
  const tableExists = await db.schema.hasTable("morning_briefings");
  if (tableExists) {
    await db("morning_briefings")
      .insert({
        id: db.raw("gen_random_uuid()"),
        briefing_date: today,
        summary: JSON.stringify(summary),
        new_signups: newSignups,
        competitor_moves: competitorMoves,
        reviews_received: reviewsReceived,
        client_health_green: clientHealth.green,
        client_health_amber: clientHealth.amber,
        client_health_red: clientHealth.red,
        milestones,
        top_event: topEvent,
        created_at: new Date(),
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[MorningBriefing] Failed to store briefing:", message);
      });
  } else {
    console.warn(
      "[MorningBriefing] morning_briefings table does not exist, skipping storage",
    );
  }

  // Log the briefing event
  const agentActivityTotals: Record<string, number> = {};
  for (const section of agentActivity) {
    agentActivityTotals[section.eventType] = section.count;
  }

  await db("behavioral_events")
    .insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "morning_briefing.assembled",
      properties: JSON.stringify({
        date: today,
        total_events: events.length,
        new_signups: newSignups,
        competitor_moves: competitorMoves,
        reviews_received: reviewsReceived,
        milestones,
        agent_activity: agentActivityTotals,
      }),
      created_at: new Date(),
    })
    .catch(() => {});

  const activeAgentSections = agentActivity
    .map((s) => `${s.count} ${s.label.toLowerCase()}`)
    .join(", ");

  console.log(
    `[MorningBriefing] Assembled for ${today}: ${events.length} events, ` +
      `${newSignups} signups, ${competitorMoves} competitor moves, ` +
      `${reviewsReceived} reviews, ${milestones} milestones` +
      (activeAgentSections ? `, ${activeAgentSections}` : ""),
  );

  return summary;
}

/**
 * Determine the single most impactful event from the last 24 hours.
 * Priority: RED health > competitor surges > new signups > milestones.
 */
function determineTopEvent(
  events: Array<{
    event_type: string;
    org_id: number | null;
    properties: unknown;
  }>,
): string | null {
  // Check for RED client health events
  const redEvents = events.filter((e) => {
    if (e.event_type !== "client_health.scored") return false;
    const props =
      typeof e.properties === "string"
        ? JSON.parse(e.properties)
        : e.properties || {};
    return props.classification === "red";
  });
  if (redEvents.length > 0) {
    return `${redEvents.length} client(s) flagged RED. Immediate follow-up needed.`;
  }

  // Check for competitor surges
  const surges = events.filter(
    (e) => e.event_type === "competitor.reviews_surge",
  );
  if (surges.length > 0) {
    return `${surges.length} competitor review surge(s) detected overnight.`;
  }

  // Check for new signups
  const signups = events.filter((e) =>
    SIGNUP_EVENTS.includes(e.event_type),
  );
  if (signups.length > 0) {
    return `${signups.length} new signup(s) overnight.`;
  }

  // Check for bugs detected (ops issue, high priority)
  const bugs = events.filter((e) => e.event_type === "ops.bug_detected");
  if (bugs.length > 0) {
    return `${bugs.length} bug(s) detected overnight. Review needed.`;
  }

  // Check for CS proactive interventions
  const csInterventions = events.filter(
    (e) => e.event_type === "cs.proactive_intervention",
  );
  if (csInterventions.length > 0) {
    return `${csInterventions.length} proactive CS intervention(s) triggered.`;
  }

  // Check for intelligence findings
  const findings = events.filter(
    (e) => e.event_type === "intelligence.finding",
  );
  if (findings.length > 0) {
    return `${findings.length} intelligence finding(s) surfaced overnight.`;
  }

  // Check for milestones
  const mileEvents = events.filter((e) =>
    MILESTONE_EVENTS.includes(e.event_type),
  );
  if (mileEvents.length > 0) {
    return `${mileEvents.length} milestone(s) achieved.`;
  }

  // Check for market signals
  const marketSignals = events.filter(
    (e) => e.event_type === "market.signal_detected",
  );
  if (marketSignals.length > 0) {
    return `${marketSignals.length} market signal(s) detected.`;
  }

  if (events.length === 0) {
    return "Quiet night. All systems nominal.";
  }

  return `${events.length} event(s) logged overnight.`;
}
